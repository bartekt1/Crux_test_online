import Dexie, { type Table } from 'dexie'
import type { Session, DbRecord, Route, RouteLink } from '../types'

class CruxDb extends Dexie {
  sessions!: Table<Session>
  records!: Table<DbRecord>
  routes!: Table<Route>

  constructor() {
    super('cruxtracker')
    this.version(1).stores({
      sessions: '++id, deviceSessionId, syncedAt',
      records: '++id, sessionId, state, attempt_id',
    })
    this.version(2).stores({
      sessions: '++id, deviceSessionId, syncedAt, startTimestamp',
      records: '++id, sessionId, state, attempt_id',
    })
    this.version(3).stores({
      sessions: '++id, deviceSessionId, syncedAt, startTimestamp',
      records: '++id, sessionId, state, attempt_id',
      routes: '++id, createdAt, crag, region',
    })
    // v4: sessionIds[] → links: RouteLink[]; added ascentStyle
    this.version(4).stores({
      sessions: '++id, deviceSessionId, syncedAt, startTimestamp',
      records: '++id, sessionId, state, attempt_id',
      routes: '++id, createdAt, crag, region',
    }).upgrade(async (tx) => {
      await tx.table('routes').toCollection().modify((r: Record<string, unknown>) => {
        if (Array.isArray(r['sessionIds'])) {
          r['links'] = (r['sessionIds'] as number[]).map((id) => ({ sessionId: id }))
          delete r['sessionIds']
        }
        if (!Array.isArray(r['links'])) r['links'] = []
      })
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

export async function updateSessionNotes(sessionDbId: number, notes: string): Promise<void> {
  await db.sessions.update(sessionDbId, { notes })
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

export async function getAllRoutes(): Promise<Route[]> {
  return db.routes.orderBy('createdAt').reverse().toArray()
}

export async function getRouteById(id: number): Promise<Route | undefined> {
  return db.routes.get(id)
}

export async function saveRoute(route: Omit<Route, 'id'>): Promise<number> {
  return db.routes.add(route)
}

export async function updateRoute(id: number, changes: Partial<Route>): Promise<void> {
  await db.routes.update(id, changes)
}

export async function deleteRoute(id: number): Promise<void> {
  await db.routes.delete(id)
}

export async function getRouteForSession(sessionId: number): Promise<Route | undefined> {
  const routes = await db.routes.toArray()
  return routes.find((r) => r.links.some((l) => l.sessionId === sessionId))
}

export async function updateRouteLinks(id: number, links: RouteLink[]): Promise<void> {
  await db.routes.update(id, { links })
}
