import type { LogRecord } from '../types'
import { computeMacroStats } from '../lib/sessionProcessor'
import { getSessionIds, saveSession, saveRecords } from '../lib/db'
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

function pluralSessions(n: number): string {
  if (n === 1) return 'sesję'
  if (n < 5) return 'sesje'
  return 'sesji'
}

export async function smartSync(
  ble: BleService,
  onProgress: (p: SyncProgress) => void,
): Promise<number> {
  // Sync device clock — non-critical, ignore failure
  await ble.syncTime().catch(() => { /* ignore */ })

  onProgress({ phase: 'info', current: 0, total: 0, message: 'Pobieranie listy sesji...' })

  const info = await ble.getInfo()
  if (!info || info.lastSessionId === 0) {
    onProgress({ phase: 'done', current: 0, total: 0, message: 'Brak sesji na urządzeniu' })
    return 0
  }

  const existingIds = new Set(await getSessionIds())
  const toFetch: number[] = []
  for (let id = 1; id <= info.lastSessionId; id++) {
    if (!existingIds.has(id)) toFetch.push(id)
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
      message: `Pobieranie sesji ${sessionId} (${synced + 1} / ${toFetch.length})...`,
    })

    const records: LogRecord[] = []
    await ble.dumpHistoricalSession(sessionId, (r) => records.push(r))

    // Empty dump — flash was erased but NVS counter kept this ID.
    // Save a sentinel (durationS=0) so this ID is not re-fetched on future syncs.
    // getAllSessions() filters durationS > 0, so it stays hidden in the UI.
    if (records.length === 0) {
      await saveSession({ ...ZERO_SESSION_BASE, deviceSessionId: sessionId, syncedAt: new Date() })
      continue
    }

    const stats = computeMacroStats(records, sessionId)

    // Trivial session: all records landed in the same second (rapid test press).
    // Save as sentinel — hidden from UI, prevents re-fetch.
    if (stats.durationS === 0) {
      await saveSession({ ...stats, syncedAt: new Date() })
      continue
    }

    onProgress({
      phase: 'saving',
      current: synced,
      total: toFetch.length,
      message: `Zapisywanie sesji ${sessionId} (${records.length} rekordów)...`,
    })

    const dbId = await saveSession({ ...stats, syncedAt: new Date() })
    await saveRecords(records.map((r) => ({ ...r, sessionId: dbId })))
    synced++
  }

  onProgress({
    phase: 'done',
    current: synced,
    total: toFetch.length,
    message: `Zsynchronizowano ${synced} ${pluralSessions(synced)}`,
  })

  return synced
}
