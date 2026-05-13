import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../stores/sessionStore'
import { formatDate, formatDuration, sessionDisplayDate } from '../lib/format'
import type { Session } from '../types'

function SessionSkeleton() {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-4 animate-pulse flex flex-col gap-3">
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-36" />
      <div className="flex gap-4">
        <div className="h-8 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  )
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className={`text-sm font-semibold truncate ${accent ? 'text-violet-600 dark:text-violet-400' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </span>
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  )
}

function SessionCard({
  session, onClick, selectMode, selected,
}: {
  session: Session
  onClick: () => void
  selectMode: boolean
  selected: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-4 flex items-start gap-3
        hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.99] transition-all
        ${selectMode && selected ? 'ring-2 ring-violet-500' : ''}`}
    >
      {selectMode && (
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center
          ${selected ? 'bg-violet-500 border-violet-500' : 'border-gray-300 dark:border-gray-600'}`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(sessionDisplayDate(session.startTimestamp, new Date(session.syncedAt)))}
          </span>
          <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
            {session.totalClimbMeters ?? 0} m ↑
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {session.attemptCount}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">prób</span>
          </div>
          <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
          <div className="flex gap-4 flex-wrap">
            <Stat value={formatDuration(session.durationS)} label="sesja" />
            <Stat value={formatDuration(session.climbTimeS)} label="wspinanie" accent />
            <Stat value={formatDuration(session.restTimeS)} label="odpoczynek" />
          </div>
        </div>
      </div>
    </button>
  )
}

export default function SessionsScreen() {
  const { sessions, isLoading, deleteSessions } = useSessionStore()
  const navigate = useNavigate()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function enterSelectMode() {
    setSelectMode(true)
    setSelected(new Set())
  }

  function cancelSelect() {
    setSelectMode(false)
    setSelected(new Set())
  }

  function toggleAll() {
    if (selected.size === sessions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sessions.map((s) => s.id!)))
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Usunąć ${selected.size} ${selected.size === 1 ? 'sesję' : 'sesje'} z lokalnej bazy danych? Tej operacji nie można cofnąć.`)) return
    setDeleting(true)
    await deleteSessions([...selected])
    setDeleting(false)
    cancelSelect()
  }

  const allSelected = sessions.length > 0 && selected.size === sessions.length

  return (
    <div className="p-4 flex flex-col gap-3 pb-32">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sesje</h2>

        {!isLoading && sessions.length > 0 && (
          selectMode ? (
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="text-sm text-gray-500 dark:text-gray-400"
              >
                {allSelected ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
              </button>
              <button
                onClick={cancelSelect}
                className="text-sm text-violet-600 dark:text-violet-400 font-medium"
              >
                Anuluj
              </button>
            </div>
          ) : (
            <button
              onClick={enterSelectMode}
              className="text-sm text-violet-600 dark:text-violet-400 font-medium"
            >
              Wybierz
            </button>
          )
        )}
      </div>

      {isLoading && (
        <>
          <SessionSkeleton />
          <SessionSkeleton />
          <SessionSkeleton />
        </>
      )}

      {!isLoading && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-4xl">🧗</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Brak sesji. Połącz urządzenie aby zsynchronizować.
          </p>
        </div>
      )}

      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          selectMode={selectMode}
          selected={selected.has(session.id!)}
          onClick={() => {
            if (selectMode) toggleSelect(session.id!)
            else navigate(`/sessions/${session.id}`)
          }}
        />
      ))}

      {/* Bottom action bar for bulk delete */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-10">
          <button
            onClick={() => void deleteSelected()}
            disabled={deleting}
            className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Usuwanie…' : `Usuń zaznaczone (${selected.size})`}
          </button>
        </div>
      )}
    </div>
  )
}
