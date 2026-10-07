import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysUntil,
  daysUntilLabel,
  diffTone,
  formatDiff,
  formatDuration,
  splitRaces,
} from '../races.js'
import type { RaceEntry } from '../../api/races.js'

function entry(overrides: Partial<RaceEntry> = {}): RaceEntry {
  return {
    key: 'reg-1',
    athlete: { id: 'a1', name: 'Іван', email: 'ivan@x.com' },
    email: 'ivan@x.com',
    eventTitle: 'Kyiv Half',
    eventDate: '2026-10-25',
    location: null,
    eventUrl: null,
    distance: 'Півмарафон',
    registrationWpId: 1,
    goalTimeRaw: '1:35:00',
    goalSeconds: 5700,
    result: null,
    diffSeconds: null,
    diffPct: null,
    ...overrides,
  }
}

const finished = (seconds: number) => ({
  wpId: 10, timeRaw: '', seconds, status: 'finished', distanceMeters: 21097, isPersonalBest: false, isSeasonBest: false,
})

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(35)).toBe('0:35')
    expect(formatDuration(70)).toBe('1:10')
    expect(formatDuration(5652)).toBe('1:34:12')
  })
})

describe('formatDiff', () => {
  it('signs the difference', () => {
    expect(formatDiff(-35)).toBe('−0:35')
    expect(formatDiff(70)).toBe('+1:10')
    expect(formatDiff(0)).toBe('0:00')
    expect(formatDiff(null)).toBe('')
  })
})

describe('diffTone', () => {
  it('better when at or under goal', () => {
    expect(diffTone(entry({ result: finished(5652), diffSeconds: -48, diffPct: -0.8 }))).toBe('better')
    expect(diffTone(entry({ result: finished(5700), diffSeconds: 0, diffPct: 0 }))).toBe('better')
  })

  it('close when up to 3% slower, worse beyond', () => {
    expect(diffTone(entry({ result: finished(5800), diffSeconds: 100, diffPct: 1.8 }))).toBe('close')
    expect(diffTone(entry({ result: finished(5871), diffSeconds: 171, diffPct: 3 }))).toBe('close')
    expect(diffTone(entry({ result: finished(6000), diffSeconds: 300, diffPct: 5.3 }))).toBe('worse')
  })

  it('dnf for non-finished results', () => {
    expect(diffTone(entry({ result: { ...finished(0), status: 'DNF' } }))).toBe('dnf')
    expect(diffTone(entry({ result: { ...finished(0), status: 'dns' } }))).toBe('dnf')
  })

  it('none without a result or a goal', () => {
    expect(diffTone(entry())).toBe('none')
    expect(diffTone(entry({ goalSeconds: null, result: finished(5652) }))).toBe('none')
  })
})

describe('date helpers', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts whole days regardless of DST', () => {
    expect(daysUntil('2026-10-25', '2026-10-07')).toBe(18)
    expect(daysUntil('2026-10-26', '2026-10-24')).toBe(2) // DST change in Ukraine
    expect(daysUntil('2026-10-01', '2026-10-07')).toBe(-6)
  })

  it('labels the countdown', () => {
    expect(daysUntilLabel(0)).toBe('сьогодні')
    expect(daysUntilLabel(1)).toBe('завтра')
    expect(daysUntilLabel(5)).toBe('через 5 дн.')
  })
})

describe('splitRaces', () => {
  const today = '2026-10-07'

  it('upcoming ascending, past descending', () => {
    const { upcoming, past } = splitRaces(
      [
        entry({ key: 'a', eventDate: '2026-11-01' }),
        entry({ key: 'b', eventDate: '2026-09-01' }),
        entry({ key: 'c', eventDate: '2026-10-10' }),
        entry({ key: 'd', eventDate: '2026-10-01' }),
      ],
      today,
    )
    expect(upcoming.map((e) => e.key)).toEqual(['c', 'a'])
    expect(past.map((e) => e.key)).toEqual(['d', 'b'])
  })

  it("today's start without a result is upcoming, with a result it's past", () => {
    const { upcoming, past } = splitRaces(
      [entry({ key: 'planned', eventDate: today }), entry({ key: 'done', eventDate: today, result: finished(5600) })],
      today,
    )
    expect(upcoming.map((e) => e.key)).toEqual(['planned'])
    expect(past.map((e) => e.key)).toEqual(['done'])
  })
})
