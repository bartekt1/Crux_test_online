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

    // Empty dump = session was erased from flash after FORMAT, skip
    if (records.length === 0) continue

    onProgress({
      phase: 'saving',
      current: synced,
      total: toFetch.length,
      message: `Zapisywanie sesji ${sessionId} (${records.length} rekordów)...`,
    })

    const stats = computeMacroStats(records, sessionId)
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
