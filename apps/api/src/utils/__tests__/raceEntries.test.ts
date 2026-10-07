import { describe, expect, it } from 'vitest'
import type { RaceRegistration, RaceResult } from '@prisma/client'
import { buildRaceEntries, computeGoalDiff, type RaceAthlete } from '../raceEntries.js'

function reg(overrides: Partial<RaceRegistration> = {}): RaceRegistration {
  return {
    id: 'r1',
    wpId: 1,
    wpUserId: 45,
    email: 'ivan@example.com',
    userName: null,
    anonsEventId: 77,
    eventTitle: 'Kyiv Half',
    eventDate: new Date('2026-10-25T00:00:00Z'),
    location: 'Київ',
    eventUrl: null,
    distance: 'Півмарафон',
    raceDistanceCode: 'HM',
    goalTimeRaw: '1:35:00',
    goalSeconds: 5700,
    notes: null,
    wpUpdatedAt: new Date('2026-10-01T00:00:00Z'),
    syncedAt: new Date(),
    ...overrides,
  }
}

function res(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    id: 's1',
    wpId: 10,
    wpUserId: 45,
    email: 'ivan@example.com',
    raceEventId: 88,
    eventTitle: 'Kyiv Half',
    eventDate: new Date('2026-10-25T00:00:00Z'),
    distanceCode: 'HM',
    distanceLabel: 'Півмарафон',
    distanceMeters: 21097,
    resultTimeRaw: '1:34:12',
    resultSeconds: 5652,
    resultStatus: 'finished',
    isPersonalBest: false,
    isSeasonBest: false,
    registrationWpId: 1,
    wpUpdatedAt: new Date('2026-10-25T12:00:00Z'),
    syncedAt: new Date(),
    ...overrides,
  }
}

const ivan: RaceAthlete = { id: 'u1', name: 'Іван', email: 'Ivan@Example.com' }
const athletes = new Map([[ivan.email.toLowerCase(), ivan]])

describe('computeGoalDiff', () => {
  it('negative diff when faster than goal', () => {
    expect(computeGoalDiff(5700, { seconds: 5652, status: 'finished' })).toEqual({ diffSeconds: -48, diffPct: -0.8 })
  })

  it('positive diff when slower', () => {
    expect(computeGoalDiff(3000, { seconds: 3150, status: 'FINISHED' })).toEqual({ diffSeconds: 150, diffPct: 5 })
  })

  it('null for DNF/DNS, missing goal or result', () => {
    expect(computeGoalDiff(5700, { seconds: 0, status: 'DNF' })).toEqual({ diffSeconds: null, diffPct: null })
    expect(computeGoalDiff(null, { seconds: 5652, status: 'finished' })).toEqual({ diffSeconds: null, diffPct: null })
    expect(computeGoalDiff(5700, null)).toEqual({ diffSeconds: null, diffPct: null })
  })
})

describe('buildRaceEntries', () => {
  it('joins a result to its registration and computes the diff', () => {
    const [entry] = buildRaceEntries([reg()], [res()], athletes)

    expect(entry).toMatchObject({
      key: 'reg-1',
      athlete: ivan,
      eventDate: '2026-10-25',
      goalSeconds: 5700,
      result: { wpId: 10, timeRaw: '1:34:12', status: 'finished' },
      diffSeconds: -48,
    })
  })

  it('keeps a planned start without a result', () => {
    const [entry] = buildRaceEntries([reg()], [], athletes)
    expect(entry.result).toBeNull()
    expect(entry.diffSeconds).toBeNull()
  })

  it('shows results without a matching registration as standalone entries', () => {
    const entries = buildRaceEntries([], [res({ registrationWpId: null }), res({ wpId: 11, registrationWpId: 999 })], athletes)

    expect(entries.map((e) => e.key)).toEqual(['res-10', 'res-11'])
    expect(entries[0]).toMatchObject({ goalSeconds: null, distance: 'Півмарафон', result: { wpId: 10 } })
  })

  it('prefers a finished result over a DNS for the same registration', () => {
    const [entry] = buildRaceEntries(
      [reg()],
      [res({ wpId: 10, resultStatus: 'DNS', resultSeconds: 0, wpUpdatedAt: new Date('2026-10-26T00:00:00Z') }), res({ wpId: 11 })],
      athletes,
    )
    expect(entry.result?.wpId).toBe(11)
  })

  it('leaves athlete null for emails without a plans account', () => {
    const [entry] = buildRaceEntries([reg({ email: 'stranger@example.com' })], [], athletes)
    expect(entry.athlete).toBeNull()
    expect(entry.email).toBe('stranger@example.com')
  })

  it('sorts by date, then athlete name', () => {
    const petro: RaceAthlete = { id: 'u2', name: 'Петро', email: 'petro@example.com' }
    const map = new Map([...athletes, ['petro@example.com', petro]])
    const entries = buildRaceEntries(
      [
        reg({ wpId: 1, email: 'petro@example.com' }),
        reg({ wpId: 2 }),
        reg({ wpId: 3, eventDate: new Date('2026-09-01T00:00:00Z') }),
      ],
      [],
      map,
    )
    expect(entries.map((e) => e.key)).toEqual(['reg-3', 'reg-2', 'reg-1'])
  })
})
