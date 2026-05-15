import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useJournalStore } from '../stores/journalStore'
import { useSessionStore } from '../stores/sessionStore'
import { GRADE_SYSTEMS } from '../lib/grades'
import { MapPinIcon, ShareIcon } from '../components/Icons'
import { formatDate, formatDuration, sessionDisplayDate } from '../lib/format'
import { ASCENT_STYLE_LABEL } from '../types'
import type { Route, Session, RouteLink } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-2xl text-violet-500">
      {'★'.repeat(rating)}
      <span className="text-gray-300 dark:text-gray-600">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

function formatAscentDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function openInMaps(lat: number, lng: number) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const url = isIOS
    ? `maps://maps.apple.com/?q=${lat},${lng}`
    : `https://maps.google.com/?q=${lat},${lng}`
  window.open(url, '_blank')
}

function linkLabel(link: RouteLink, sessions: Session[]): string {
  const s = sessions.find((s) => s.id === link.sessionId)
  const sessLabel = s ? `Sesja #${s.deviceSessionId}` : `Sesja #${link.sessionId}`
  return link.attemptId !== undefined ? `${sessLabel} · Próba #${link.attemptId}` : sessLabel
}

// ── Map tile helpers ──────────────────────────────────────────────────────

function loadTile(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function buildMapSnippet(
  lat: number, lng: number, outW: number, outH: number
): Promise<HTMLCanvasElement | null> {
  try {
    const ZOOM = 14, TS = 256
    const n = Math.pow(2, ZOOM)
    const fx = (lng + 180) / 360 * n
    const latRad = lat * Math.PI / 180
    const fy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
    const tx = Math.floor(fx), ty = Math.floor(fy)

    // 3×3 tile grid
    const tiles = await Promise.all(
      [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) =>
          loadTile(`https://tile.openstreetmap.org/${ZOOM}/${tx + dx}/${ty + dy}.png`)
            .then((img) => ({ img, dx, dy }))
        )
      )
    )

    const grid = document.createElement('canvas')
    grid.width = TS * 3; grid.height = TS * 3
    const gc = grid.getContext('2d')!
    for (const { img, dx, dy } of tiles) {
      gc.drawImage(img, (dx + 1) * TS, (dy + 1) * TS)
    }

    // Exact pixel position of our coord in the grid
    const cx = (fx - (tx - 1)) * TS
    const cy = (fy - (ty - 1)) * TS

    // Marker
    gc.fillStyle = '#7c3aed'
    gc.beginPath(); gc.arc(cx, cy, 9, 0, Math.PI * 2); gc.fill()
    gc.strokeStyle = 'white'; gc.lineWidth = 2.5
    gc.beginPath(); gc.arc(cx, cy, 9, 0, Math.PI * 2); gc.stroke()

    // Crop around center
    const out = document.createElement('canvas')
    out.width = outW; out.height = outH
    const oc = out.getContext('2d')!
    oc.drawImage(grid, cx - outW / 2, cy - outH / 2, outW, outH, 0, 0, outW, outH)
    return out
  } catch {
    return null
  }
}

// ── Share card ────────────────────────────────────────────────────────────

