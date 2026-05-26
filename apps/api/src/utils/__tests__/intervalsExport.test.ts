import { describe, it, expect } from 'vitest'
import { stepsToIntervalsMarkdown } from '../intervalsExport.js'
import type { WatchWorkoutStep } from '@training-plan/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPEAT_BEGIN = (count: number): WatchWorkoutStep => ({
  type: 'REPEAT_BEGIN', repeatCount: count, durationUnit: 'OPEN', targetUnit: 'OPEN',
})
const REPEAT_END: WatchWorkoutStep = { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' }

const active = (meters: number): WatchWorkoutStep => ({
  type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: meters, targetUnit: 'OPEN',
})

const recovery = (seconds: number): WatchWorkoutStep => ({
  type: 'RECOVERY', durationUnit: 'TIME', durationValue: seconds, targetUnit: 'OPEN',
})

// ---------------------------------------------------------------------------
// stepsToIntervalsMarkdown — structure tests
// ---------------------------------------------------------------------------

describe('stepsToIntervalsMarkdown', () => {
  describe('flat steps', () => {
    it('renders a single ACTIVE step as one line (no zone for ACTIVE)', () => {
      const out = stepsToIntervalsMarkdown([active(5000)])
      expect(out).toBe('5km Active')
    })

    it('renders ACTIVE then RECOVERY as two lines, same indentation', () => {
      const lines = stepsToIntervalsMarkdown([active(400), recovery(90)]).split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).not.toMatch(/^\s/)
      expect(lines[1]).not.toMatch(/^\s/)
    })
  })

  describe('repeat blocks', () => {
    it('renders repeat header "Nx" with children indented', () => {
      const steps: WatchWorkoutStep[] = [
        REPEAT_BEGIN(4),
        active(400),
        recovery(90),
        REPEAT_END,
      ]
      const lines = stepsToIntervalsMarkdown(steps).split('\n')
      expect(lines[0]).toBe('4x')
      expect(lines[1]).toMatch(/^\s{2}/)
      expect(lines[2]).toMatch(/^\s{2}/)
    })

    it('steps after repeat are NOT indented', () => {
      const steps: WatchWorkoutStep[] = [
        REPEAT_BEGIN(3),
        active(200),
        REPEAT_END,
        active(2000), // cooldown — must be outside
      ]
      const lines = stepsToIntervalsMarkdown(steps).split('\n')
      expect(lines[0]).toBe('3x')
      expect(lines[1]).toMatch(/^\s{2}/)   // inside
      expect(lines[2]).not.toMatch(/^\s/)  // outside
    })
  })

  describe('warmup → repeat → cooldown structure', () => {
    it('warmup line has no indentation (comes before Nx)', () => {
      const steps: WatchWorkoutStep[] = [
        active(4000),      // warmup
        REPEAT_BEGIN(3),
        active(120),
        REPEAT_END,
        active(2000),      // cooldown
      ]
      const lines = stepsToIntervalsMarkdown(steps).split('\n')
      // line 0: warmup
      expect(lines[0]).not.toMatch(/^\s/)
      expect(lines[0]).toMatch(/4km/)
      // line 1: repeat header
      expect(lines[1]).toBe('3x')
      // line 2: inside repeat (indented)
      expect(lines[2]).toMatch(/^\s{2}/)
      // line 3: cooldown (not indented)
      expect(lines[3]).not.toMatch(/^\s/)
      expect(lines[3]).toMatch(/2km/)
    })

    it('produces exactly 4 lines for warmup+3x(1 step)+cooldown', () => {
      const steps: WatchWorkoutStep[] = [
        active(4000),
        REPEAT_BEGIN(3),
        active(120),
        REPEAT_END,
        active(2000),
      ]
      const lines = stepsToIntervalsMarkdown(steps).split('\n')
      expect(lines).toHaveLength(4)
    })

    it('nested repeat: warmup and cooldown are outside both Nx lines', () => {
      const steps: WatchWorkoutStep[] = [
        active(4000),          // warmup
        REPEAT_BEGIN(3),       // outer
        REPEAT_BEGIN(5),       // inner
        active(120),
        recovery(120),
        REPEAT_END,            // inner end
        recovery(180),         // series rest
        REPEAT_END,            // outer end
        active(2000),          // cooldown
      ]
      const lines = stepsToIntervalsMarkdown(steps).split('\n')

      // First line: warmup, no indent
      expect(lines[0]).not.toMatch(/^\s/)
      expect(lines[0]).toMatch(/4km/)

      // Last line: cooldown, no indent
      const lastLine = lines[lines.length - 1]
      expect(lastLine).not.toMatch(/^\s/)
      expect(lastLine).toMatch(/2km/)

      // There must be a '3x' line and a '  5x' line
      expect(lines.some((l) => l === '3x')).toBe(true)
      expect(lines.some((l) => l === '  5x')).toBe(true)
    })
  })

  describe('distance formatting', () => {
    it('converts 120m to "0.12km"', () => {
      const out = stepsToIntervalsMarkdown([active(120)])
      expect(out).toContain('0.12km')
    })

    it('converts 4000m to "4km"', () => {
      const out = stepsToIntervalsMarkdown([active(4000)])
      expect(out).toContain('4km')
    })

    it('converts 1500m to "1.5km"', () => {
      const out = stepsToIntervalsMarkdown([active(1500)])
      expect(out).toContain('1.5km')
    })
  })

  describe('step zones', () => {
    it('ACTIVE step has no zone label', () => {
      const out = stepsToIntervalsMarkdown([active(400)])
      expect(out).not.toMatch(/Z\d/)
    })

    it('RECOVERY step includes Z1', () => {
      const out = stepsToIntervalsMarkdown([recovery(90)])
      expect(out).toContain('Z1')
    })
  })

  describe('pace targets', () => {
    it('renders pace range as "M:SS-M:SS/km Pace"', () => {
      const paceStep: WatchWorkoutStep = {
        type: 'ACTIVE',
        durationUnit: 'DISTANCE',
        durationValue: 400,
        targetUnit: 'PACE',
        targetFrom: 240,
        targetTo: 270,
      }
      const out = stepsToIntervalsMarkdown([paceStep])
      expect(out).toContain('4:00-4:30/km Pace')
    })
  })

  describe('heart rate targets', () => {
    it('renders HR range as "130-150bpm HR"', () => {
      const hrStep: WatchWorkoutStep = {
        type: 'ACTIVE',
        durationUnit: 'DISTANCE',
        durationValue: 5000,
        targetUnit: 'HEART_RATE_ZONE',
        targetFrom: 130,
        targetTo: 150,
      }
      const out = stepsToIntervalsMarkdown([hrStep])
      expect(out).toContain('130-150bpm HR')
    })

    it('renders single HR value as "140bpm HR"', () => {
      const hrStep: WatchWorkoutStep = {
        type: 'ACTIVE',
        durationUnit: 'TIME',
        durationValue: 1800,
        targetUnit: 'HEART_RATE_ZONE',
        targetFrom: 140,
      }
      const out = stepsToIntervalsMarkdown([hrStep])
      expect(out).toContain('140bpm HR')
    })

    it('HR target overrides default zone label', () => {
      const hrWarmup: WatchWorkoutStep = {
        type: 'WARMUP',
        durationUnit: 'DISTANCE',
        durationValue: 2000,
        targetUnit: 'HEART_RATE_ZONE',
        targetFrom: 120,
        targetTo: 135,
      }
      const out = stepsToIntervalsMarkdown([hrWarmup])
      expect(out).toContain('120-135bpm HR')
      expect(out).not.toContain('Z1')
    })
  })
})
