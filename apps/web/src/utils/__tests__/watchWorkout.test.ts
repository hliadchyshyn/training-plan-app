import { describe, expect, it } from 'vitest'
import type { WatchWorkoutStep } from '@training-plan/shared'
import { estimateWorkoutDurationSec, formatEstimatedDuration, SPORT_LABELS, SPORT_OPTIONS } from '../watchWorkout.js'

describe('watchWorkout labels', () => {
  it('exposes localized sport labels and options', () => {
    expect(SPORT_LABELS.RUNNING).toBe('Біг')
    expect(SPORT_OPTIONS).toContainEqual({ value: 'CYCLING', label: 'Велосипед' })
  })
})

describe('estimateWorkoutDurationSec', () => {
  it('sums time and distance steps with sport defaults', () => {
    const steps: WatchWorkoutStep[] = [
      { type: 'WARMUP', durationUnit: 'TIME', targetUnit: 'OPEN', durationValue: 600 },
      { type: 'ACTIVE', durationUnit: 'DISTANCE', targetUnit: 'OPEN', durationValue: 1000 },
    ]

    expect(estimateWorkoutDurationSec(steps, 'RUNNING')).toBe(930)
  })

  it('uses pace targets and repeat blocks', () => {
    const steps: WatchWorkoutStep[] = [
      { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 3 },
      { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 1000, targetUnit: 'PACE', targetFrom: 240, targetTo: 300 },
      { type: 'RECOVERY', durationUnit: 'TIME', targetUnit: 'OPEN', durationValue: 60 },
      { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
    ]

    expect(estimateWorkoutDurationSec(steps, 'RUNNING')).toBe(990)
  })

  it('ignores unmatched repeat ends and open durations', () => {
    const steps: WatchWorkoutStep[] = [
      { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
      { type: 'REST', durationUnit: 'OPEN', targetUnit: 'OPEN' },
    ]

    expect(estimateWorkoutDurationSec(steps, 'CYCLING')).toBe(0)
  })
})

describe('formatEstimatedDuration', () => {
  it('formats empty, sub-minute, minute, and hour durations', () => {
    expect(formatEstimatedDuration(0)).toBe('')
    expect(formatEstimatedDuration(30)).toBe('<1 хв')
    expect(formatEstimatedDuration(900)).toBe('~15 хв')
    expect(formatEstimatedDuration(3900)).toBe('~1г 5 хв')
    expect(formatEstimatedDuration(3600)).toBe('~1г')
  })
})
