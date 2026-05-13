import type { LogRecord } from '../types'
import { State } from '../types'
import { computeMacroStats } from './sessionProcessor'
import { db, saveSession, saveRecords, deleteSession } from './db'

// High IDs — unlikely to clash with real device sessions
const DEMO_SESSION_IDS = [901, 902, 903]

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// One segment of records at a fixed interval
function pushSegment(
  out: LogRecord[],
  startT: number,
  durationS: number,
  intervalS: number,
  attemptId: number,
  state: State,
  dpRateBase: number,    // Pa/s (negative = going up)
  pressRelStart: number, // Pa relative to session baseline
  pressRelEnd: number,
): void {
  const steps = Math.max(1, Math.round(durationS / intervalS))
  for (let i = 0; i < steps; i++) {
    const frac = i / steps
    const pressRel = pressRelStart + (pressRelEnd - pressRelStart) * frac
    const gvActive = state === State.RESTING
      ? rnd(0, 2)
      : rnd(4, 16)

    out.push({
      timestamp_s: Math.round(startT + i * intervalS),
      attempt_id: attemptId,
      state,
      dpRateX100: Math.round((dpRateBase + rnd(-2, 2)) * 100),
      gvX1000: gvActive,
      pressRelX10: Math.round(pressRel * 10 + rnd(-2, 2)),
    })
  }
}

interface AttemptDef {
  heightPa: number    // Pa of height gain (≈12 Pa per meter)
  climbS: number      // seconds climbing
  descS: number       // seconds descending
  restS: number       // seconds resting before this attempt
  hasFall?: boolean   // inject a FREEFALL record mid-climb
}

function generateRecords(attempts: AttemptDef[]): LogRecord[] {
  const records: LogRecord[] = []
  let t = 30  // seconds after device boot

  for (let i = 0; i < attempts.length; i++) {
    const { heightPa, climbS, descS, restS, hasFall } = attempts[i]
    const restAttemptId = i          // attempt_id before first climb is 0
    const climbAttemptId = i + 1

    // ── REST before attempt ──────────────────────────────────────────
    pushSegment(records, t, restS, 2, restAttemptId, State.RESTING, 0, 0, 0)
    t += restS

    if (!hasFall) {
      // ── CLIMB ───────────────────────────────────────────────────────
      // dP is negative (pressure drops as altitude increases)
      const dpClimb = -(heightPa / climbS)
      pushSegment(records, t, climbS, 0.5, climbAttemptId, State.CLIMBING,
        dpClimb, 0, -heightPa)
      t += climbS

      // ── Brief REST at top ───────────────────────────────────────────
      pushSegment(records, t, 5, 2, climbAttemptId, State.RESTING, 0, -heightPa, -heightPa)
      t += 5

      // ── DESCEND ─────────────────────────────────────────────────────
      const dpDesc = heightPa / descS
      pushSegment(records, t, descS, 0.5, climbAttemptId, State.DESCENDING,
        dpDesc, -heightPa, 0)
      t += descS

    } else {
      // ── CLIMBING → FREEFALL (fall mid-route) ────────────────────────
      const halfClimb = Math.round(climbS * 0.6)
      const midHeight = heightPa * 0.6
      const dpClimb = -(heightPa / climbS)
      pushSegment(records, t, halfClimb, 0.5, climbAttemptId, State.CLIMBING,
        dpClimb, 0, -midHeight)
      t += halfClimb

      // Short freefall burst (5 ticks)
      for (let k = 0; k < 5; k++) {
        records.push({
          timestamp_s: Math.round(t + k * 0.1),
          attempt_id: climbAttemptId,
          state: State.FREEFALL,
          dpRateX100: rnd(1500, 2500),  // rapid pressure rise on fall
          gvX1000: rnd(0, 2),            // near 0g in freefall
          pressRelX10: Math.round((-midHeight + k * 20) * 10),
        })
      }
      t += 1

      // ── DESCEND after fall ──────────────────────────────────────────
      const remainHeight = midHeight
      const dpDescFall = remainHeight / descS
      pushSegment(records, t, descS, 0.5, climbAttemptId, State.DESCENDING,
        dpDescFall, -midHeight, 0)
      t += descS
    }
  }

  // Session wind-down
  pushSegment(records, t, 20, 2, attempts.length, State.RESTING, 0, 0, 0)

  return records
}

