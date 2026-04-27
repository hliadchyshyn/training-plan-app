import type { WatchWorkoutStep } from '@training-plan/shared'

const STEP_LABEL: Record<WatchWorkoutStep['type'], string> = {
  WARMUP: 'Розминка',
  ACTIVE: 'Активно',
  RECOVERY: 'Відновлення',
  COOLDOWN: 'Заминка',
  REST: 'Відпочинок',
  REPEAT_BEGIN: 'Повтор',
  REPEAT_END: 'Кінець повтору',
}

function formatPace(secPerKm: number): string {
  const minutes = Math.floor(secPerKm / 60)
  const seconds = secPerKm % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatDuration(step: WatchWorkoutStep): string {
  if (step.durationUnit === 'DISTANCE' && step.durationValue) {
    return step.durationValue >= 1000
      ? `${(step.durationValue / 1000).toFixed(step.durationValue % 1000 === 0 ? 0 : 1)}км`
      : `${step.durationValue}м`
  }

  if (step.durationUnit === 'TIME' && step.durationValue) {
    const minutes = Math.floor(step.durationValue / 60)
    const seconds = step.durationValue % 60
    if (minutes > 0 && seconds > 0) return `${minutes}хв ${seconds}с`
    if (minutes > 0) return `${minutes}хв`
    return `${seconds}с`
  }

  return 'відкрита'
}

function formatTarget(step: WatchWorkoutStep): string {
  if (step.targetUnit === 'PACE' && step.targetFrom && step.targetTo) {
    return `${formatPace(step.targetFrom)}-${formatPace(step.targetTo)}/км`
  }
  if (step.targetUnit === 'PACE' && step.targetFrom) {
    return `${formatPace(step.targetFrom)}/км`
  }
  return ''
}

export function templateStepsToPlanText(steps: WatchWorkoutStep[]): string {
  const lines: string[] = []
  let depth = 0

  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') {
      lines.push(`${'  '.repeat(depth)}${step.repeatCount ?? 4}x`)
      depth += 1
      continue
    }

    if (step.type === 'REPEAT_END') {
      depth = Math.max(0, depth - 1)
      continue
    }

    const parts = [formatDuration(step), step.name ?? STEP_LABEL[step.type]]
    const target = formatTarget(step)
    if (target) parts.push(`@ ${target}`)

    lines.push(`${'  '.repeat(depth)}${parts.join(' ')}`)
  }

  return lines.join('\n').trim()
}
