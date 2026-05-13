import { State, type LogRecord, type Session, type Attempt, type ProcessedSession } from '../types'
import { decode } from './bleParser'

// Time a record was "active" = interval until the next record.
// We cap at 5s to avoid inflating stats from gaps (e.g. device woke from sleep).
function intervalAfter(records: LogRecord[], i: number): number {
  if (i >= records.length - 1) return 0
  return Math.min(records[i + 1].timestamp_s - records[i].timestamp_s, 5)
}

// Total meters climbed = sum of height gains across all climbing bouts.
// Uses min pressRel per bout (most negative = highest point reached).
function computeTotalClimbMeters(records: LogRecord[]): number {
  let total = 0
  let minPressRel = 0
  let inClimb = false

  for (const rec of records) {
    const pr = rec.pressRelX10 / 10  // Pa
    if (rec.state === State.CLIMBING) {
      if (!inClimb) { minPressRel = pr; inClimb = true }
      else if (pr < minPressRel) minPressRel = pr
    } else if (inClimb) {
      total += Math.abs(minPressRel)
      inClimb = false
    }
  }
  if (inClimb) total += Math.abs(minPressRel)

  return Math.round(total / 12)  // Pa ÷ 12 Pa/m ≈ meters
}

export function computeMacroStats(
  records: LogRecord[],
  deviceSessionId: number,
): Omit<Session, 'id' | 'syncedAt'> {
  if (records.length === 0) {
    return {
      deviceSessionId,
      startTimestamp: 0,
      endTimestamp: 0,
      durationS: 0,
      attemptCount: 0,
      climbTimeS: 0,
      restTimeS: 0,
      recordCount: 0,
      totalClimbMeters: 0,
    }
  }

  let climbTimeS = 0
  let restTimeS = 0
  const climbingAttemptIds = new Set<number>()

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    const dt = intervalAfter(records, i)
    if (rec.state === State.CLIMBING) {
      climbTimeS += dt
      climbingAttemptIds.add(rec.attempt_id)
    } else if (rec.state === State.RESTING) {
      restTimeS += dt
    }
  }

  const startTimestamp = records[0].timestamp_s
  const endTimestamp = records[records.length - 1].timestamp_s

  return {
    deviceSessionId,
    startTimestamp,
    endTimestamp,
    durationS: endTimestamp - startTimestamp,
    attemptCount: climbingAttemptIds.size,
    climbTimeS: Math.round(climbTimeS),
    restTimeS: Math.round(restTimeS),
    recordCount: records.length,
    totalClimbMeters: computeTotalClimbMeters(records),
  }
}

export function extractAttempts(records: LogRecord[]): Attempt[] {
  const groups = new Map<number, LogRecord[]>()

  for (const rec of records) {
    if (rec.state !== State.CLIMBING) continue
    if (!groups.has(rec.attempt_id)) groups.set(rec.attempt_id, [])
    groups.get(rec.attempt_id)!.push(rec)
  }

  const attempts: Attempt[] = []

  for (const [attemptId, climbRecords] of groups) {
    if (climbRecords.length === 0) continue
    climbRecords.sort((a, b) => a.timestamp_s - b.timestamp_s)

    let maxDpRate = -Infinity
    let minPressRel = Infinity

    for (const rec of climbRecords) {
      const dp = decode.dpRate(rec.dpRateX100)
      if (dp > maxDpRate) maxDpRate = dp
      const pr = decode.pressRel(rec.pressRelX10)
      if (pr < minPressRel) minPressRel = pr
    }

    attempts.push({
      attemptId,
      startTimestamp: climbRecords[0].timestamp_s,
      endTimestamp: climbRecords[climbRecords.length - 1].timestamp_s,
      durationS: climbRecords[climbRecords.length - 1].timestamp_s - climbRecords[0].timestamp_s,
      maxDpRate,
      minPressRel,
      records: climbRecords,
    })
  }

  return attempts.sort((a, b) => a.startTimestamp - b.startTimestamp)
}

export function buildProcessedSession(
  session: Session,
  records: LogRecord[],
): ProcessedSession {
  return { session, records, attempts: extractAttempts(records) }
}

// Chart-ready data with optional downsampling to keep charts fast.
// Adds altitude in meters and speed in m/min.
export function toChartData(records: LogRecord[], maxPoints = 600) {
  const step = Math.max(1, Math.floor(records.length / maxPoints))
  return records
    .filter((_, i) => i % step === 0)
    .map((r) => ({
      t: r.timestamp_s,
      dp: decode.dpRate(r.dpRateX100),
      gv: decode.gVariance(r.gvX1000),
      alt: decode.altMeters(r.pressRelX10),
      speed: decode.speedMPerMin(r.dpRateX100),
      state: r.state,
    }))
}
