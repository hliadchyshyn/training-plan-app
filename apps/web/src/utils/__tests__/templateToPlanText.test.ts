import { describe, expect, it } from 'vitest'
import type { WatchWorkoutStep } from '@training-plan/shared'
import { templateStepsToPlanText } from '../templateToPlanText.js'

describe('templateStepsToPlanText', () => {
  it('renders durations, labels, pace targets, and repeats', () => {
    const steps: WatchWorkoutStep[] = [
      { type: 'WARMUP', durationUnit: 'TIME', targetUnit: 'OPEN', durationValue: 600 },
      { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 2 },
      { type: 'ACTIVE', name: 'Intervals', durationUnit: 'DISTANCE', durationValue: 1000, targetUnit: 'PACE', targetFrom: 240, targetTo: 255 },
      { type: 'RECOVERY', durationUnit: 'TIME', targetUnit: 'OPEN', durationValue: 75 },
      { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
      { type: 'COOLDOWN', durationUnit: 'OPEN', targetUnit: 'OPEN' },
    ]

    expect(templateStepsToPlanText(steps)).toBe([
      '10хв Розминка',
      '2x',
      '  1км Intervals @ 4:00-4:15/км',
      '  1хв 15с Відновлення',
      'відкрита Заминка',
    ].join('\n'))
  })

  it('uses default repeat count and clamps unmatched repeat ends', () => {
    const steps: WatchWorkoutStep[] = [
      { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
      { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN' },
      { type: 'REST', durationUnit: 'TIME', durationValue: 30, targetUnit: 'PACE', targetFrom: 300 },
      { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
    ]

    expect(templateStepsToPlanText(steps)).toBe('4x\n  30с Відпочинок @ 5:00/км')
  })

  it('formats meter and decimal kilometer distances', () => {
    const steps: WatchWorkoutStep[] = [
      { type: 'ACTIVE', durationUnit: 'DISTANCE', targetUnit: 'OPEN', durationValue: 400 },
      { type: 'ACTIVE', durationUnit: 'DISTANCE', targetUnit: 'OPEN', durationValue: 1500 },
    ]

    expect(templateStepsToPlanText(steps)).toBe('400м Активно\n1.5км Активно')
  })
})