async function buildShareCard(route: Route, allSessions: Session[]): Promise<Blob> {
  const W = 800, H = 500
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches

  ctx.fillStyle = dark ? '#111827' : '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#7c3aed'
  ctx.fillRect(0, 0, W, 6)

  const PAD = 44
  let y = 72

  // Name
  ctx.fillStyle = dark ? '#f9fafb' : '#111827'
  ctx.font = 'bold 38px system-ui, sans-serif'
  ctx.fillText(route.name.length > 32 ? route.name.slice(0, 29) + '...' : route.name, PAD, y)
  y += 42

  // Crag · Region
  const sub = [route.crag, route.region].filter(Boolean).join(' · ')
  if (sub) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = '21px system-ui, sans-serif'
    ctx.fillText(sub, PAD, y)
    y += 32
  }
  y += 6

  // Grade + Stars
  ctx.fillStyle = '#7c3aed'
  ctx.font = 'bold 23px system-ui, sans-serif'
  ctx.fillText(`${route.grade}  (${GRADE_SYSTEMS[route.gradeSystem].label})`, PAD, y)
  ctx.fillStyle = '#a78bfa'
  ctx.font = '23px system-ui, sans-serif'
  ctx.fillText('★'.repeat(route.rating) + '☆'.repeat(5 - route.rating), PAD + 240, y)
  y += 30

  // Ascent style
  if (route.ascentStyle) {
    ctx.fillStyle = '#6d28d9'
    ctx.font = '19px system-ui, sans-serif'
    ctx.fillText(ASCENT_STYLE_LABEL[route.ascentStyle], PAD, y)
    y += 28
  }

  // Date
  if (route.ascentDate) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = '19px system-ui, sans-serif'
    ctx.fillText(formatAscentDate(route.ascentDate), PAD, y)
    y += 28
  }
  y += 6

  // Notes
  if (route.notes) {
    ctx.fillStyle = dark ? '#d1d5db' : '#4b5563'
    ctx.font = 'italic 18px system-ui, sans-serif'
    const note = route.notes.length > 72 ? route.notes.slice(0, 69) + '...' : route.notes
    ctx.fillText(`"${note}"`, PAD, y)
    y += 30
  }
  y += 4

  // ── Bottom zone: coords+sessions left, map right ──────────────────────
  const MAP_W = 220, MAP_H = 145
  const MAP_X = W - MAP_W - 40
  const MAP_Y = Math.min(y, H - MAP_H - 50)

  // Map snippet
  if (route.lat !== undefined) {
    const mapCanvas = await buildMapSnippet(route.lat, route.lng!, MAP_W, MAP_H)
    if (mapCanvas) {
      ctx.save()
      // Rounded clip
      const r = 8
      ctx.beginPath()
      ctx.moveTo(MAP_X + r, MAP_Y)
      ctx.lineTo(MAP_X + MAP_W - r, MAP_Y)
      ctx.arcTo(MAP_X + MAP_W, MAP_Y, MAP_X + MAP_W, MAP_Y + r, r)
      ctx.lineTo(MAP_X + MAP_W, MAP_Y + MAP_H - r)
      ctx.arcTo(MAP_X + MAP_W, MAP_Y + MAP_H, MAP_X + MAP_W - r, MAP_Y + MAP_H, r)
      ctx.lineTo(MAP_X + r, MAP_Y + MAP_H)
      ctx.arcTo(MAP_X, MAP_Y + MAP_H, MAP_X, MAP_Y + MAP_H - r, r)
      ctx.lineTo(MAP_X, MAP_Y + r)
      ctx.arcTo(MAP_X, MAP_Y, MAP_X + r, MAP_Y, r)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(mapCanvas, MAP_X, MAP_Y)
      ctx.restore()

      ctx.strokeStyle = dark ? '#374151' : '#e5e7eb'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(MAP_X + r, MAP_Y)
      ctx.lineTo(MAP_X + MAP_W - r, MAP_Y)
      ctx.arcTo(MAP_X + MAP_W, MAP_Y, MAP_X + MAP_W, MAP_Y + r, r)
      ctx.lineTo(MAP_X + MAP_W, MAP_Y + MAP_H - r)
      ctx.arcTo(MAP_X + MAP_W, MAP_Y + MAP_H, MAP_X + MAP_W - r, MAP_Y + MAP_H, r)
      ctx.lineTo(MAP_X + r, MAP_Y + MAP_H)
      ctx.arcTo(MAP_X, MAP_Y + MAP_H, MAP_X, MAP_Y + MAP_H - r, r)
      ctx.lineTo(MAP_X, MAP_Y + r)
      ctx.arcTo(MAP_X, MAP_Y, MAP_X + r, MAP_Y, r)
      ctx.closePath()
      ctx.stroke()
    }

    // Coordinates under/left of map
    ctx.fillStyle = '#9ca3af'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText(`${route.lat.toFixed(5)}° N`, PAD, MAP_Y + 24)
    ctx.fillText(`${route.lng!.toFixed(5)}° E`, PAD, MAP_Y + 44)
  }

  // Linked sessions / attempts info
  const sessionLinks = route.links.filter((l) => l.attemptId === undefined)
  const attemptLinks = route.links.filter((l) => l.attemptId !== undefined)
  let infoY = route.lat !== undefined ? MAP_Y + 70 : MAP_Y + 24

  if (sessionLinks.length > 0) {
    const linked = allSessions.filter((s) => sessionLinks.some((l) => l.sessionId === s.id))
    const totalAttempts = linked.reduce((sum, s) => sum + s.attemptCount, 0)
    const totalClimbMin = Math.round(linked.reduce((sum, s) => sum + s.climbTimeS, 0) / 60)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText(`${linked.length} sesj${linked.length === 1 ? 'a' : linked.length < 5 ? 'e' : 'i'} · ${totalAttempts} prób · ${totalClimbMin} min`, PAD, infoY)
    infoY += 24
  }
  if (attemptLinks.length > 0) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText(`${attemptLinks.length} prób${attemptLinks.length < 5 ? 'y' : ''} z dziennika`, PAD, infoY)
  }

  // Footer
  ctx.fillStyle = dark ? '#374151' : '#d1d5db'
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('CruxTracker', PAD, H - 14)
  ctx.fillText('© OpenStreetMap', W - 160, H - 14)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  )
}

