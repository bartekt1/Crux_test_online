import type { LogRecord } from '../types'
import { computeMacroStats } from '../lib/sessionProcessor'
import { db, getSessionByDeviceId, saveSession, saveRecords, deleteSession } from '../lib/db'
import type { BleService } from './bleService'

export interface SyncProgress {
  phase: 'info' | 'dumping' | 'saving' | 'done' | 'error'
  current: number
  total: number
  message: string
}

const ZERO_SESSION_BASE = {
  startTimestamp: 0, endTimestamp: 0, durationS: 0,
  attemptCount: 0, climbTimeS: 0, restTimeS: 0,
  recordCount: 0, totalClimbMeters: 0,
} as const

// Sessions synced within this window are re-checked — they may have been
// captured while the session was still active (auto-sync on connect).
const RECHECK_WINDOW_MS = 24 * 60 * 60 * 1000  // 24 hours

function pluralSessions(n: number): string {
  if (n === 1) return 'sesję'
  if (n < 5) return 'sesje'
  return 'sesji'
}

export async function smartSync(
  ble: BleService,
  onProgress: (p: SyncProgress) => void,
): Promise<number> {
  await ble.syncTime().catch(() => { /* non-critical */ })

  onProgress({ phase: 'info', current: 0, total: 0, message: 'Pobieranie listy sesji...' })

  const info = await ble.getInfo()
  if (!info || info.lastSessionId === 0) {
    onProgress({ phase: 'done', current: 0, total: 0, message: 'Brak sesji na urządzeniu' })
    return 0
  }

  // Build map: deviceSessionId → {dbId, recordCount, syncedAt}
  const now = Date.now()
  const storedSessions = await db.sessions.toArray()
  const storedMap = new Map(
    storedSessions.map((s) => [s.deviceSessionId, s])
  )

  const toFetch: number[] = []
  for (let id = 1; id <= info.lastSessionId; id++) {
    const stored = storedMap.get(id)
    if (!stored) {
      toFetch.push(id)  // never synced
      continue
    }
    // Re-check sessions synced recently — may have been captured mid-session
    const syncAge = now - new Date(stored.syncedAt).getTime()
    if (syncAge < RECHECK_WINDOW_MS) {
      toFetch.push(id)
    }
  }

  if (toFetch.length === 0) {
    onProgress({ phase: 'done', current: 0, total: 0, message: 'Wszystko zsynchronizowane' })
    return 0
  }

  let synced = 0

  for (const sessionId of toFetch) {
    onProgress({
      phase: 'dumping',
      current: synced,
      total: toFetch.length,
      message: `Sprawdzanie sesji ${sessionId} (${synced + 1} / ${toFetch.length})...`,
    })

    const records: LogRecord[] = []
    await ble.dumpHistoricalSession(sessionId, (r) => records.push(r))

    console.log(`[SYNC] session ${sessionId}: dump returned ${records.length} records`)
    if (records.length > 0) {
      console.log(`[SYNC] first ts=${records[0].timestamp_s}, last ts=${records[records.length - 1].timestamp_s}, diff=${records[records.length - 1].timestamp_s - records[0].timestamp_s}s`)
    }

    const existing = await getSessionByDeviceId(sessionId)
    console.log(`[SYNC] existing in DB: ${existing ? `id=${existing.id} recordCount=${existing.recordCount} durationS=${existing.durationS}` : 'none'}`)

    // Empty dump — save sentinel so this ID is not re-fetched indefinitely
    if (records.length === 0) {
      if (!existing) {
        await saveSession({ ...ZERO_SESSION_BASE, deviceSessionId: sessionId, syncedAt: new Date() })
      }
      continue
    }

    // No new records compared to what we have → already up-to-date
    if (existing && records.length <= existing.recordCount) continue

    const stats = computeMacroStats(records, sessionId)

    // Trivial session (rapid test press) → save as hidden sentinel
    if (stats.durationS === 0) {
      if (!existing) await saveSession({ ...stats, syncedAt: new Date() })
      continue
    }

    onProgress({
      phase: 'saving',
      current: synced,
      total: toFetch.length,
      message: `Zapisywanie sesji ${sessionId} (${records.length} rekordów)...`,
    })

    if (existing?.id !== undefined) {
      await deleteSession(existing.id)
    }

    const dbId = await saveSession({ ...stats, syncedAt: new Date() })
    await saveRecords(records.map((r) => ({ ...r, sessionId: dbId })))
    synced++
  }

  onProgress({
    phase: 'done',
    current: synced,
    total: toFetch.length,
    message: synced > 0
      ? `Zsynchronizowano ${synced} ${pluralSessions(synced)}`
      : 'Wszystko zsynchronizowane',
  })

  return synced
}
