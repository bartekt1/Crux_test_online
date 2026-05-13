import { create } from 'zustand'
import { getAllSessions, deleteSession as dbDeleteSession, deleteSessions as dbDeleteSessions, clearAllLocalData } from '../lib/db'
import type { Session } from '../types'

interface SessionStore {
  sessions: Session[]
  isLoading: boolean
  load: () => Promise<void>
  deleteSession: (dbId: number) => Promise<void>
  deleteSessions: (dbIds: number[]) => Promise<void>
  clearAll: () => Promise<void>
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  isLoading: true,

  load: async () => {
    set({ isLoading: true })
    try {
      const sessions = await getAllSessions()
      set({ sessions })
    } finally {
      set({ isLoading: false })
    }
  },

  deleteSession: async (dbId) => {
    await dbDeleteSession(dbId)
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== dbId) }))
  },

  deleteSessions: async (dbIds) => {
    await dbDeleteSessions(dbIds)
    const idSet = new Set(dbIds)
    set((state) => ({ sessions: state.sessions.filter((s) => !idSet.has(s.id!)) }))
  },

  clearAll: async () => {
    await clearAllLocalData()
    set({ sessions: [] })
  },
}))
