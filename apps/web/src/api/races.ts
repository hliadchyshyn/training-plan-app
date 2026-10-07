import { useQuery } from '@tanstack/react-query'
import { api } from './client.js'

/** Mirrors RaceEntry from apps/api/src/utils/raceEntries.ts. */
export interface RaceEntryResult {
  wpId: number
  timeRaw: string
  seconds: number
  status: string
  distanceMeters: number
  isPersonalBest: boolean
  isSeasonBest: boolean
}

export interface RaceEntry {
  key: string
  athlete: { id: string; name: string; email: string } | null
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
  diffSeconds: number | null
  diffPct: number | null
}

export interface RacesQuery {
  from: string
  to: string
  athleteId?: string
}

export function useRaces({ from, to, athleteId }: RacesQuery, enabled = true) {
  return useQuery<RaceEntry[]>({
    queryKey: ['races', from, to, athleteId ?? ''],
    queryFn: () => api.get('/races', { params: { from, to, ...(athleteId && { athleteId }) } }).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  })
}
