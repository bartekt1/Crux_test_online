import type { Session } from '../types'

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

function sessionDate(s: Session): Date {
  const ts = s.startTimestamp > 1_500_000_000 ? s.startTimestamp : new Date(s.syncedAt).getTime() / 1000
  return new Date(ts * 1000)
}

export interface GlobalStats {
  totalSessions: number
  totalClimbTimeH: number
  totalMeters: number
  totalAttempts: number
}

export interface MonthlyBar {
  label: string
  meters: number
  climbTimeH: number
  attempts: number
}

export interface HeatDay {
  date: string   // "2026-04-15"
  attempts: number
}

export function computeGlobalStats(sessions: Session[]): GlobalStats {
  return {
    totalSessions: sessions.length,
    totalClimbTimeH: Math.round(sessions.reduce((s, x) => s + x.climbTimeS, 0) / 360) / 10,
    totalMeters: sessions.reduce((s, x) => s + (x.totalClimbMeters ?? 0), 0),
    totalAttempts: sessions.reduce((s, x) => s + x.attemptCount, 0),
  }
}

export function computeMonthlyBars(sessions: Session[]): MonthlyBar[] {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const ms = sessions.filter(s => {
      const sd = sessionDate(s)
      return sd.getFullYear() === year && sd.getMonth() === month
    })
    return {
      label: MONTHS_PL[month],
      meters: ms.reduce((s, x) => s + (x.totalClimbMeters ?? 0), 0),
      climbTimeH: Math.round(ms.reduce((s, x) => s + x.climbTimeS, 0) / 360) / 10,
      attempts: ms.reduce((s, x) => s + x.attemptCount, 0),
    }
  })
}

export function computeHeatmap(sessions: Session[]): HeatDay[] {
  // Build attempts-per-day map
  const map = new Map<string, number>()
  for (const s of sessions) {
    const d = sessionDate(s)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + s.attemptCount)
  }

  // Start 52 weeks ago on Monday
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - 363)
  const dow = start.getDay()
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))

  const result: HeatDay[] = []
  const cur = new Date(start)
  while (cur <= today) {
    const key = cur.toISOString().slice(0, 10)
    result.push({ date: key, attempts: map.get(key) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}
