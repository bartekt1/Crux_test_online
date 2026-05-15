import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJournalStore } from '../stores/journalStore'
import { GRADE_SYSTEMS } from '../lib/grades'
import type { Route } from '../types'

type GroupMode = 'crag' | 'date'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-violet-400 text-xs tracking-tight">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

function RouteRow({ route, onClick }: { route: Route; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between
        bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3
        hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{route.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">
            {route.grade} <span className="text-gray-400 font-normal">({GRADE_SYSTEMS[route.gradeSystem].label})</span>
          </span>
          <Stars rating={route.rating} />
        </div>
      </div>
      <span className="text-gray-400 dark:text-gray-500 text-lg">›</span>
    </button>
  )
}

export default function JournalScreen() {
  const navigate = useNavigate()
  const { routes, isLoading, load } = useJournalStore()
  const [groupMode, setGroupMode] = useState<GroupMode>('crag')

  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => {
    const sorted = [...routes].sort((a, b) =>
      groupMode === 'crag'
        ? `${a.crag}${a.name}`.localeCompare(`${b.crag}${b.name}`, 'pl')
        : b.createdAt - a.createdAt
    )

    if (groupMode === 'crag') {
      const map = new Map<string, Route[]>()
      for (const r of sorted) {
        const key = r.crag ? `${r.crag}${r.region ? ' · ' + r.region : ''}` : 'Bez skały'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(r)
      }
      return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
    } else {
      const map = new Map<string, Route[]>()
      for (const r of sorted) {
        const key = new Date(r.createdAt).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long' })
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(r)
      }
      return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
    }
  }, [routes, groupMode])

  if (isLoading) return null

  return (
    <div className="p-4 flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Dziennik</h2>
        <button
          onClick={() => navigate('/journal/new')}
          className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center
            text-white text-xl font-light hover:bg-violet-700 transition-colors"
        >
          +
        </button>
      </div>

      {routes.length > 0 && (
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {(['crag', 'date'] as GroupMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setGroupMode(mode)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                groupMode === mode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {mode === 'crag' ? 'Po skale' : 'Chronologicznie'}
            </button>
          ))}
        </div>
      )}

      {routes.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-4xl">🧗</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Brak dróg. Dodaj pierwszą przyciskiem +.
          </p>
        </div>
      )}

      {grouped.map(({ label, items }) => (
        <section key={label} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {label} ({items.length})
          </h3>
          {items.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              onClick={() => navigate(`/journal/${route.id}`)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
