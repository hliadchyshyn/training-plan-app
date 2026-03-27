import type { ParsedWorkout, WatchWorkoutStep, WatchTargetUnit } from '@training-plan/shared'

/** Parse duration strings like "3 хв", "90 сек", "1:30" → seconds */
function parseDurationSeconds(str: string): number {
  const trimmed = str.trim()
  // "1:30" → 90
  const colonMatch = trimmed.match(/^(\d+):(\d+)$/)
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
  // "90 сек"
  const secMatch = trimmed.match(/(\d+)\s*(сек|sec|s)\b/i)
  if (secMatch) return parseInt(secMatch[1])
  // "3 хв", "3 хвилини", "3 min"
  const minMatch = trimmed.match(/(\d+)\s*(хв|хвилин|min|m)\b/i)
  if (minMatch) return parseInt(minMatch[1]) * 60
  return 0
}

/** Parse distance strings like "800м", "1.5км", "5km" → meters */
function parseDistanceMeters(str: string): number {
  const trimmed = str.trim()
  const kmMatch = trimmed.match(/([\d.]+)\s*(км|km)/i)
  if (kmMatch) return Math.round(parseFloat(kmMatch[1]) * 1000)
  const mMatch = trimmed.match(/([\d.]+)\s*(м|m)\b/i)
  if (mMatch) return Math.round(parseFloat(mMatch[1]))
  return 0
}

/** Parse pace string like "4:30" or "4.30" → seconds per km */
function parsePaceSecondsPerKm(str: string): number {
  const trimmed = str.replace('.', ':').trim()
  const match = trimmed.match(/^(\d+):(\d+)$/)
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2])
  return 0
}

/** Parse pace range "4:00-4:30" → [from, to] in seconds/km */
function parsePaceRange(str: string): [number, number] | null {
  const parts = str.split('-')
  if (parts.length === 2) {
    const from = parsePaceSecondsPerKm(parts[0].trim())
    const to = parsePaceSecondsPerKm(parts[1].trim())
    if (from > 0 && to > 0) return [from, to]
  }
  const single = parsePaceSecondsPerKm(str.trim())
  if (single > 0) return [single, single]
  return null
}

/**
 * Convert ParsedWorkout into WatchWorkoutStep[].
 * Handles series, sets, distance, duration, rest, seriesRest.
 */
export function parsedDataToSteps(parsedData: unknown): WatchWorkoutStep[] {
  const data = parsedData as ParsedWorkout | null
  if (!data?.blocks?.length) return []

  const steps: WatchWorkoutStep[] = []
  const pace = data.pace

  // Determine pace target from general or men/women pace
  const paceStr = pace?.general ?? pace?.men ?? null
  const paceRange = paceStr ? parsePaceRange(paceStr) : null
  const targetUnit: WatchTargetUnit = paceRange ? 'PACE' : 'OPEN'

  for (const block of data.blocks) {
    const distanceM = block.distance ? parseDistanceMeters(block.distance) : 0
    const durationSec = block.duration ? parseDurationSeconds(block.duration) : 0
    const restSec = block.rest ? parseDurationSeconds(block.rest) : 0
    const seriesRestSec = block.seriesRest ? parseDurationSeconds(block.seriesRest) : 0
    const sets = block.sets ?? 1
    const series = block.series ?? 1

    const activeStep: WatchWorkoutStep = {
      type: 'ACTIVE',
      durationUnit: distanceM > 0 ? 'DISTANCE' : durationSec > 0 ? 'TIME' : 'OPEN',
      durationValue: distanceM > 0 ? distanceM : durationSec > 0 ? durationSec : undefined,
      targetUnit,
      targetFrom: paceRange?.[0],
      targetTo: paceRange?.[1],
      name: block.distance ?? block.duration ?? undefined,
    }

    const recoveryStep: WatchWorkoutStep | null = restSec > 0
      ? { type: 'RECOVERY', durationUnit: 'TIME', durationValue: restSec, targetUnit: 'OPEN' }
      : null

    const outerRecovery: WatchWorkoutStep | null = seriesRestSec > 0
      ? { type: 'RECOVERY', durationUnit: 'TIME', durationValue: seriesRestSec, targetUnit: 'OPEN' }
      : null

    if (series > 1) {
      // Outer repeat for series
      steps.push({ type: 'REPEAT_BEGIN', repeatCount: series, durationUnit: 'OPEN', targetUnit: 'OPEN' })

      if (sets > 1) {
        // Inner repeat for sets
        steps.push({ type: 'REPEAT_BEGIN', repeatCount: sets, durationUnit: 'OPEN', targetUnit: 'OPEN' })
        steps.push(activeStep)
        if (recoveryStep) steps.push(recoveryStep)
        steps.push({ type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' })
      } else {
        steps.push(activeStep)
        if (recoveryStep) steps.push(recoveryStep)
      }

      steps.push({ type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' })
      if (outerRecovery) steps.push(outerRecovery)
    } else if (sets > 1) {
      steps.push({ type: 'REPEAT_BEGIN', repeatCount: sets, durationUnit: 'OPEN', targetUnit: 'OPEN' })
      steps.push(activeStep)
      if (recoveryStep) steps.push(recoveryStep)
      steps.push({ type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' })
    } else {
      steps.push(activeStep)
      if (recoveryStep) steps.push(recoveryStep)
    }
  }

  return steps
}