// ── Session definitions ──────────────────────────────────────────────────

const SESSION_DEFS: AttemptDef[][] = [
  // Session 901 — "Easy warm-up" (5 attempts, ~35 min)
  [
    { heightPa: 120, climbS: 38, descS: 14, restS: 90 },
    { heightPa: 150, climbS: 32, descS: 12, restS: 110 },
    { heightPa: 160, climbS: 28, descS: 11, restS: 95 },
    { heightPa: 130, climbS: 42, descS: 15, restS: 120 },
    { heightPa: 145, climbS: 35, descS: 13, restS: 100 },
  ],

  // Session 902 — "Projecting day" (7 attempts, ~55 min, includes a fall)
  [
    { heightPa: 200, climbS: 28, descS: 10, restS: 120 },
    { heightPa: 220, climbS: 24, descS: 9,  restS: 150 },
    { heightPa: 240, climbS: 22, descS: 9,  restS: 180, hasFall: true },
    { heightPa: 210, climbS: 26, descS: 10, restS: 200 },
    { heightPa: 230, climbS: 25, descS: 10, restS: 160 },
    { heightPa: 240, climbS: 21, descS: 9,  restS: 190 },
    { heightPa: 245, climbS: 20, descS: 9,  restS: 210 },
  ],

  // Session 903 — "Volume training" (10 attempts, ~75 min)
  [
    { heightPa: 100, climbS: 45, descS: 16, restS: 70 },
    { heightPa: 120, climbS: 40, descS: 14, restS: 80 },
    { heightPa: 140, climbS: 35, descS: 13, restS: 75 },
    { heightPa: 160, climbS: 30, descS: 12, restS: 85 },
    { heightPa: 170, climbS: 28, descS: 11, restS: 90 },
    { heightPa: 150, climbS: 32, descS: 12, restS: 80 },
    { heightPa: 180, climbS: 26, descS: 10, restS: 95 },
    { heightPa: 160, climbS: 30, descS: 12, restS: 85 },
    { heightPa: 175, climbS: 27, descS: 11, restS: 90 },
    { heightPa: 165, climbS: 29, descS: 12, restS: 100 },
  ],
]

const DAYS_AGO = [14, 7, 2]

// ── Public API ───────────────────────────────────────────────────────────

export async function seedDemoData(): Promise<void> {
  const allSessions = await db.sessions.toArray()
  const existing = allSessions.filter((s) => DEMO_SESSION_IDS.includes(s.deviceSessionId))

  // Re-seed if schema changed (totalClimbMeters added)
  if (existing.length > 0) {
    if (existing[0].totalClimbMeters !== undefined) return  // already up-to-date
    for (const s of existing) {
      if (s.id !== undefined) await deleteSession(s.id)
    }
  }

  for (let i = 0; i < SESSION_DEFS.length; i++) {
    const deviceSessionId = DEMO_SESSION_IDS[i]
    const records: LogRecord[] = generateRecords(SESSION_DEFS[i])
    const stats = computeMacroStats(records, deviceSessionId)

    const syncedAt = new Date(Date.now() - DAYS_AGO[i] * 24 * 3600 * 1000)
    const dbId = await saveSession({ ...stats, syncedAt })
    await saveRecords(records.map((r) => ({ ...r, sessionId: dbId })))
  }
}

export function isDemoSession(deviceSessionId: number): boolean {
  return DEMO_SESSION_IDS.includes(deviceSessionId)
}