// ── Share text ────────────────────────────────────────────────────────────

async function shareText(route: Route, allSessions: Session[]) {
  const stars = '★'.repeat(route.rating) + '☆'.repeat(5 - route.rating)
  const lines: string[] = [
    `🧗 ${route.name}`,
    [route.crag, route.region].filter(Boolean).join(' · '),
    `${route.grade} (${GRADE_SYSTEMS[route.gradeSystem].label})  ${stars}`,
  ]
  if (route.ascentStyle) lines.push(ASCENT_STYLE_LABEL[route.ascentStyle])
  if (route.ascentDate) lines.push(formatAscentDate(route.ascentDate))
  if (route.notes) lines.push(`"${route.notes}"`)

  const sessionLinks = route.links.filter((l) => l.attemptId === undefined)
  if (sessionLinks.length > 0) {
    const linked = allSessions.filter((s) => sessionLinks.some((l) => l.sessionId === s.id))
    const totalAttempts = linked.reduce((sum, s) => sum + s.attemptCount, 0)
    const totalClimbMin = Math.round(linked.reduce((sum, s) => sum + s.climbTimeS, 0) / 60)
    lines.push(`${linked.length} sesj${linked.length === 1 ? 'a' : linked.length < 5 ? 'e' : 'i'} · ${totalAttempts} prób · ${totalClimbMin} min wspinania`)
  }
  const attemptLinks = route.links.filter((l) => l.attemptId !== undefined)
  if (attemptLinks.length > 0) {
    lines.push(`${attemptLinks.length} prób z dziennika`)
  }
  if (route.lat !== undefined) {
    lines.push(`📍 ${route.lat.toFixed(5)}°N, ${route.lng!.toFixed(5)}°E`)
    lines.push(`https://maps.google.com/?q=${route.lat},${route.lng}`)
  }

  await navigator.share({ title: route.name, text: lines.filter(Boolean).join('\n') })
}

async function shareImage(route: Route, allSessions: Session[]) {
  const blob = await buildShareCard(route, allSessions)
  const file = new File([blob], `${route.name}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: route.name })
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${route.name}.png`; a.click()
    URL.revokeObjectURL(url)
  }
}

// ── Main component ────────────────────────────────────────────────────────

