import { describe, it, expect } from 'vitest'
import { parsedDataToSteps } from '../planToWatch.js'
import type { ParsedWorkout, WatchWorkoutStep } from '@training-plan/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function workout(blocks: ParsedWorkout['blocks'], pace?: ParsedWorkout['pace']): ParsedWorkout {
  return { blocks, pace }
}

// ---------------------------------------------------------------------------
// parsedDataToSteps — edge cases
// ---------------------------------------------------------------------------

describe('parsedDataToSteps', () => {
  describe('null / empty input', () => {
    it('returns [] for null input', () => {
      expect(parsedDataToSteps(null)).toEqual([])
    })

    it('returns [] for undefined input', () => {
      expect(parsedDataToSteps(undefined)).toEqual([])
    })

    it('returns [] for object with no blocks', () => {
      expect(parsedDataToSteps({ blocks: [] })).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // Duration parsing (via durationUnit / durationValue)
  // ---------------------------------------------------------------------------

  describe('duration parsing', () => {
    it('parses "M:SS" duration → TIME step with value in seconds', () => {
      const steps = parsedDataToSteps(workout([{ duration: '3:00' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationUnit).toBe('TIME')
      expect(active.durationValue).toBe(180)
    })

    it('parses "90 сек" duration → TIME step with 90 seconds', () => {
      const steps = parsedDataToSteps(workout([{ duration: '90 сек' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationValue).toBe(90)
    })

    it('parses "3 хв" duration → TIME step with 180 seconds', () => {
      const steps = parsedDataToSteps(workout([{ duration: '3 хв' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationValue).toBe(180)
    })

    it('parses "5 min" duration → TIME step with 300 seconds', () => {
      const steps = parsedDataToSteps(workout([{ duration: '5 min' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationValue).toBe(300)
    })

    it('uses OPEN durationUnit when neither distance nor duration is present', () => {
      const steps = parsedDataToSteps(workout([{}]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationUnit).toBe('OPEN')
      expect(active.durationValue).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Distance parsing
  // ---------------------------------------------------------------------------

  describe('distance parsing', () => {
    it('parses "800м" → DISTANCE step with 800 meters', () => {
      const steps = parsedDataToSteps(workout([{ distance: '800м' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationUnit).toBe('DISTANCE')
      expect(active.durationValue).toBe(800)
    })

    it('parses "1.5км" → DISTANCE step with 1500 meters', () => {
      const steps = parsedDataToSteps(workout([{ distance: '1.5км' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationValue).toBe(1500)
    })

    it('parses "5km" → DISTANCE step with 5000 meters', () => {
      const steps = parsedDataToSteps(workout([{ distance: '5km' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationValue).toBe(5000)
    })

    it('distance takes precedence over duration when both present', () => {
      const steps = parsedDataToSteps(workout([{ distance: '1km', duration: '5 min' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.durationUnit).toBe('DISTANCE')
      expect(active.durationValue).toBe(1000)
    })
  })

  // ---------------------------------------------------------------------------
  // Pace target
  // ---------------------------------------------------------------------------

  describe('pace target', () => {
    it('sets targetUnit=PACE when pace.general is provided', () => {
      const steps = parsedDataToSteps(workout([{ distance: '5km' }], { general: '4:30' }))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.targetUnit).toBe('PACE')
    })

    it('sets targetFrom and targetTo for a pace range "4:00-4:30"', () => {
      const steps = parsedDataToSteps(workout([{ distance: '5km' }], { general: '4:00-4:30' }))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.targetFrom).toBe(240) // 4:00 = 240 s/km
      expect(active.targetTo).toBe(270)   // 4:30 = 270 s/km
    })

    it('sets targetFrom = targetTo for single pace "5:00"', () => {
      const steps = parsedDataToSteps(workout([{ distance: '5km' }], { general: '5:00' }))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.targetFrom).toBe(300)
      expect(active.targetTo).toBe(300)
    })

    it('parses pace with dot notation "4.30" same as "4:30"', () => {
      const steps = parsedDataToSteps(workout([{ distance: '5km' }], { general: '4.30' }))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.targetFrom).toBe(270)
    })

    it('falls back to men pace when general is not set', () => {
      const steps = parsedDataToSteps(workout([{ distance: '1km' }], { men: '4:00' }))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.targetUnit).toBe('PACE')
      expect(active.targetFrom).toBe(240)
    })

    it('sets targetUnit=OPEN when no pace is provided', () => {
      const steps = parsedDataToSteps(workout([{ distance: '1km' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.targetUnit).toBe('OPEN')
    })
  })

  // ---------------------------------------------------------------------------
  // Rest / recovery steps
  // ---------------------------------------------------------------------------

  describe('rest steps', () => {
    it('appends a RECOVERY step when rest is provided', () => {
      const steps = parsedDataToSteps(workout([{ distance: '400м', rest: '1:30' }]))
      const recovery = steps.find((s) => s.type === 'RECOVERY')
      expect(recovery).toBeDefined()
      expect(recovery!.durationValue).toBe(90)
      expect(recovery!.durationUnit).toBe('TIME')
    })

    it('does not add RECOVERY step when rest is absent', () => {
      const steps = parsedDataToSteps(workout([{ distance: '400м' }]))
      expect(steps.every((s) => s.type !== 'RECOVERY')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Repeat structures (sets / series)
  // ---------------------------------------------------------------------------

  describe('sets (single repeat layer)', () => {
    it('wraps steps in REPEAT_BEGIN / REPEAT_END for sets > 1', () => {
      const steps = parsedDataToSteps(workout([{ distance: '400м', sets: 5 }]))
      expect(steps[0].type).toBe('REPEAT_BEGIN')
      expect(steps[0].repeatCount).toBe(5)
      expect(steps[steps.length - 1].type).toBe('REPEAT_END')
    })

    it('produces correct order: REPEAT_BEGIN → ACTIVE → REPEAT_END', () => {
      const steps = parsedDataToSteps(workout([{ distance: '400м', sets: 3 }]))
      const types = steps.map((s) => s.type)
      expect(types).toEqual(['REPEAT_BEGIN', 'ACTIVE', 'REPEAT_END'])
    })

    it('includes RECOVERY inside the repeat block when rest is set', () => {
      const steps = parsedDataToSteps(workout([{ distance: '400м', sets: 4, rest: '90 сек' }]))
      const types = steps.map((s) => s.type)
      expect(types).toEqual(['REPEAT_BEGIN', 'ACTIVE', 'RECOVERY', 'REPEAT_END'])
    })

    it('does not add repeat markers when sets = 1', () => {
      const steps = parsedDataToSteps(workout([{ distance: '400м', sets: 1 }]))
      expect(steps.some((s) => s.type === 'REPEAT_BEGIN')).toBe(false)
    })
  })

  describe('series (nested / outer repeat layer)', () => {
    it('wraps in two REPEAT layers when both series > 1 and sets > 1', () => {
      const steps = parsedDataToSteps(workout([{ distance: '200м', sets: 4, series: 3 }]))
      const types = steps.map((s) => s.type)
      // outer series wrap + inner sets wrap
      expect(types[0]).toBe('REPEAT_BEGIN')    // outer: series=3
      expect(types[1]).toBe('REPEAT_BEGIN')    // inner: sets=4
      expect(types[2]).toBe('ACTIVE')
      expect(types[3]).toBe('REPEAT_END')      // inner end
      expect(types[4]).toBe('REPEAT_END')      // outer end
    })

    it('sets outer repeatCount to series and inner to sets', () => {
      const steps = parsedDataToSteps(workout([{ distance: '200м', sets: 4, series: 3 }]))
      expect(steps[0].repeatCount).toBe(3) // series
      expect(steps[1].repeatCount).toBe(4) // sets
    })

    it('places outer recovery step inside the outer repeat, before REPEAT_END, when seriesRest is set', () => {
      const steps = parsedDataToSteps(workout([{ distance: '200м', sets: 4, series: 3, seriesRest: '3 хв' }]))
      const outerRepeatEndIdx = steps.findLastIndex((s) => s.type === 'REPEAT_END')
      const recoveryStep = steps[outerRepeatEndIdx - 1]
      expect(recoveryStep.type).toBe('RECOVERY')
      expect(recoveryStep.durationValue).toBe(180)
      expect(steps[steps.length - 1].type).toBe('REPEAT_END')
    })

    it('handles series > 1 with sets = 1 (only outer repeat)', () => {
      const steps = parsedDataToSteps(workout([{ distance: '1km', series: 5 }]))
      const types = steps.map((s) => s.type)
      expect(types).toEqual(['REPEAT_BEGIN', 'ACTIVE', 'REPEAT_END'])
      expect(steps[0].repeatCount).toBe(5)
    })
  })

  // ---------------------------------------------------------------------------
  // Multi-block workouts
  // ---------------------------------------------------------------------------

  describe('multi-block workouts', () => {
    it('produces sequential steps for multiple blocks', () => {
      const steps = parsedDataToSteps(workout([
        { duration: '10 хв' },
        { distance: '5km' },
        { duration: '5 хв' },
      ]))
      const activeSteps = steps.filter((s) => s.type === 'ACTIVE')
      expect(activeSteps).toHaveLength(3)
    })

    it('applies the same pace target to all blocks', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '1km' },
        { distance: '2km' },
      ], { general: '4:00' }))
      const activeSteps = steps.filter((s) => s.type === 'ACTIVE')
      expect(activeSteps.every((s) => s.targetUnit === 'PACE')).toBe(true)
      expect(activeSteps.every((s) => s.targetFrom === 240)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Warmup / cooldown placement — regression for the Intervals.icu ordering bug.
  // When a workout has [warmup km, intervals, cooldown km], the warmup and
  // cooldown must be OUTSIDE the repeat block, not inside.
  // ---------------------------------------------------------------------------

  describe('warmup and cooldown outside repeat block', () => {
    it('warmup step comes before REPEAT_BEGIN', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '4km' },          // warmup
        { distance: '120м', sets: 3 }, // intervals
        { distance: '2km' },          // cooldown
      ]))
      const repeatBeginIdx = steps.findIndex((s) => s.type === 'REPEAT_BEGIN')
      expect(repeatBeginIdx).toBeGreaterThan(0)
      expect(steps[0].type).toBe('ACTIVE')
      expect(steps[0].durationValue).toBe(4000)
    })

    it('cooldown step comes after REPEAT_END', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '4km' },
        { distance: '120м', sets: 3 },
        { distance: '2km' },
      ]))
      const repeatEndIdx = steps.findLastIndex((s) => s.type === 'REPEAT_END')
      const lastStep = steps[steps.length - 1]
      expect(lastStep.type).toBe('ACTIVE')
      expect(lastStep.durationValue).toBe(2000)
      expect(steps.indexOf(lastStep)).toBeGreaterThan(repeatEndIdx)
    })

    it('step order is: ACTIVE(warmup) → REPEAT_BEGIN → ACTIVE(interval) → REPEAT_END → ACTIVE(cooldown)', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '4km' },
        { distance: '120м', sets: 3 },
        { distance: '2km' },
      ]))
      const types = steps.map((s) => s.type)
      expect(types).toEqual(['ACTIVE', 'REPEAT_BEGIN', 'ACTIVE', 'REPEAT_END', 'ACTIVE'])
    })

    it('nested repeat (series × sets) leaves warmup and cooldown outside both repeats', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '4km' },                              // warmup
        { distance: '120м', sets: 5, series: 3, seriesRest: '3 хв' }, // 3×5×120m
        { distance: '2km' },                              // cooldown
      ]))
      const types = steps.map((s) => s.type)
      // warmup before everything
      expect(types[0]).toBe('ACTIVE')
      // outer repeat opens
      expect(types[1]).toBe('REPEAT_BEGIN')
      // last ACTIVE step is the cooldown, after all repeats
      const lastRepeatEnd = types.lastIndexOf('REPEAT_END')
      expect(types[lastRepeatEnd - 1]).toBe('RECOVERY') // seriesRest, inside the outer repeat
      expect(types[types.length - 1]).toBe('ACTIVE')    // cooldown
      expect(steps[types.length - 1].durationValue).toBe(2000)
    })

    it('warmup only (no cooldown) — warmup is before the repeat', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '3km' },
        { distance: '400м', sets: 4 },
      ]))
      expect(steps[0].type).toBe('ACTIVE')
      expect(steps[0].durationValue).toBe(3000)
      expect(steps[1].type).toBe('REPEAT_BEGIN')
    })

    it('cooldown only (no warmup) — cooldown is after the repeat', () => {
      const steps = parsedDataToSteps(workout([
        { distance: '400м', sets: 4 },
        { distance: '1km' },
      ]))
      expect(steps[0].type).toBe('REPEAT_BEGIN')
      expect(steps[steps.length - 1].type).toBe('ACTIVE')
      expect(steps[steps.length - 1].durationValue).toBe(1000)
    })

    it('multiple km blocks around a repeat are all placed correctly', () => {
      // 2km warm → 5×200m → 1km jog → 3×400m → 2km cool
      const steps = parsedDataToSteps(workout([
        { distance: '2km' },
        { distance: '200м', sets: 5 },
        { distance: '1km' },
        { distance: '400м', sets: 3 },
        { distance: '2km' },
      ]))
      const types = steps.map((s) => s.type)
      // First step is 2km warmup
      expect(types[0]).toBe('ACTIVE')
      expect(steps[0].durationValue).toBe(2000)
      // Last step is 2km cooldown
      expect(types[types.length - 1]).toBe('ACTIVE')
      expect(steps[types.length - 1].durationValue).toBe(2000)
      // Two repeat blocks exist
      expect(types.filter((t) => t === 'REPEAT_BEGIN')).toHaveLength(2)
    })
  })

  // ---------------------------------------------------------------------------
  // Step name propagation
  // ---------------------------------------------------------------------------

  describe('step name', () => {
    it('uses distance string as step name', () => {
      const steps = parsedDataToSteps(workout([{ distance: '5km' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.name).toBe('5km')
    })

    it('uses duration string as step name when distance is absent', () => {
      const steps = parsedDataToSteps(workout([{ duration: '30 хв' }]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.name).toBe('30 хв')
    })

    it('step name is undefined when neither distance nor duration is present', () => {
      const steps = parsedDataToSteps(workout([{}]))
      const active = steps.find((s) => s.type === 'ACTIVE')!
      expect(active.name).toBeUndefined()
    })
  })
})
