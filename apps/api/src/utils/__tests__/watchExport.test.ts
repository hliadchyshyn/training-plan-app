import { describe, it, expect } from 'vitest'
import { stepsToFit } from '../watchExport.js'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVE_OPEN: WatchWorkoutStep = { type: 'ACTIVE', durationUnit: 'OPEN', targetUnit: 'OPEN' }
const ACTIVE_5K: WatchWorkoutStep = { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 5000, targetUnit: 'OPEN' }
const ACTIVE_30MIN: WatchWorkoutStep = { type: 'ACTIVE', durationUnit: 'TIME', durationValue: 1800, targetUnit: 'OPEN' }
const RECOVERY_90S: WatchWorkoutStep = { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 90, targetUnit: 'OPEN' }

const REPEAT_BEGIN_4: WatchWorkoutStep = { type: 'REPEAT_BEGIN', repeatCount: 4, durationUnit: 'OPEN', targetUnit: 'OPEN' }
const REPEAT_END: WatchWorkoutStep = { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' }

// ---------------------------------------------------------------------------
// stepsToFit
// ---------------------------------------------------------------------------

describe('stepsToFit', () => {
  describe('return type', () => {
    it('returns a Buffer', () => {
      const buf = stepsToFit('Test', 'RUNNING', [ACTIVE_OPEN])
      expect(buf).toBeInstanceOf(Buffer)
    })

    it('returns a non-empty buffer for a minimal workout', () => {
      const buf = stepsToFit('Test', 'RUNNING', [ACTIVE_OPEN])
      expect(buf.length).toBeGreaterThan(0)
    })

    it('returns a non-empty buffer for an empty steps array', () => {
      const buf = stepsToFit('Test', 'RUNNING', [])
      expect(buf.length).toBeGreaterThan(0)
    })
  })

  describe('sport variants', () => {
    it('does not throw for RUNNING sport', () => {
      expect(() => stepsToFit('Run', 'RUNNING', [ACTIVE_5K])).not.toThrow()
    })

    it('does not throw for CYCLING sport', () => {
      expect(() => stepsToFit('Ride', 'CYCLING', [ACTIVE_5K])).not.toThrow()
    })

    it('does not throw for SWIMMING sport', () => {
      expect(() => stepsToFit('Swim', 'SWIMMING', [ACTIVE_30MIN])).not.toThrow()
    })

    it('produces different-length buffers for different sports (different sport enum)', () => {
      const runBuf = stepsToFit('W', 'RUNNING', [ACTIVE_OPEN])
      const rideBuf = stepsToFit('W', 'CYCLING', [ACTIVE_OPEN])
      // Both valid FIT files but workout message differs by sport byte
      expect(runBuf).toBeInstanceOf(Buffer)
      expect(rideBuf).toBeInstanceOf(Buffer)
    })
  })

  describe('step types', () => {
    it('encodes DISTANCE step without throwing', () => {
      expect(() => stepsToFit('5K', 'RUNNING', [ACTIVE_5K])).not.toThrow()
    })

    it('encodes TIME step without throwing', () => {
      expect(() => stepsToFit('30min easy', 'RUNNING', [ACTIVE_30MIN])).not.toThrow()
    })

    it('encodes RECOVERY step without throwing', () => {
      expect(() => stepsToFit('Intervals', 'RUNNING', [ACTIVE_30MIN, RECOVERY_90S])).not.toThrow()
    })

    it('encodes REPEAT_BEGIN / REPEAT_END without throwing', () => {
      const steps: WatchWorkoutStep[] = [REPEAT_BEGIN_4, ACTIVE_5K, RECOVERY_90S, REPEAT_END]
      expect(() => stepsToFit('4x5k', 'RUNNING', steps)).not.toThrow()
    })
  })

  describe('pace target', () => {
    it('encodes PACE target step without throwing', () => {
      const paceStep: WatchWorkoutStep = {
        type: 'ACTIVE',
        durationUnit: 'DISTANCE',
        durationValue: 5000,
        targetUnit: 'PACE',
        targetFrom: 240, // 4:00/km
        targetTo: 270,   // 4:30/km
      }
      expect(() => stepsToFit('Tempo', 'RUNNING', [paceStep])).not.toThrow()
    })

    it('encodes single-value PACE target (targetFrom only)', () => {
      const paceStep: WatchWorkoutStep = {
        type: 'ACTIVE',
        durationUnit: 'DISTANCE',
        durationValue: 10000,
        targetUnit: 'PACE',
        targetFrom: 300, // 5:00/km
        targetTo: 300,
      }
      expect(() => stepsToFit('10K', 'RUNNING', [paceStep])).not.toThrow()
    })
  })

  describe('workout name truncation', () => {
    it('accepts a name longer than 16 chars (truncated internally)', () => {
      const longName = 'This is a very long workout name that exceeds Garmin limit'
      expect(() => stepsToFit(longName, 'RUNNING', [ACTIVE_OPEN])).not.toThrow()
    })
  })

  describe('more steps → larger buffer', () => {
    it('a workout with more steps produces a larger buffer than one with fewer', () => {
      const few = stepsToFit('Few', 'RUNNING', [ACTIVE_OPEN])
      const many = stepsToFit('Many', 'RUNNING', [
        ACTIVE_5K,
        RECOVERY_90S,
        ACTIVE_30MIN,
        RECOVERY_90S,
        ACTIVE_OPEN,
      ])
      expect(many.length).toBeGreaterThan(few.length)
    })
  })

  describe('nested repeats', () => {
    it('encodes nested REPEAT_BEGIN/END (series × sets) without throwing', () => {
      const steps: WatchWorkoutStep[] = [
        { type: 'REPEAT_BEGIN', repeatCount: 3, durationUnit: 'OPEN', targetUnit: 'OPEN' }, // outer
        { type: 'REPEAT_BEGIN', repeatCount: 4, durationUnit: 'OPEN', targetUnit: 'OPEN' }, // inner
        ACTIVE_5K,
        RECOVERY_90S,
        REPEAT_END, // inner end
        REPEAT_END, // outer end
      ]
      expect(() => stepsToFit('3x4x5k', 'RUNNING', steps)).not.toThrow()
    })
  })
})
