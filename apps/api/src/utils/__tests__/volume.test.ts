import { describe, expect, it } from 'vitest'
import { calcVolumeKm, parseDistanceMeters } from '@training-plan/shared'

describe('parseDistanceMeters', () => {
  it('parses km and meter values', () => {
    expect(parseDistanceMeters('1.5 км')).toBe(1500)
    expect(parseDistanceMeters('400m')).toBe(400)
  })

  it('returns 0 when there is no distance', () => {
    expect(parseDistanceMeters('easy run')).toBe(0)
  })

  it('does not read minutes as meters', () => {
    expect(parseDistanceMeters('5 min')).toBe(0)
    expect(parseDistanceMeters('3 мін')).toBe(0)
  })

  it('still parses a unit followed by punctuation or more text', () => {
    expect(parseDistanceMeters('800м,')).toBe(800)
    expect(parseDistanceMeters('2km easy')).toBe(2000)
  })
})

describe('calcVolumeKm', () => {
  it('sums blocks with sets and series', () => {
    expect(calcVolumeKm({
      blocks: [
        { distance: '1 км', sets: 3 },
        { distance: '500м', sets: 2, series: 2 },
      ],
    })).toBe(5)
  })

  it('returns 0 for missing parsed blocks', () => {
    expect(calcVolumeKm(null)).toBe(0)
    expect(calcVolumeKm({ blocks: [] })).toBe(0)
  })
})
