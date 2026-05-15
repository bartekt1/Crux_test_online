export const State = {
  IDLE: 0,
  RESTING: 1,
  CLIMBING: 2,
  DESCENDING: 3,
  FREEFALL: 4,
} as const

export type State = (typeof State)[keyof typeof State]

export const STATE_CHAR: Record<string, State> = {
  I: State.IDLE,
  R: State.RESTING,
  C: State.CLIMBING,
  D: State.DESCENDING,
  F: State.FREEFALL,
}

export const STATE_LABEL: Record<State, string> = {
  [State.IDLE]: 'Gotowy',
  [State.RESTING]: 'Odpoczynek',
  [State.CLIMBING]: 'Wspinanie',
  [State.DESCENDING]: 'Zjazd',
  [State.FREEFALL]: 'Freefall',
}

// Raw record parsed from BLE CSV dump
export interface LogRecord {
  timestamp_s: number
  attempt_id: number
  state: State
  dpRateX100: number   // Pa/s × 100  →  / 100 = actual Pa/s
  gvX1000: number      // G-variance × 1000  →  / 1000 = actual
  pressRelX10: number  // relative pressure Pa × 10  →  / 10 = actual Pa
}

// LogRecord as stored in IndexedDB (adds DB key + session FK)
export interface DbRecord extends LogRecord {
  id?: number
  sessionId: number
}

// Session as stored in IndexedDB (pre-computed macro stats)
export interface Session {
  id?: number
  deviceSessionId: number  // session_id from firmware NVS
  syncedAt: Date
  startTimestamp: number   // first record timestamp_s
  endTimestamp: number     // last record timestamp_s
  durationS: number
  attemptCount: number
  climbTimeS: number
  restTimeS: number
  recordCount: number
  totalClimbMeters: number
}

// Per-attempt stats (computed on demand, not stored)
export interface Attempt {
  attemptId: number
  startTimestamp: number
  endTimestamp: number
  durationS: number
  avgSpeedMPerMin: number  // średnia prędkość = wysokość / czas × 60
  minPressRel: number      // Pa (decoded) — najniższe ciśnienie = najwyższy punkt
  records: LogRecord[]
}

// Fully processed session (computed on demand)
export interface ProcessedSession {
  session: Session
  records: LogRecord[]
  attempts: Attempt[]
}

// Device config matching firmware ConfigData
export interface DeviceConfig {
  pClimb: number
  pDesc: number
  gAct: number
  gStill: number
  gFall: number
  confirm: number
}

// Device status from STATUS command
export interface DeviceStatus {
  battery: string
  freeMemory: number
  sensorsOk: boolean
}

// Live frame from STREAM_ON
export interface LiveFrame {
  state: State
  gvRaw: number       // gv * 1000 (integer from device)
  dpRate: number      // Pa/s (already decoded float string from device)
  timestamp: number   // local Date.now()
}

export type GradeSystem = 'french' | 'uiaa' | 'kurtyka'

export type AscentStyle = 'onsight' | 'flash' | 'redpoint' | 'pinkpoint' | 'toprope' | 'attempt'

export const ASCENT_STYLE_LABEL: Record<AscentStyle, string> = {
  onsight:    'Onsight',
  flash:      'Flash',
  redpoint:   'Redpoint',
  pinkpoint:  'Pinkpoint',
  toprope:    'Top rope',
  attempt:    'Próba / Projekt',
}

export interface RouteLink {
  sessionId: number   // Session.id (db key)
  attemptId?: number  // attempt_id from records — undefined means whole session
}

export interface Route {
  id?: number
  createdAt: number
  ascentDate?: number      // Date.now() ms — kiedy przeszedłeś drogę
  region: string
  crag: string
  name: string
  gradeSystem: GradeSystem
  grade: string
  ascentStyle?: AscentStyle
  rating: number           // 1–5
  notes: string
  lat?: number
  lng?: number
  links: RouteLink[]
}

// JSON backup format
export interface BackupFile {
  version: 1
  exportedAt: string
  sessions: Session[]
  records: DbRecord[]
  routes?: Route[]
}
