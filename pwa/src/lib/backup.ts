import { db, saveSession, saveRecords } from './db'
import type { BackupFile, DbRecord, Session } from '../types'

export async function exportBackup(): Promise<void> {
  const sessions = await db.sessions.toArray()
  const records = await db.records.toArray()

  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    records,
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cruxtracker-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function omitId<T extends { id?: number }>(obj: T): Omit<T, 'id'> {
  const copy = { ...obj }
  delete copy.id
  return copy as Omit<T, 'id'>
}

export async function importBackup(file: File): Promise<{ sessions: number; records: number }> {
  const text = await file.text()
  const backup: BackupFile = JSON.parse(text)

  if (backup.version !== 1) throw new Error(`Nieznana wersja backupu: ${backup.version}`)

  const existingIds = new Set(
    (await db.sessions.toArray()).map((s) => s.deviceSessionId),
  )

  const newSessions = backup.sessions.filter((s) => !existingIds.has(s.deviceSessionId))
  let importedRecords = 0

  for (const session of newSessions) {
    const oldId = session.id as number
    const sessionData: Omit<Session, 'id'> = {
      ...omitId(session),
      syncedAt: new Date(session.syncedAt),
    }
    const newDbId = await saveSession(sessionData)

    const sessionRecords: DbRecord[] = backup.records
      .filter((r) => r.sessionId === oldId)
      .map((r) => ({ ...omitId(r), sessionId: newDbId }))

    await saveRecords(sessionRecords)
    importedRecords += sessionRecords.length
  }

  return { sessions: newSessions.length, records: importedRecords }
}
