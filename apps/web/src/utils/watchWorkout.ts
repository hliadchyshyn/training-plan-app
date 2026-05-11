import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'

export const SPORT_LABELS: Record<WatchSport, string> = {
  RUNNING: 'Біг',
  CYCLING: 'Велосипед',
  SWIMMING: 'Плавання',
}

export const SPORT_OPTIONS: { value: WatchSport; label: string }[] = [
  { value: 'RUNNING', label: SPORT_LABELS.RUNNING },
  { value: 'CYCLING', label: SPORT_LABELS.CYCLING },
  { value: 'SWIMMING', label: SPORT_LABELS.SWIMMING },
]

const DEFAULT_SEC_PER_KM: Record<WatchSport, number> = {
  RUNNING: 330,
  CYCLING: 120,
  SWIMMING: 600,
}

export function estimateWorkoutDurationSec(steps: WatchWorkoutStep[], sport: WatchSport): number {
  let total = 0
  const stack: { count: number; subtotal: number }[] = []

  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') {
      stack.push({ count: step.repeatCount ?? 4, subtotal: 0 })
      continue
    }

    if (step.type === 'REPEAT_END') {
      const frame = stack.pop()
      if (!frame) continue

      const contribution = frame.subtotal * frame.count
      if (stack.length > 0) stack[stack.length - 1].subtotal += contribution
      else total += contribution
      continue
    }

    const duration = getStepDurationSec(step, sport)
    if (stack.length > 0) stack[stack.length - 1].subtotal += duration
    else total += duration
  }

  return Math.round(total)
}

export function formatEstimatedDuration(sec: number): string {
  if (sec <= 0) return ''

  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)

  if (hours > 0) return `~${hours}г ${minutes > 0 ? `${minutes} хв` : ''}`.trim()
  return minutes > 0 ? `~${minutes} хв` : '<1 хв'
}

function getStepDurationSec(step: WatchWorkoutStep, sport: WatchSport): number {
  if (!step.durationValue) return 0
  if (step.durationUnit === 'TIME') return step.durationValue

  if (step.durationUnit === 'DISTANCE') {
    const pace = step.targetFrom && step.targetTo
      ? (step.targetFrom + step.targetTo) / 2
      : (step.targetFrom ?? DEFAULT_SEC_PER_KM[sport])

    return (step.durationValue / 1000) * pace
  }

  return 0
}
