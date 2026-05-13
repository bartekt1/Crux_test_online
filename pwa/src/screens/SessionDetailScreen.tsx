import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { getSessionById, getRecordsForSession } from '../lib/db'
import { buildProcessedSession, toChartData } from '../lib/sessionProcessor'
import { formatDuration, formatElapsed, formatDate } from '../lib/format'
import { State, STATE_LABEL } from '../types'
import type { Session, LogRecord, ProcessedSession } from '../types'

// ── State timeline ──────────────────────────────────────────────────────

const STATE_BG: Record<number, string> = {
  [State.IDLE]:       'bg-gray-300 dark:bg-gray-600',
  [State.RESTING]:    'bg-blue-300 dark:bg-blue-700',
  [State.CLIMBING]:   'bg-violet-500',
  [State.DESCENDING]: 'bg-orange-400',
  [State.FREEFALL]:   'bg-red-500',
}

function StateTimeline({ records, durationS }: { records: LogRecord[]; durationS: number }) {
  if (records.length === 0 || durationS === 0) return null
  const start = records[0].timestamp_s

  // Merge consecutive same-state records into segments
  const segments: Array<{ state: number; pct: number }> = []
  let i = 0
  while (i < records.length) {
    const s = records[i].state
    let j = i + 1
    while (j < records.length && records[j].state === s) j++
    const segStart = records[i].timestamp_s - start
    const segEnd = j < records.length ? records[j].timestamp_s - start : durationS
    segments.push({ state: s, pct: ((segEnd - segStart) / durationS) * 100 })
    i = j
  }

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Oś stanów</p>
      <div className="flex h-5 rounded-full overflow-hidden">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            style={{ width: `${seg.pct}%` }}
            className={`${STATE_BG[seg.state]} shrink-0`}
            title={STATE_LABEL[seg.state as State]}
          />
        ))}
      </div>
      <div className="flex gap-3 mt-1.5 flex-wrap">
        {Object.entries(STATE_LABEL).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm ${STATE_BG[Number(k)]}`} />
            <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stat card ───────────────────────────────────────────────────────────

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-3 flex flex-col gap-0.5">
      <span className={`text-xl font-bold ${accent ? 'text-violet-600 dark:text-violet-400' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export default function SessionDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [processed, setProcessed] = useState<ProcessedSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const dbId = parseInt(id, 10)
    void (async () => {
      const s = await getSessionById(dbId)
      if (!s) { navigate('/sessions', { replace: true }); return }
      const records = await getRecordsForSession(dbId)
      setSession(s)
      setProcessed(buildProcessedSession(s, records))
      setLoading(false)
    })()
  }, [id, navigate])

  if (loading || !session || !processed) {
    return <div className="p-4 text-gray-400">Ładowanie...</div>
  }

  const chartData = toChartData(processed.records).map((d) => ({
    ...d,
    t: d.t - (processed.session.startTimestamp),
  }))

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* Back + title */}
      <div className="px-4 pt-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-violet-600 dark:text-violet-400 font-medium text-sm"
        >
          ← Wróć
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatDate(new Date(session.syncedAt))}
        </span>
      </div>

      {/* Macro stats */}
      <div className="px-4 flex gap-2">
        <StatCard value={String(session.attemptCount)} label="Próby" accent />
        <StatCard value={formatDuration(session.durationS)} label="Czas sesji" />
      </div>
      <div className="px-4 flex gap-2">
        <StatCard value={formatDuration(session.climbTimeS)} label="Wspinanie" accent />
        <StatCard value={formatDuration(session.restTimeS)} label="Odpoczynek" />
      </div>

      {/* Altitude profile chart */}
      <div className="px-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Profil wysokości (m ponad start sesji)</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="t"
              tick={{ fontSize: 10 }}
              tickFormatter={formatElapsed}
              stroke="#9ca3af"
            />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" unit="m" />
            <ReferenceLine y={0} stroke="#e5e7eb" />
            <Tooltip
              formatter={(v: unknown) => [`${(v as number).toFixed(1)} m`, 'Wysokość']}
              labelFormatter={(t: unknown) => formatElapsed(t as number)}
              contentStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone" dataKey="alt"
              stroke="#7c3aed" strokeWidth={1.5}
              dot={false} isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* State timeline */}
      <div className="px-4">
        <StateTimeline records={processed.records} durationS={session.durationS} />
      </div>

      {/* Attempt list */}
      {processed.attempts.length > 0 && (
        <div className="px-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Próby ({processed.attempts.length})
          </h3>
          {processed.attempts.map((attempt) => (
            <button
              key={attempt.attemptId}
              onClick={() => navigate(`/sessions/${id}/attempts/${attempt.attemptId}`)}
              className="w-full text-left flex items-center justify-between
                bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Próba #{attempt.attemptId}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDuration(attempt.durationS)} · max dP {attempt.maxDpRate.toFixed(1)} Pa/s
                </span>
              </div>
              <span className="text-gray-400 dark:text-gray-500">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