export default function JournalDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { routes, deleteRoute, removeLink } = useJournalStore()
  const { sessions: allSessions } = useSessionStore()

  const route: Route | undefined = routes.find((r) => r.id === Number(id))

  useEffect(() => {
    if (!route && routes.length > 0) navigate('/journal', { replace: true })
  }, [route, routes.length, navigate])

  if (!route) return null

  async function handleDelete() {
    if (!confirm(`Usunąć drogę "${route!.name}"?`)) return
    await deleteRoute(route!.id!)
    navigate('/journal', { replace: true })
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Header */}
      <div className="px-4 pt-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-violet-600 dark:text-violet-400 font-medium text-sm">
          ← Wróć
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/journal/${id}/edit`)}
            className="text-violet-600 dark:text-violet-400 text-sm font-medium"
          >
            Edytuj
          </button>
          <button
            onClick={() => void handleDelete()}
            className="text-red-500 dark:text-red-400 text-sm font-medium"
          >
            Usuń
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="px-4 flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{route.name}</h2>
        {(route.crag || route.region) && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {[route.crag, route.region].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300
            text-sm font-semibold px-3 py-1 rounded-full">
            {route.grade}{' '}
            <span className="font-normal opacity-70">({GRADE_SYSTEMS[route.gradeSystem].label})</span>
          </span>
          {route.ascentStyle && (
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400
              text-sm px-3 py-1 rounded-full">
              {ASCENT_STYLE_LABEL[route.ascentStyle]}
            </span>
          )}
          <Stars rating={route.rating} />
        </div>
        {route.ascentDate && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {formatAscentDate(route.ascentDate)}
          </p>
        )}
      </div>

      {/* Notatki */}
      {route.notes && (
        <div className="mx-4 bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
            Notatki
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {route.notes}
          </p>
        </div>
      )}

      {/* Lokalizacja */}
      {route.lat !== undefined && (
        <div className="mx-4 bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPinIcon className="w-4 h-4 text-violet-500" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Lokalizacja
              </p>
              <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                {route.lat.toFixed(5)}° N,&nbsp;{route.lng!.toFixed(5)}° E
              </p>
            </div>
          </div>
          <button
            onClick={() => openInMaps(route.lat!, route.lng!)}
            className="bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg
              hover:bg-violet-700 transition-colors"
          >
            Otwórz mapę
          </button>
        </div>
      )}

      {/* Powiązane sesje i próby */}
      <div className="px-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Sesje i próby ({route.links.length})
          </h3>
          <button
            onClick={() => navigate(`/journal/${id}/edit`)}
            className="text-violet-600 dark:text-violet-400 text-xs font-semibold"
          >
            Zarządzaj
          </button>
        </div>
        {route.links.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Brak powiązanych sesji lub prób.</p>
        )}
        {route.links.map((link, i) => {
          const session = allSessions.find((s) => s.id === link.sessionId)
          return (
            <div
              key={i}
              className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3"
            >
              <button
                onClick={() => session && navigate(`/sessions/${session.id}`)}
                className="flex flex-col text-left"
              >
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {linkLabel(link, allSessions)}
                </span>
                {session && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(sessionDisplayDate(session.startTimestamp, new Date(session.syncedAt)))}
                    {link.attemptId === undefined && ` · ${session.attemptCount} prób · ${formatDuration(session.climbTimeS)} wspinania`}
                  </span>
                )}
              </button>
              <button
                onClick={() => void removeLink(route.id!, link)}
                className="text-gray-400 hover:text-red-400 transition-colors px-2 text-xs"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Udostępnij */}
      {!!navigator.share && (
        <div className="px-4 flex gap-2">
          <button
            onClick={() => void shareText(route, allSessions)}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800
              rounded-xl py-3 text-sm font-medium text-gray-700 dark:text-gray-300
              hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ShareIcon className="w-4 h-4" />
            Tekst
          </button>
          <button
            onClick={() => void shareImage(route, allSessions)}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600
              rounded-xl py-3 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
          >
            <ShareIcon className="w-4 h-4" />
            Obrazek
          </button>
        </div>
      )}
    </div>
  )
}
