import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useJournalStore } from '../stores/journalStore'
import { useSessionStore } from '../stores/sessionStore'
import { GRADE_SYSTEMS } from '../lib/grades'
import { getRecordsForSession } from '../lib/db'
import { buildProcessedSession } from '../lib/sessionProcessor'
import { formatDate, formatDuration, sessionDisplayDate } from '../lib/format'
import { LocateIcon } from '../components/Icons'
import { ASCENT_STYLE_LABEL } from '../types'
import type { GradeSystem, AscentStyle, Route, RouteLink, Attempt, Session } from '../types'

// ── Map picker ───────────────────────────────────────────────────────────

const PIN_ICON = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#7c3aed;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function LocationPicker({
  lat, lng, mapKey, onChange,
}: {
  lat: number; lng: number; mapKey: number
  onChange: (lat: number, lng: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView([lat, lng], 13)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map)
    const marker = L.marker([lat, lng], { icon: PIN_ICON, draggable: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      onChangeRef.current(p.lat, p.lng)
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      onChangeRef.current(e.latlng.lat, e.latlng.lng)
    })
    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey])

  function centerOnGps() {
    if (!navigator.geolocation || !mapRef.current) return
    navigator.geolocation.getCurrentPosition((pos) => {
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15)
    })
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-52 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
      />
      <button
        onClick={centerOnGps}
        title="Centruj na mojej lokalizacji"
        className="absolute bottom-2 right-2 z-[1000] bg-white dark:bg-gray-800 rounded-lg p-1.5
          shadow-md text-violet-600 dark:text-violet-400 hover:bg-gray-50 dark:hover:bg-gray-700
          transition-colors border border-gray-200 dark:border-gray-700"
      >
        <LocateIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Link picker modal ────────────────────────────────────────────────────

function isSessionLinked(links: RouteLink[], sessionId: number): boolean {
  return links.some((l) => l.sessionId === sessionId && l.attemptId === undefined)
}

function isAttemptLinked(links: RouteLink[], sessionId: number, attemptId: number): boolean {
  return links.some((l) => l.sessionId === sessionId && l.attemptId === attemptId)
}

