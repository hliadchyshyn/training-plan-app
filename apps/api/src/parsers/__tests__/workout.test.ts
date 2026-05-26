import { describe, it, expect } from 'vitest'
import { parseWorkout } from '../workout.js'

// ---------------------------------------------------------------------------
// Block ordering — the main regression test for the warmup/cooldown bug.
// Before the fix, intervalPattern matches were always pushed first regardless
// of where they appeared in the text, so "4км warmup → 3*120м → 2км cooldown"
// produced blocks in order [3*120м, 4km, 2km] instead of [4km, 3*120м, 2km].
// ---------------------------------------------------------------------------

describe('parseWorkout — block ordering', () => {
  it('warmup km before intervals preserves warmup as first block', () => {
    const text = '4км розминка\n3*120м\n2км заминка'
    const result = parseWorkout(text)!
    expect(result.blocks[0].distance).toBe('4km')
    expect(result.blocks[1].sets).toBe(3)
    expect(result.blocks[1].distance).toBe('120м')
    expect(result.blocks[2].distance).toBe('2km')
  })

  it('intervals before warmup km puts intervals first', () => {
    const text = '3*120м\n4км розминка'
    const result = parseWorkout(text)!
    expect(result.blocks[0].sets).toBe(3)
    expect(result.blocks[1].distance).toBe('4km')
  })

  it('cooldown km after intervals is the last block', () => {
    const text = '5*400м через 90 сек\n2км заминка'
    const result = parseWorkout(text)!
    expect(result.blocks[0].sets).toBe(5)
    expect(result.blocks[0].distance).toBe('400м')
    expect(result.blocks[result.blocks.length - 1].distance).toBe('2km')
  })

  it('three-part workout: warmup → intervals → cooldown preserves text order', () => {
    const text = '4км активація\n3*120м відрізки\n2км заминка'
    const result = parseWorkout(text)!
    expect(result.blocks).toHaveLength(3)
    expect(result.blocks[0].distance).toBe('4km')
    expect(result.blocks[1].sets).toBe(3)
    expect(result.blocks[2].distance).toBe('2km')
  })

  it('multiple interval blocks maintain their relative order', () => {
    const text = '3*200м швидко\n4*400м через 2 хв\n3км заминка'
    const result = parseWorkout(text)!
    expect(result.blocks[0].sets).toBe(3)
    expect(result.blocks[0].distance).toBe('200м')
    expect(result.blocks[1].sets).toBe(4)
    expect(result.blocks[1].distance).toBe('400м')
    expect(result.blocks[2].distance).toBe('3km')
  })

  it('warmup between two interval blocks is placed correctly', () => {
    const text = '5*100м спринт\n2км відновлення\n4*300м темп'
    const result = parseWorkout(text)!
    expect(result.blocks[0].sets).toBe(5)
    expect(result.blocks[1].distance).toBe('2km')
    expect(result.blocks[2].sets).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Interval pattern parsing
// ---------------------------------------------------------------------------

describe('parseWorkout — interval blocks', () => {
  it('parses "3*120м" → sets=3 distance="120м"', () => {
    const result = parseWorkout('3*120м')!
    expect(result.blocks[0]).toMatchObject({ sets: 3, distance: '120м' })
  })

  it('parses "4x400m" (Latin x)', () => {
    const result = parseWorkout('4x400m')!
    expect(result.blocks[0]).toMatchObject({ sets: 4, distance: '400m' })
  })

  it('parses "5×200м" (multiplication sign)', () => {
    const result = parseWorkout('5×200м')!
    expect(result.blocks[0]).toMatchObject({ sets: 5, distance: '200м' })
  })

  it('parses rest after interval: "3*400м через 2 хв"', () => {
    const result = parseWorkout('3*400м через 2 хв')!
    expect(result.blocks[0].rest).toBe('2 хв')
  })

  it('parses series count "3 серії" and attaches to interval block', () => {
    const result = parseWorkout('5*400м через 90 сек. 3 серії між серіями 5 хв')!
    const intervalBlock = result.blocks.find((b) => b.sets !== undefined)!
    expect(intervalBlock.series).toBe(3)
  })

  it('attaches seriesRest to interval block, not a km block', () => {
    const text = '4км розминка\n5*400м\n3 серії між серіями 5 хв\n2км заминка'
    const result = parseWorkout(text)!
    const intervalBlock = result.blocks.find((b) => b.sets !== undefined)!
    expect(intervalBlock.series).toBe(3)
    expect(intervalBlock.seriesRest).toBe('5 хв')
    // km blocks should not have series
    const kmBlocks = result.blocks.filter((b) => b.sets === undefined)
    expect(kmBlocks.every((b) => b.series === undefined)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Plain km blocks
// ---------------------------------------------------------------------------

describe('parseWorkout — plain km blocks', () => {
  it('parses standalone "4км" as distance block', () => {
    const result = parseWorkout('4км розминка')!
    expect(result.blocks[0]).toMatchObject({ distance: '4km' })
  })

  it('does not double-count km inside an interval match', () => {
    const result = parseWorkout('3*2км')!
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].sets).toBe(3)
    expect(result.blocks[0].distance).toBe('2км')
  })

  it('parses "2km" (Latin)', () => {
    const result = parseWorkout('2km легко')!
    expect(result.blocks[0]).toMatchObject({ distance: '2km' })
  })
})

// ---------------------------------------------------------------------------
// Pace parsing
// ---------------------------------------------------------------------------

describe('parseWorkout — pace', () => {
  it('parses general pace "пейс 4:30"', () => {
    const result = parseWorkout('5км пейс 4:30')!
    expect(result.pace?.general).toBe('4:30')
  })

  it('parses men/women pace', () => {
    const result = parseWorkout('4*800м. Пейс 3.45-3.50 хлопці 4.10-4.20 дівчата')!
    expect(result.pace?.men).toBe('3:45-3:50')
    expect(result.pace?.women).toBe('4:10-4:20')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('parseWorkout — edge cases', () => {
  it('returns null for plain text with no workout patterns', () => {
    expect(parseWorkout('Відпочинок')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseWorkout('')).toBeNull()
  })

  it('parses duration run "25 хв бігу" when no distance blocks present', () => {
    const result = parseWorkout('25 хв бігу легко')!
    expect(result.blocks[0]).toMatchObject({ duration: '25 хв' })
  })
})
