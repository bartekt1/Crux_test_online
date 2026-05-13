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
  return db.sessions.orderBy('startTimestamp').reverse().toArray()
}

export async function getSessionById(id: number): Promise<Session | undefined> {
  return db.sessions.get(id)
}

export async function getRecordsForSession(sessionId: number): Promise<DbRecord[]> {
  return db.records.where('sessionId').equals(sessionId).sortBy('timestamp_s')
}

export async function deleteSession(sessionDbId: number): Promise<void> {
  const session = await db.sessions.get(sessionDbId)
  if (!session) return
  await db.records.where('sessionId').equals(sessionDbId).delete()
  await db.sessions.delete(sessionDbId)
}
