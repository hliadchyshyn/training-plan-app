import { parseDistanceMeters } from '@training-plan/shared'
import type { ParsedWorkout, WatchWorkoutStep, WatchTargetUnit, WorkoutBlock, PaceInfo } from '@training-plan/shared'

/** Parse duration strings like "3 хв", "90 сек", "1:30" → seconds */
function parseDurationSeconds(str: string): number {
  const trimmed = str.trim()
  // "1:30" → 90
  const colonMatch = trimmed.match(/^(\d+):(\d+)$/)
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
  // "90 сек" — \b after Cyrillic doesn't work, so apply \b only to ASCII alternatives
  const secMatch = trimmed.match(/(\d+)\s*(сек|sec\b|s\b)/i)
  if (secMatch) return parseInt(secMatch[1])
  // "3 хв", "3 хвилини", "3 min"
  const minMatch = trimmed.match(/(\d+)\s*(хв|хвилин|min\b|m\b)/i)
  if (minMatch) return parseInt(minMatch[1]) * 60
  return 0
}

/**
 * Build the RECOVERY step for a rest string: "200m" → distance recovery,
 * "90 сек" / "1:30" → time recovery. Distance is checked first because
 * parseDurationSeconds reads a bare "m" as minutes.
 */
function recoveryStep(rest: string | undefined): WatchWorkoutStep | null {
  if (!rest) return null
  const meters = Math.round(parseDistanceMeters(rest))
  if (meters > 0) return { type: 'RECOVERY', durationUnit: 'DISTANCE', durationValue: meters, targetUnit: 'OPEN' }
  const seconds = parseDurationSeconds(rest)
  if (seconds > 0) return { type: 'RECOVERY', durationUnit: 'TIME', durationValue: seconds, targetUnit: 'OPEN' }
  return null
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
    const distanceM = block.distance ? Math.round(parseDistanceMeters(block.distance)) : 0
    const durationSec = block.duration ? parseDurationSeconds(block.duration) : 0
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

    const restStep = recoveryStep(block.rest)
    const outerRecovery = recoveryStep(block.seriesRest)

    if (series > 1) {
      // Outer repeat for series
      steps.push({ type: 'REPEAT_BEGIN', repeatCount: series, durationUnit: 'OPEN', targetUnit: 'OPEN' })

      if (sets > 1) {
        // Inner repeat for sets
        steps.push({ type: 'REPEAT_BEGIN', repeatCount: sets, durationUnit: 'OPEN', targetUnit: 'OPEN' })
        steps.push(activeStep)
        if (restStep) steps.push(restStep)
        steps.push({ type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' })
      } else {
        steps.push(activeStep)
        if (restStep) steps.push(restStep)
      }

      if (outerRecovery) steps.push(outerRecovery)
      steps.push({ type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' })
    } else if (sets > 1) {
      steps.push({ type: 'REPEAT_BEGIN', repeatCount: sets, durationUnit: 'OPEN', targetUnit: 'OPEN' })
      steps.push(activeStep)
      if (restStep) steps.push(restStep)
      steps.push({ type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' })
    } else {
      steps.push(activeStep)
      if (restStep) steps.push(restStep)
    }
  }

  return steps
}

function formatDistanceMeters(meters: number): string {
  return meters >= 1000 ? `${meters / 1000}km` : `${meters}m`
}

function formatSecondsColon(sec: number): string {
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function stepDurationBlock(step: WatchWorkoutStep): WorkoutBlock {
  if (step.durationUnit === 'DISTANCE' && step.durationValue) {
    return { distance: formatDistanceMeters(step.durationValue) }
  }
  if (step.durationUnit === 'TIME' && step.durationValue) {
    return { duration: formatSecondsColon(step.durationValue) }
  }
  return {}
}

/** A recovery's length as block text: "200m" for distance, "1:30" for time; undefined when open. */
function formatRecovery(step: WatchWorkoutStep): string | undefined {
  if (!step.durationValue) return undefined
  if (step.durationUnit === 'DISTANCE') return formatDistanceMeters(step.durationValue)
  if (step.durationUnit === 'TIME') return formatSecondsColon(step.durationValue)
  return undefined
}

/**
 * Attach a recovery to the block it follows: as `rest` between reps of a plain
 * block, or — inside a repeat — as `seriesRest` after an already-repeated block
 * (the recovery between series in a series-of-sets shape).
 */
function attachRecovery(block: WorkoutBlock, recovery: string, insideRepeat: boolean): WorkoutBlock {
  if (block.sets === undefined && block.rest === undefined) return { ...block, rest: recovery }
  if (insideRepeat && block.sets !== undefined && block.series === undefined && block.seriesRest === undefined) {
    return { ...block, seriesRest: recovery }
  }
  return block
}

/**
 * Apply a repeat count to the blocks read from inside a REPEAT group. A single
 * block takes the count as `sets` (or `series`, if it is already a repeated set),
 * mirroring the shapes parsedDataToSteps produces. Several blocks can't be folded
 * into one WorkoutBlock, so each keeps its own entry with sets multiplied — the
 * order within a rep is lost, but distance volume (sets*series) stays correct.
 */
function applyRepeat(inner: WorkoutBlock[], count: number): WorkoutBlock[] {
  if (inner.length === 1) {
    const [only] = inner
    if (only.sets === undefined) return [{ ...only, sets: count }]
    if (only.series === undefined) return [{ ...only, series: count }]
  }
  return inner.map((block) => ({ ...block, sets: (block.sets ?? 1) * count }))
}

/** Read steps from `start` until the matching REPEAT_END (or the end), recursing into nested repeats. */
function readSequence(steps: WatchWorkoutStep[], start: number, depth: number): { blocks: WorkoutBlock[]; next: number } {
  let blocks: WorkoutBlock[] = []
  let i = start

  while (i < steps.length) {
    const step = steps[i]

    if (step.type === 'REPEAT_END') {
      if (depth > 0) return { blocks, next: i + 1 }
      i += 1
      continue
    }

    if (step.type === 'REPEAT_BEGIN') {
      const inner = readSequence(steps, i + 1, depth + 1)
      blocks = [...blocks, ...applyRepeat(inner.blocks, step.repeatCount ?? 4)]
      i = inner.next
      continue
    }

    if (step.type === 'ACTIVE' || step.type === 'WARMUP' || step.type === 'COOLDOWN') {
      blocks = [...blocks, stepDurationBlock(step)]
    } else if (step.type === 'RECOVERY' || step.type === 'REST') {
      const recovery = formatRecovery(step)
      const last = blocks[blocks.length - 1]
      if (recovery && last) blocks = [...blocks.slice(0, -1), attachRecovery(last, recovery, depth > 0)]
    }
    i += 1
  }

  return { blocks, next: i }
}

function stepsToPaceInfo(steps: WatchWorkoutStep[]): PaceInfo | undefined {
  const paced = steps.find((s) => s.targetUnit === 'PACE' && s.targetFrom)
  if (!paced?.targetFrom) return undefined
  const from = formatSecondsColon(paced.targetFrom)
  const to = paced.targetTo ? formatSecondsColon(paced.targetTo) : undefined
  return { general: to && to !== from ? `${from}-${to}` : from }
}

/**
 * Convert WatchWorkoutStep[] directly into ParsedWorkout, without an intermediate
 * text serialization/re-parse. Used when scheduling a watch workout (or applying a
 * template) onto the training calendar: the steps are the source of truth there, so
 * this reads them structurally instead of round-tripping through generated text and
 * a regex parser meant for human-authored input.
 */
export function stepsToParsedWorkout(steps: WatchWorkoutStep[]): ParsedWorkout | null {
  if (!steps.length) return null

  const { blocks } = readSequence(steps, 0, 0)
  const pace = stepsToPaceInfo(steps)
  if (blocks.length === 0 && !pace) return null
  return { blocks, pace }
}