function LinkPickerModal({
  links,
  allSessions,
  onAdd,
  onRemove,
  onClose,
}: {
  links: RouteLink[]
  allSessions: Session[]
  onAdd: (link: RouteLink) => void
  onRemove: (link: RouteLink) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [attemptsMap, setAttemptsMap] = useState<Record<number, Attempt[]>>({})
  const [loading, setLoading] = useState<number | null>(null)

  async function toggleExpand(session: Session) {
    const sid = session.id!
    if (expanded === sid) { setExpanded(null); return }
    setExpanded(sid)
    if (!attemptsMap[sid]) {
      setLoading(sid)
      const records = await getRecordsForSession(sid)
      const processed = buildProcessedSession(session, records)
      setAttemptsMap((m) => ({ ...m, [sid]: processed.attempts }))
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8
        max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Dodaj sesję lub próbę</h3>
          <button onClick={onClose} className="text-gray-400 text-lg">✕</button>
        </div>
        {allSessions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            Brak sesji do przypisania.
          </p>
        ) : (
          <div className="overflow-y-auto flex flex-col gap-2">
            {allSessions.map((s) => {
              const sid = s.id!
              const sessionLinked = isSessionLinked(links, sid)
              const isExpanded = expanded === sid
              const attempts = attemptsMap[sid]
              return (
                <div key={sid} className="flex flex-col">
                  <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 gap-2">
                    <div className="flex-1 flex flex-col">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        Sesja #{s.deviceSessionId}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(sessionDisplayDate(s.startTimestamp, new Date(s.syncedAt)))} · {s.attemptCount} prób
                      </span>
                    </div>
                    <button
                      onClick={() => sessionLinked
                        ? onRemove({ sessionId: sid })
                        : onAdd({ sessionId: sid })}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                        sessionLinked
                          ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {sessionLinked ? '✓ Cała' : 'Cała sesja'}
                    </button>
                    {s.attemptCount > 0 && (
                      <button
                        onClick={() => void toggleExpand(s)}
                        className={`text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors
                          bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                      >
                        ›
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="ml-4 mt-1 flex flex-col gap-1">
                      {loading === sid && (
                        <p className="text-xs text-gray-400 px-4 py-2">Ładowanie prób...</p>
                      )}
                      {attempts?.map((a) => {
                        const linked = isAttemptLinked(links, sid, a.attemptId)
                        return (
                          <div
                            key={a.attemptId}
                            className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2 gap-2"
                          >
                            <div className="flex-1">
                              <span className="text-sm text-gray-800 dark:text-gray-200">
                                Próba #{a.attemptId}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                {formatDuration(a.durationS)} · {a.avgSpeedMPerMin.toFixed(1)} m/min
                              </span>
                            </div>
                            <button
                              onClick={() => linked
                                ? onRemove({ sessionId: sid, attemptId: a.attemptId })
                                : onAdd({ sessionId: sid, attemptId: a.attemptId })}
                              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
                                linked
                                  ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {linked ? '✓' : '+ Dodaj'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form ─────────────────────────────────────────────────────────────────

const SYSTEMS: GradeSystem[] = ['french', 'uiaa', 'kurtyka']
const ASCENT_STYLES = Object.keys(ASCENT_STYLE_LABEL) as AscentStyle[]

const EMPTY: Omit<Route, 'id'> = {
  createdAt: Date.now(),
  ascentDate: Date.now(),
  region: '',
  crag: '',
  name: '',
  gradeSystem: 'french',
  grade: '6a',
  ascentStyle: undefined,
  rating: 3,
  notes: '',
  links: [],
}

export default function JournalEditScreen() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { routes, addRoute, updateRoute } = useJournalStore()
  const { sessions: allSessions } = useSessionStore()

  const isEdit = !!id
  const existing = isEdit ? routes.find((r) => r.id === Number(id)) : undefined

  const prelinkedSession = searchParams.get('session')
    ? Number(searchParams.get('session'))
    : undefined

  const [form, setForm] = useState<Omit<Route, 'id'>>(() => {
    if (existing) return { ...existing }
    const base = { ...EMPTY, createdAt: Date.now() }
    if (prelinkedSession !== undefined) base.links = [{ sessionId: prelinkedSession }]
    return base
  })

  const [showMap, setShowMap] = useState(!!(existing?.lat))
  const [mapKey, setMapKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  const grades = GRADE_SYSTEMS[form.gradeSystem].grades
  const dateValue = form.ascentDate
    ? new Date(form.ascentDate).toISOString().split('T')[0]
    : ''

  useEffect(() => {
    if (isEdit && existing) setForm({ ...existing })
  }, [isEdit, existing])

  const patch = (p: Partial<Omit<Route, 'id'>>) => setForm((f) => ({ ...f, ...p }))

  function useCurrentLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      patch({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      setShowMap(true)
      setMapKey((k) => k + 1)
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateRoute(Number(id), form)
        navigate(`/journal/${id}`, { replace: true })
      } else {
        const newId = await addRoute(form)
        navigate(`/journal/${newId}`, { replace: true })
      }
    } finally {
      setSaving(false)
    }
  }

  function addLink(link: RouteLink) {
    patch({ links: [...form.links, link] })
  }

  function removeLink(link: RouteLink) {
    patch({
      links: form.links.filter(
        (l) => !(l.sessionId === link.sessionId && l.attemptId === link.attemptId)
      ),
    })
  }

  function linkLabel(link: RouteLink): string {
    const s = allSessions.find((s) => s.id === link.sessionId)
    const sessLabel = s ? `Sesja #${s.deviceSessionId}` : `Sesja #${link.sessionId}`
    return link.attemptId !== undefined ? `${sessLabel} · Próba #${link.attemptId}` : sessLabel
  }

  return (
    <div className="flex flex-col gap-0 pb-12">
      {/* Header */}
      <div className="px-4 pt-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-violet-600 dark:text-violet-400 font-medium text-sm"
        >
          ← Anuluj
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          {isEdit ? 'Edytuj drogę' : 'Nowa droga'}
        </h2>
        <button
          onClick={() => void handleSave()}
          disabled={!form.name.trim() || saving}
          className="text-violet-600 dark:text-violet-400 font-semibold text-sm disabled:opacity-40"
        >
          Zapisz
        </button>
      </div>

      <div className="px-4 pt-5 flex flex-col gap-6">

        {/* Lokalizacja */}
        <section className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Lokalizacja
          </label>
          <input
            placeholder="Region (np. Jura Krakowsko-Częstochowska)"
            value={form.region}
            onChange={(e) => patch({ region: e.target.value })}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm
              text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-violet-500"
          />
          <input
            placeholder="Skała (np. Owcza Góra)"
            value={form.crag}
            onChange={(e) => patch({ crag: e.target.value })}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm
              text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-violet-500"
          />
        </section>

        {/* Droga */}
        <section className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Droga
          </label>
          <input
            placeholder="Nazwa drogi *"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm
              text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-violet-500"
          />

          <div className="flex gap-2">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 shrink-0">
              {SYSTEMS.map((sys) => (
                <button
                  key={sys}
                  onClick={() => patch({
                    gradeSystem: sys,
                    grade: GRADE_SYSTEMS[sys].grades[Math.floor(GRADE_SYSTEMS[sys].grades.length / 2)],
                  })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.gradeSystem === sys
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {GRADE_SYSTEMS[sys].label}
                </button>
              ))}
            </div>
            <select
              value={form.grade}
              onChange={(e) => patch({ grade: e.target.value })}
              className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm font-semibold
                text-violet-600 dark:text-violet-400 outline-none focus:ring-2 focus:ring-violet-500
                border border-gray-200 dark:border-gray-700"
            >
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <input
            type="date"
            value={dateValue}
            onChange={(e) => {
              if (!e.target.value) { patch({ ascentDate: undefined }); return }
              const [y, m, d] = e.target.value.split('-').map(Number)
              patch({ ascentDate: new Date(y, m - 1, d).getTime() })
            }}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm
              text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500
              border border-gray-200 dark:border-gray-700"
          />
        </section>

        {/* Tryb przejścia */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Tryb przejścia
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {ASCENT_STYLES.map((style) => (
              <button
                key={style}
                onClick={() => patch({ ascentStyle: form.ascentStyle === style ? undefined : style })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  form.ascentStyle === style
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                {ASCENT_STYLE_LABEL[style]}
              </button>
            ))}
          </div>
        </section>

        {/* Ocena */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Ocena
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => patch({ rating: n })}
                className={`text-2xl transition-transform active:scale-110 ${
                  n <= form.rating ? 'text-violet-500' : 'text-gray-300 dark:text-gray-600'
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </section>

        {/* Notatki */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Notatki
          </label>
          <textarea
            placeholder="Opis, wskazówki, samopoczucie..."
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={4}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm
              text-gray-900 dark:text-white placeholder-gray-400 outline-none resize-none
              focus:ring-2 focus:ring-violet-500"
          />
        </section>

        {/* Sesje / próby */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Sesje i próby ({form.links.length})
            </label>
            <button
              onClick={() => setShowLinkPicker(true)}
              className="text-violet-600 dark:text-violet-400 text-xs font-semibold"
            >
              + Dodaj
            </button>
          </div>
          {form.links.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Brak przypisanych sesji lub prób.</p>
          )}
          {form.links.map((link, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5"
            >
              <span className="text-sm text-gray-800 dark:text-gray-200">{linkLabel(link)}</span>
              <button
                onClick={() => removeLink(link)}
                className="text-gray-400 hover:text-red-400 transition-colors px-2 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </section>

        {/* Współrzędne GPS */}
        <section className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Współrzędne GPS
          </label>
          <div className="flex gap-2">
            <button
              onClick={useCurrentLocation}
              className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl py-2.5 text-sm
                text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Użyj mojej lokalizacji
            </button>
            <button
              onClick={() => setShowMap((v) => !v)}
              className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl py-2.5 text-sm
                text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {showMap ? 'Ukryj mapę' : 'Wybierz na mapie'}
            </button>
          </div>

          {form.lat !== undefined && (
            <div className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-mono">{form.lat.toFixed(6)}° N</span>
              <span className="font-mono">{form.lng!.toFixed(6)}° E</span>
              <button
                onClick={() => { patch({ lat: undefined, lng: undefined }); setShowMap(false) }}
                className="ml-auto text-red-400 text-xs"
              >
                Usuń
              </button>
            </div>
          )}

          {showMap && (
            <LocationPicker
              lat={form.lat ?? 50.06}
              lng={form.lng ?? 19.94}
              mapKey={mapKey}
              onChange={(lat, lng) => patch({ lat, lng })}
            />
          )}
        </section>
      </div>

      {showLinkPicker && (
        <LinkPickerModal
          links={form.links}
          allSessions={allSessions}
          onAdd={addLink}
          onRemove={removeLink}
          onClose={() => setShowLinkPicker(false)}
        />
      )}
    </div>
  )
}
