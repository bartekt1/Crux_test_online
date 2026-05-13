import { STATE_CHAR, type LogRecord, type DeviceConfig, type DeviceStatus, type LiveFrame, State } from '../types'

// Dump record CSV: <timestamp_s>,<attempt_id>,<state_char>,<dpRateX100>,<gvX1000>,<pressRelX10>
export function parseRecord(line: string): LogRecord | null {
  const parts = line.split(',')
  if (parts.length !== 6) return null

  const [ts, att, stateChar, dp, gv, press] = parts
  const state = STATE_CHAR[stateChar.trim()]
  if (state === undefined) return null

  const record: LogRecord = {
    timestamp_s: parseInt(ts, 10),
    attempt_id: parseInt(att, 10),
    state,
    dpRateX100: parseInt(dp, 10),
    gvX1000: parseInt(gv, 10),
    pressRelX10: parseInt(press, 10),
  }

  if (isNaN(record.timestamp_s) || isNaN(record.dpRateX100)) return null
  return record
}

// INFO response: INFO:SESSIONS_<n>LAST<id>
export function parseInfo(msg: string): { sessionCount: number; lastSessionId: number } | null {
  const match = msg.match(/INFO:SESSIONS_(\d+)LAST(\d+)/)
  if (!match) return null
  return {
    sessionCount: parseInt(match[1], 10),
    lastSessionId: parseInt(match[2], 10),
  }
}

// STATUS response: BAT:N/A;MEM:<free>;SENSORS:<OK|ERROR>
export function parseStatus(msg: string): DeviceStatus | null {
  const match = msg.match(/BAT:([^;]+);MEM:(\d+);SENSORS:(OK|ERROR)/)
  if (!match) return null
  return {
    battery: match[1],
    freeMemory: parseInt(match[2], 10),
    sensorsOk: match[3] === 'OK',
  }
}

// CFG response: CFG:<pClimb>,<pDesc>,<gAct>,<gStill>,<gFall>,<confirm>
export function parseConfig(msg: string): DeviceConfig | null {
  const body = msg.replace(/^CFG:/, '')
  const parts = body.split(',')
  if (parts.length !== 6) return null
  const [pClimb, pDesc, gAct, gStill, gFall, confirm] = parts.map(Number)
  if ([pClimb, pDesc, gAct, gStill, gFall, confirm].some(isNaN)) return null
  return { pClimb, pDesc, gAct, gStill, gFall, confirm }
}

// Live frame: "<state_char> v:<gv*1000> dP:<rate>"
export function parseLiveFrame(msg: string, timestamp: number): LiveFrame | null {
  const match = msg.match(/^([IRCDF])\s+v:(\d+)\s+dP:([+-]?\d+\.?\d*)/)
  if (!match) return null
  const state = STATE_CHAR[match[1]]
  if (state === undefined) return null
  return {
    state,
    gvRaw: parseInt(match[2], 10),
    dpRate: parseFloat(match[3]),
    timestamp,
  }
}

// Build SET_CFG command string
export function buildSetCfg(cfg: DeviceConfig): string {
  return `SET_CFG:${cfg.pClimb},${cfg.pDesc},${cfg.gAct},${cfg.gStill},${cfg.gFall},${cfg.confirm}`
}

// Decode raw record fields to physical units
export const decode = {
  dpRate:       (dpRateX100: number)  => dpRateX100 / 100,
  gVariance:    (gvX1000: number)     => gvX1000 / 1000,
  pressRel:     (pressRelX10: number) => pressRelX10 / 10,
  // Altitude above session baseline in meters (negative pressRel = higher altitude)
  altMeters:    (pressRelX10: number) => -(pressRelX10 / 10) / 12,
  // Climbing speed in m/min (negative dpRate during ascent → positive speed)
  speedMPerMin: (dpRateX100: number)  => -(dpRateX100 / 100) * 5,
}

export function isActiveState(state: State): boolean {
  return state === State.CLIMBING || state === State.DESCENDING || state === State.FREEFALL
}
