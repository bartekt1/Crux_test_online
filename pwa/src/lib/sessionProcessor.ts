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
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    const dt = intervalAfter(records, i)
    if (rec.state === State.CLIMBING) climbTimeS += dt
    else if (rec.state === State.RESTING) restTimeS += dt
  }

  // Używaj tej samej logiki co extractAttempts (merge + filtr) zamiast prostego
  // liczenia unikalnych attempt_id — zapewnia spójność z widokiem szczegółów sesji.
  const attemptCount = extractAttempts(records).length

  const startTimestamp = records[0].timestamp_s
  const endTimestamp = records[records.length - 1].timestamp_s

  return {
    deviceSessionId,
    startTimestamp,
    endTimestamp,
    durationS: endTimestamp - startTimestamp,
    attemptCount,
    climbTimeS: Math.round(climbTimeS),
    restTimeS: Math.round(restTimeS),
    recordCount: records.length,
    totalClimbMeters: computeTotalClimbMeters(records),
  }
}

// Buduje jedną próbę ze zgrupowanych rekordów CLIMBING.
function buildAttempt(attemptId: number, climbRecords: LogRecord[]): Attempt {
  climbRecords.sort((a, b) => a.timestamp_s - b.timestamp_s)
  let minPressRel = Infinity
  for (const rec of climbRecords) {
    const pr = decode.pressRel(rec.pressRelX10)
    if (pr < minPressRel) minPressRel = pr
  }
  const durationS = climbRecords.at(-1)!.timestamp_s - climbRecords[0].timestamp_s
  const altitudeM = -minPressRel / 12
  return {
    attemptId,
    startTimestamp: climbRecords[0].timestamp_s,
    endTimestamp:   climbRecords.at(-1)!.timestamp_s,
    durationS,
    avgSpeedMPerMin: durationS > 0 ? (altitudeM / durationS) * 60 : 0,
    minPressRel,
    records: climbRecords,
  }
}

export function extractAttempts(records: LogRecord[]): Attempt[] {
  // Krok 1 — pogrupuj rekordy CLIMBING według attempt_id
  const groups = new Map<number, LogRecord[]>()
  for (const rec of records) {
    if (rec.state !== State.CLIMBING) continue
    if (!groups.has(rec.attempt_id)) groups.set(rec.attempt_id, [])
    groups.get(rec.attempt_id)!.push(rec)
  }

  const raw = [...groups.entries()]
    .map(([id, recs]) => buildAttempt(id, recs))
    .sort((a, b) => a.startTimestamp - b.startTimestamp)

  if (raw.length === 0) return []

  // Krok 2 — scal kolejne próby rozdzielone krótką pauzą na znacznej wysokości.
  // Pauza na chwytach mid-route nie powinna tworzyć osobnej próby:
  // warunek merge: przerwa < 30 s I wspinacz był > 0.5 m nad bazą podczas przerwy.
  const MERGE_GAP_S     = 30    // maks. przerwa między segmentami climbing (s)
  const MERGE_ALT_PA    = -6    // próg wysokości: < -6 Pa = > ~0.5 m nad bazą
  const merged: Attempt[] = [raw[0]]

  for (let i = 1; i < raw.length; i++) {
    const prev = merged.at(-1)!
    const cur  = raw[i]
    const gapS = cur.startTimestamp - prev.endTimestamp

    // Najwyższy punkt w przerwie między segmentami (minimalne pressRel = największa wys.)
    const gapRecs = records.filter(
      r => r.timestamp_s > prev.endTimestamp && r.timestamp_s < cur.startTimestamp,
    )
    const minPressRelInGap = gapRecs.length > 0
      ? Math.min(...gapRecs.map(r => decode.pressRel(r.pressRelX10)))
      : 0

    if (gapS <= MERGE_GAP_S && minPressRelInGap < MERGE_ALT_PA) {
      // Scal: rozszerz poprzednią próbę o bieżącą
      const combined = [...prev.records, ...cur.records]
      merged[merged.length - 1] = buildAttempt(prev.attemptId, combined)
    } else {
      merged.push(cur)
    }
  }

  // Krok 3 — odfiltruj mikro-próby (wspinacz nigdy nie wyszedł > 0.8 m nad bazą).
  // Obejmuje fałszywe pozytywne przy stanowisku (zakładanie uprzęży, szukanie chwytu itp.).
  const MIN_ALT_PA = -10  // < -10 Pa = > ~0.8 m nad bazą
  return merged.filter(a => a.minPressRel < MIN_ALT_PA)
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
