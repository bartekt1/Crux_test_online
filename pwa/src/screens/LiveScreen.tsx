import { useEffect, useState } from 'react'
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useBleStore } from '../stores/bleStore'
import { STATE_LABEL, State } from '../types'
import type { LiveFrame } from '../types'

const STATE_STYLE: Record<number, { bg: string; text: string }> = {
  [State.IDLE]:       { bg: 'bg-gray-100 dark:bg-gray-800',        text: 'text-gray-500 dark:text-gray-400' },
  [State.RESTING]:    { bg: 'bg-blue-50 dark:bg-blue-900/30',      text: 'text-blue-600 dark:text-blue-400' },
  [State.CLIMBING]:   { bg: 'bg-violet-50 dark:bg-violet-900/30',  text: 'text-violet-600 dark:text-violet-400' },
  [State.DESCENDING]: { bg: 'bg-orange-50 dark:bg-orange-900/30',  text: 'text-orange-600 dark:text-orange-400' },
  [State.FREEFALL]:   { bg: 'bg-red-50 dark:bg-red-900/30',        text: 'text-red-600 dark:text-red-400' },
}

const MAX_FRAMES = 60

export default function LiveScreen() {
  const { isConnected, liveFrame, startLive, stopLive, connect } = useBleStore()
  const [isStreaming, setIsStreaming] = useState(false)
  const [frames, setFrames] = useState<LiveFrame[]>([])

  useEffect(() => {
    if (liveFrame) {
      setFrames((prev) => [...prev.slice(-(MAX_FRAMES - 1)), liveFrame])
    }
  }, [liveFrame])

  useEffect(() => {
    return () => stopLive()
  }, [stopLive])

  function toggleStream() {
    if (isStreaming) {
      stopLive()
      setIsStreaming(false)
    } else {
      startLive()
      setIsStreaming(true)
      setFrames([])
    }
  }

  const current = frames.at(-1) ?? liveFrame
  const state = current?.state ?? State.IDLE
  const style = STATE_STYLE[state]
  const chartData = frames.map((f, i) => ({ i, dp: f.dpRate }))
  const waitingForData = isStreaming && frames.length === 0

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[calc(100svh-7.5rem)]">
        <p className="text-gray-500 dark:text-gray-400 text-center">
          Połącz się z urządzeniem aby korzystać z podglądu live.
        </p>
        <button
          onClick={() => void connect()}
          className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors"
        >
          Połącz
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Live</h2>

      {/* State indicator */}
      <div className={`${style.bg} rounded-3xl px-6 py-8 flex flex-col items-center gap-2 transition-colors`}>
        <span className={`text-4xl font-black tracking-tight ${style.text}`}>
          {STATE_LABEL[state]}
        </span>
        <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
          {current ? `${current.dpRate > 0 ? '+' : ''}${current.dpRate.toFixed(1)}` : '—'} Pa/s
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          G-var: {current ? (current.gvRaw / 1000).toFixed(3) : '—'}
        </span>
      </div>

      {/* Chart or waiting state */}
      {waitingForData ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">Oczekiwanie na dane z urządzenia…</p>
        </div>
      ) : frames.length > 2 ? (
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
            dP — ostatnie {frames.length} pomiarów
          </p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: -30 }}>
              <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Line
                type="monotone" dataKey="dp"
                stroke="#7c3aed" strokeWidth={2}
                dot={false} isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Toggle button */}
      <button
        onClick={toggleStream}
        className={`w-full py-3.5 rounded-2xl font-semibold text-white transition-colors ${
          isStreaming ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-600 hover:bg-violet-700'
        }`}
      >
        {isStreaming ? 'Zatrzymaj podgląd' : 'Rozpocznij podgląd live'}
      </button>

      {!isStreaming && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Dane są odświeżane co 500 ms po włączeniu podglądu.
        </p>
      )}
    </div>
  )
}
