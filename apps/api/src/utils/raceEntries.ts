import type { RaceRegistration, RaceResult } from '@prisma/client'

export interface RaceAthlete {
  id: string
  name: string
  email: string
}

export interface RaceEntryResult {
  wpId: number
  timeRaw: string
  seconds: number
  status: string
  distanceMeters: number
  isPersonalBest: boolean
  isSeasonBest: boolean
}

/** One start: planned (anons) and/or done (result). */
export interface RaceEntry {
  key: string
  athlete: RaceAthlete | null
  email: string
  eventTitle: string
  eventDate: string
  location: string | null
  eventUrl: string | null
  distance: string
  registrationWpId: number | null
  goalTimeRaw: string | null
  goalSeconds: number | null
  result: RaceEntryResult | null
  /** result − goal, seconds; negative = faster than planned. Only for finished results with a goal. */
  diffSeconds: number | null
  diffPct: number | null
}

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toEntryResult(r: RaceResult): RaceEntryResult {
  return {
    wpId: r.wpId,
    timeRaw: r.resultTimeRaw,
    seconds: r.resultSeconds,
    status: r.resultStatus,
    distanceMeters: r.distanceMeters,
    isPersonalBest: r.isPersonalBest,
    isSeasonBest: r.isSeasonBest,
  }
}

export function computeGoalDiff(
  goalSeconds: number | null,
  result: Pick<RaceEntryResult, 'seconds' | 'status'> | null,
): { diffSeconds: number | null; diffPct: number | null } {
  if (!result || !goalSeconds || goalSeconds <= 0) return { diffSeconds: null, diffPct: null }
  if (result.status.toLowerCase() !== 'finished' || result.seconds <= 0) return { diffSeconds: null, diffPct: null }
  const diffSeconds = result.seconds - goalSeconds
  return { diffSeconds, diffPct: Math.round((diffSeconds / goalSeconds) * 1000) / 10 }
}

/** Prefer a finished result, then the most recently updated one. */
function pickResult(candidates: RaceResult[]): RaceResult {
  return [...candidates].sort((a, b) => {
    const fa = a.resultStatus.toLowerCase() === 'finished' ? 1 : 0
    const fb = b.resultStatus.toLowerCase() === 'finished' ? 1 : 0
    if (fa !== fb) return fb - fa
    return b.wpUpdatedAt.getTime() - a.wpUpdatedAt.getTime()
  })[0]
}

export function buildRaceEntries(
  registrations: RaceRegistration[],
  results: RaceResult[],
  athletesByEmail: Map<string, RaceAthlete>,
): RaceEntry[] {
  const athleteFor = (email: string) => athletesByEmail.get(email.toLowerCase()) ?? null
  const registrationIds = new Set(registrations.map((r) => r.wpId))

  const resultsByRegistration = new Map<number, RaceResult[]>()
  const standalone: RaceResult[] = []
  for (const res of results) {
    if (res.registrationWpId !== null && registrationIds.has(res.registrationWpId)) {
      resultsByRegistration.set(res.registrationWpId, [...(resultsByRegistration.get(res.registrationWpId) ?? []), res])
    } else {
      standalone.push(res)
    }
  }

  const planned: RaceEntry[] = registrations.map((reg) => {
    const matched = resultsByRegistration.get(reg.wpId)
    const result = matched ? toEntryResult(pickResult(matched)) : null
    return {
      key: `reg-${reg.wpId}`,
      athlete: athleteFor(reg.email),
      email: reg.email,
      eventTitle: reg.eventTitle,
      eventDate: toIsoDay(reg.eventDate),
      location: reg.location,
      eventUrl: reg.eventUrl,
      distance: reg.distance,
      registrationWpId: reg.wpId,
      goalTimeRaw: reg.goalTimeRaw,
      goalSeconds: reg.goalSeconds,
      result,
      ...computeGoalDiff(reg.goalSeconds, result),
    }
  })

  const unplanned: RaceEntry[] = standalone.map((res) => ({
    key: `res-${res.wpId}`,
    athlete: athleteFor(res.email),
    email: res.email,
    eventTitle: res.eventTitle,
    eventDate: toIsoDay(res.eventDate),
    location: null,
    eventUrl: null,
    distance: res.distanceLabel || res.distanceCode,
    registrationWpId: null,
    goalTimeRaw: null,
    goalSeconds: null,
    result: toEntryResult(res),
    diffSeconds: null,
    diffPct: null,
  }))

  return [...planned, ...unplanned].sort(
    (a, b) =>
      a.eventDate.localeCompare(b.eventDate) ||
      (a.athlete?.name ?? a.email).localeCompare(b.athlete?.name ?? b.email, 'uk'),
  )
}
