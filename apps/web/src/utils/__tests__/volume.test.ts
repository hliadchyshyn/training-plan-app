import { describe, expect, it } from 'vitest'
import { calcVolumeKm, parseDistanceMeters } from '../volume.js'

describe('parseDistanceMeters', () => {
  it('parses km and meter values', () => {
    expect(parseDistanceMeters('1.5 км')).toBe(1500)
    expect(parseDistanceMeters('400m')).toBe(400)
  })

  it('returns 0 when there is no distance', () => {
    expect(parseDistanceMeters('easy run')).toBe(0)
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
