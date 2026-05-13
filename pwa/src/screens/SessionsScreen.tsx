import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../stores/sessionStore'
import { formatDate, formatDuration } from '../lib/format'
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

function SessionCard({ session, onClick }: { session: Session; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-4 flex flex-col gap-3
        hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.99] transition-all"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatDate(new Date(session.syncedAt))}
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
    </button>
  )
}

export default function SessionsScreen() {
  const { sessions, isLoading } = useSessionStore()
  const navigate = useNavigate()

  return (
    <div className="p-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sesje</h2>

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
          onClick={() => navigate(`/sessions/${session.id}`)}
        />
      ))}
    </div>
  )
}
