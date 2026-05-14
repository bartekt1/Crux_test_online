import Dexie, { type Table } from 'dexie'
import type { Session, DbRecord } from '../types'

class CruxDb extends Dexie {
  sessions!: Table<Session>
  records!: Table<DbRecord>

  constructor() {
    super('cruxtracker')
    this.version(1).stores({
      sessions: '++id, deviceSessionId, syncedAt',
      records: '++id, sessionId, state, attempt_id',
    })
    // v2: added startTimestamp index (required for orderBy in getAllSessions)
    this.version(2).stores({
      sessions: '++id, deviceSessionId, syncedAt, startTimestamp',
      records: '++id, sessionId, state, attempt_id',
    })
  }
}

export const db = new CruxDb()

export async function getSessionIds(): Promise<number[]> {
  const sessions = await db.sessions.toArray()
  return sessions.map((s) => s.deviceSessionId)
}

export async function saveSession(session: Omit<Session, 'id'>): Promise<number> {
  return db.sessions.add(session)
}

export async function saveRecords(records: DbRecord[]): Promise<void> {
  await db.records.bulkAdd(records)
}

export async function getAllSessions(): Promise<Session[]> {
  // Sessions with durationS === 0 are sentinels — hidden from UI but kept so
  // getSessionIds() won't re-fetch them after flash erase.
  // Sort: real Unix timestamps (> 1.5B, synced firmware) desc, then by deviceSessionId desc
  // for old boot-relative ones — both produce newest-first order in practice.
  const all = await db.sessions
    .orderBy('deviceSessionId').reverse()
    .filter((s) => s.durationS > 0)
    .toArray()

  return all.sort((a, b) => {
    const aDate = a.startTimestamp > 1_500_000_000 ? a.startTimestamp : 0
    const bDate = b.startTimestamp > 1_500_000_000 ? b.startTimestamp : 0
    if (aDate !== bDate) return bDate - aDate
    return b.deviceSessionId - a.deviceSessionId
  })
}

export async function getSessionById(id: number): Promise<Session | undefined> {
  return db.sessions.get(id)
}

export async function getSessionByDeviceId(deviceSessionId: number): Promise<Session | undefined> {
  return db.sessions.where('deviceSessionId').equals(deviceSessionId).first()
}

export async function getRecordsForSession(sessionId: number): Promise<DbRecord[]> {
  return db.records.where('sessionId').equals(sessionId).sortBy('timestamp_s')
}

export async function deleteSession(sessionDbId: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.records, async () => {
    await db.records.where('sessionId').equals(sessionDbId).delete()
    await db.sessions.delete(sessionDbId)
  })
}

export async function deleteSessions(sessionDbIds: number[]): Promise<void> {
  await db.transaction('rw', db.sessions, db.records, async () => {
    for (const id of sessionDbIds) {
      await db.records.where('sessionId').equals(id).delete()
      await db.sessions.delete(id)
    }
  })
}

// Wipe all local session data — call after FORMAT so the local cache
// reflects the now-empty device flash.
export async function clearAllLocalData(): Promise<void> {
  await db.transaction('rw', db.sessions, db.records, async () => {
    await db.sessions.clear()
    await db.records.clear()
  })
}
