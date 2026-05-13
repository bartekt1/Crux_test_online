import { create } from 'zustand'
import { getAllSessions, deleteSession as dbDeleteSession } from '../lib/db'
import type { Session } from '../types'

interface SessionStore {
  sessions: Session[]
  isLoading: boolean
  load: () => Promise<void>
  deleteSession: (dbId: number) => Promise<void>
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
}))
