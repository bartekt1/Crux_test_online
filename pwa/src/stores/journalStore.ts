import { create } from 'zustand'
import {
  getAllRoutes,
  saveRoute as dbSaveRoute,
  updateRoute as dbUpdateRoute,
  deleteRoute as dbDeleteRoute,
  updateRouteLinks,
} from '../lib/db'
import type { Route, RouteLink } from '../types'

interface JournalStore {
  routes: Route[]
  isLoading: boolean
  load: () => Promise<void>
  addRoute: (route: Omit<Route, 'id'>) => Promise<number>
  updateRoute: (id: number, changes: Partial<Route>) => Promise<void>
  deleteRoute: (id: number) => Promise<void>
  addLink: (routeId: number, link: RouteLink) => Promise<void>
  removeLink: (routeId: number, link: RouteLink) => Promise<void>
}

function linksEqual(a: RouteLink, b: RouteLink): boolean {
  return a.sessionId === b.sessionId && a.attemptId === b.attemptId
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  routes: [],
  isLoading: true,

  load: async () => {
    set({ isLoading: true })
    try {
      const routes = await getAllRoutes()
      set({ routes })
    } finally {
      set({ isLoading: false })
    }
  },

  addRoute: async (route) => {
    const id = await dbSaveRoute(route)
    const routes = await getAllRoutes()
    set({ routes })
    return id
  },

  updateRoute: async (id, changes) => {
    await dbUpdateRoute(id, changes)
    set((state) => ({
      routes: state.routes.map((r) => (r.id === id ? { ...r, ...changes } : r)),
    }))
  },

  deleteRoute: async (id) => {
    await dbDeleteRoute(id)
    set((state) => ({ routes: state.routes.filter((r) => r.id !== id) }))
  },

  addLink: async (routeId, link) => {
    const route = get().routes.find((r) => r.id === routeId)
    if (!route || route.links.some((l) => linksEqual(l, link))) return
    const links = [...route.links, link]
    await updateRouteLinks(routeId, links)
    set((state) => ({
      routes: state.routes.map((r) => (r.id === routeId ? { ...r, links } : r)),
    }))
  },

  removeLink: async (routeId, link) => {
    const route = get().routes.find((r) => r.id === routeId)
    if (!route) return
    const links = route.links.filter((l) => !linksEqual(l, link))
    await updateRouteLinks(routeId, links)
    set((state) => ({
      routes: state.routes.map((r) => (r.id === routeId ? { ...r, links } : r)),
    }))
  },
}))
