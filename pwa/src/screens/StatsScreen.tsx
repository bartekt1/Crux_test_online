import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { useSessionStore } from '../stores/sessionStore'
import { computeGlobalStats, computeMonthlyBars, computeHeatmap } from '../lib/statsProcessor'

function heatColor(attempts: number): string {
  if (attempts === 0) return 'bg-gray-100 dark:bg-gray-800'
  if (attempts <= 2) return 'bg-violet-200 dark:bg-violet-800'
  if (attempts <= 5) return 'bg-violet-400 dark:bg-violet-600'
  return 'bg-violet-600 dark:bg-violet-400'
}

const DAY_LABELS = ['pon', '', 'śr', '', 'pt', '', 'nd']

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xl font-bold text-violet-600 dark:text-violet-400">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  )
}

export default function StatsScreen() {
  const { sessions } = useSessionStore()

  const global = useMemo(() => computeGlobalStats(sessions), [sessions])
  const monthly = useMemo(() => computeMonthlyBars(sessions), [sessions])
  const heatDays = useMemo(() => computeHeatmap(sessions), [sessions])

  // Group heatmap days into weeks (columns)
  const weeks = useMemo(() => {
    const result: typeof heatDays[] = []
    for (let i = 0; i < heatDays.length; i += 7) {
      result.push(heatDays.slice(i, i + 7))
    }
    return result
  }, [heatDays])

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-4 text-center">
        <p className="text-4xl">📊</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Brak danych. Zsynchronizuj sesje aby zobaczyć statystyki.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-6 pb-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Statystyki</h2>

      {/* Totals */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Łącznie
        </h3>
        <div className="flex gap-2">
          <StatTile value={String(global.totalSessions)} label="sesji" />
          <StatTile value={`${global.totalClimbTimeH} h`} label="wspinania" />
        </div>
        <div className="flex gap-2">
          <StatTile value={`${global.totalMeters} m`} label="w górę" />
          <StatTile value={String(global.totalAttempts)} label="prób" />
        </div>
      </section>

      {/* Heatmap */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Aktywność — ostatnie 52 tygodnie
        </h3>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] shrink-0 pt-0.5">
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="w-6 h-3 flex items-center justify-end">
                <span className="text-[9px] text-gray-400 dark:text-gray-600 leading-none">{label}</span>
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.attempts} prób`}
                    className={`w-3 h-3 rounded-sm ${heatColor(day.attempts)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">mniej</span>
          {[0, 1, 3, 6].map((n) => (
            <div key={n} className={`w-3 h-3 rounded-sm ${heatColor(n)}`} />
          ))}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">więcej</span>
        </div>
      </section>

      {/* Monthly meters */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Metry w górę per miesiąc
        </h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" unit="m" />
            <Tooltip
              formatter={(v: unknown) => [`${v} m`, 'Metry']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="meters" fill="#7c3aed" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Monthly climb time */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Czas wspinania per miesiąc
        </h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" unit="h" />
            <Tooltip
              formatter={(v: unknown) => [`${v} h`, 'Wspinanie']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="climbTimeH" fill="#a78bfa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}
