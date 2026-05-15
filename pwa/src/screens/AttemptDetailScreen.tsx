import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { getRecordsForSession } from '../lib/db'
import { extractAttempts } from '../lib/sessionProcessor'
import { formatDuration, formatElapsed } from '../lib/format'
import { decode } from '../lib/bleParser'
import type { Attempt } from '../types'

export default function AttemptDetailScreen() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !attemptId) return
    const dbId = parseInt(id, 10)
    const aId = parseInt(attemptId, 10)
    void (async () => {
      const records = await getRecordsForSession(dbId)
      const attempts = extractAttempts(records)
      const found = attempts.find((a) => a.attemptId === aId)
      setAttempt(found ?? null)
      setLoading(false)
    })()
  }, [id, attemptId])

  if (loading) return <div className="p-4 text-gray-400">Ładowanie...</div>
  if (!attempt) return <div className="p-4 text-gray-400">Próba nie znaleziona.</div>

  const startTs = attempt.startTimestamp
  const chartData = attempt.records.map((r) => ({
    t: r.timestamp_s - startTs,
    speed: decode.speedMPerMin(r.dpRateX100),
    alt: decode.altMeters(r.pressRelX10),
  }))

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="px-4 pt-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-violet-600 dark:text-violet-400 font-medium text-sm"
        >
          ← Wróć
        </button>
        <span className="text-base font-bold text-gray-900 dark:text-white">
          Próba #{attempt.attemptId}
        </span>
      </div>

      {/* Stats */}
      <div className="px-4 flex gap-2">
        <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-3">
          <p className="text-xl font-bold text-violet-600 dark:text-violet-400">
            {formatDuration(attempt.durationS)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Czas wspinania</p>
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-3">
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {attempt.avgSpeedMPerMin.toFixed(1)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Śr. prędkość (m/min)</p>
        </div>
      </div>
      <div className="px-4 flex gap-2">
        <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-3">
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {decode.altMeters(attempt.minPressRel * 10).toFixed(1)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Wysokość (m)</p>
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-3">
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {attempt.records.length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Rekordów</p>
        </div>
      </div>

      {/* Speed chart */}
      <div className="px-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Prędkość wspinania (m/min)</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="t" tick={{ fontSize: 10 }} tickFormatter={formatElapsed} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" unit="m/min" />
            <ReferenceLine y={0} stroke="#e5e7eb" />
            <Tooltip
              formatter={(v: unknown) => [`${(v as number).toFixed(1)} m/min`, 'Prędkość']}
              labelFormatter={(t: unknown) => formatElapsed(t as number)}
              contentStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="speed" stroke="#7c3aed" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Altitude chart */}
      <div className="px-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Wysokość (m ponad start próby)</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="t" tick={{ fontSize: 10 }} tickFormatter={formatElapsed} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" unit="m" />
            <ReferenceLine y={0} stroke="#e5e7eb" />
            <Line type="monotone" dataKey="alt" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
