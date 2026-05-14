import { useEffect, useMemo, useState } from 'react'
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

const MAX_FRAMES = 120  // 60 seconds at 2 Hz
// Frames arrive at 2 Hz → each frame ≈ 0.5 s of data
const FRAME_DT = 0.5
const PA_PER_METER = 12

export default function LiveScreen() {
  const { isConnected, liveFrame, isDeviceRecording, startLive, stopLive, connect, toggleDeviceSession } = useBleStore()
  const [isStreaming, setIsStreaming] = useState(false)
  const [frames, setFrames] = useState<LiveFrame[]>([])
  const [sessionPending, setSessionPending] = useState(false)

  useEffect(() => {
    if (liveFrame) {
      setFrames((prev) => [...prev.slice(-(MAX_FRAMES - 1)), liveFrame])
    }
  }, [liveFrame])

  useEffect(() => {
    return () => stopLive()
  }, [stopLive])

  // Cumulative altitude computed from all live frames
  const liveStats = useMemo(() => {
    let cumAlt = 0
    let totalUp = 0
    let totalDown = 0
    const altData: Array<{ i: number; alt: number }> = []

    for (let idx = 0; idx < frames.length; idx++) {
      // negative dpRate = ascending (pressure drops) → positive altitude change
      const deltaAlt = -frames[idx].dpRate * FRAME_DT / PA_PER_METER
      cumAlt += deltaAlt
      if (deltaAlt > 0.05) totalUp += deltaAlt
      else if (deltaAlt < -0.05) totalDown += Math.abs(deltaAlt)
      altData.push({ i: idx, alt: Math.round(cumAlt * 10) / 10 })
    }

    return {
      altData,
      totalUp: totalUp.toFixed(1),
      totalDown: totalDown.toFixed(1),
      currentAlt: cumAlt.toFixed(1),
    }
  }, [frames])

  function toggleStream() {
    if (isStreaming) {
      stopLive()
      setIsStreaming(false)
      setFrames([])
    } else {
      startLive()
      setIsStreaming(true)
      setFrames([])
    }
  }

  async function handleToggleSession() {
    setSessionPending(true)
    await toggleDeviceSession()
    setSessionPending(false)
  }

  const sessionButtonLabel = sessionPending
    ? 'Oczekiwanie…'
    : isDeviceRecording === true
      ? '■ Zakończ sesję na urządzeniu'
      : isDeviceRecording === false
        ? '▶ Uruchom sesję na urządzeniu'
        : '▶ / ■  Sesja na urządzeniu'

  const current = frames.at(-1) ?? liveFrame
  const state = current?.state ?? State.IDLE
  const style = STATE_STYLE[state]
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
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Live</h2>

      {/* State indicator */}
      <div className={`${style.bg} rounded-3xl px-6 py-6 flex flex-col items-center gap-3 transition-colors`}>
        <span className={`text-4xl font-black tracking-tight ${style.text}`}>
          {STATE_LABEL[state]}
        </span>

        {/* Altitude stats */}
        <div className="flex gap-6">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {isStreaming ? `+${liveStats.totalUp} m` : '— m'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">w górę</span>
          </div>
          <div className="w-px bg-gray-200 dark:bg-gray-600" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {isStreaming ? `-${liveStats.totalDown} m` : '— m'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">w dół</span>
          </div>
        </div>

        {/* G-variance — movement intensity */}
        <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          Dynamika ruchu: {current ? (current.gvRaw / 1000).toFixed(3) : '—'} σG
        </span>
      </div>

      {/* Altitude chart or waiting indicator */}
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
          <p className="text-sm text-gray-400 dark:text-gray-500">Oczekiwanie na dane…</p>
        </div>
      ) : liveStats.altData.length > 2 ? (
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
            Zmiana wysokości (m) — ostatnie {frames.length} pomiarów
          </p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={liveStats.altData} margin={{ top: 2, right: 2, bottom: 0, left: -28 }}>
              <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" unit="m" />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Line
                type="monotone" dataKey="alt"
                stroke="#7c3aed" strokeWidth={2}
                dot={false} isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Stream toggle */}
      <button
        onClick={toggleStream}
        className={`w-full py-3.5 rounded-2xl font-semibold text-white transition-colors ${
          isStreaming ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-600 hover:bg-violet-700'
        }`}
      >
        {isStreaming ? 'Zatrzymaj podgląd' : 'Rozpocznij podgląd live'}
      </button>

      {/* Session toggle on device */}
      <button
        onClick={() => void handleToggleSession()}
        disabled={sessionPending}
        className={`w-full py-3 rounded-2xl font-medium transition-colors disabled:opacity-50 ${
          isDeviceRecording
            ? 'border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            : 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        {sessionButtonLabel}
      </button>

      {!isStreaming && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Dane są odświeżane co 500 ms po włączeniu podglądu.
        </p>
      )}
    </div>
  )
}
