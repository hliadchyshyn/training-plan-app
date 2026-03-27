import { Encoder } from '@garmin/fitsdk'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'

// FIT message numbers
const MESG_NUM_FILE_ID = 0
const MESG_NUM_WORKOUT = 26
const MESG_NUM_WORKOUT_STEP = 27

// FIT enum values
const FILE_TYPE_WORKOUT = 5

const SPORT: Record<WatchSport, number> = {
  RUNNING: 1,
  CYCLING: 2,
  SWIMMING: 5,
}

// wktStepDuration enum
const DURATION_TIME = 0
const DURATION_DISTANCE = 1
const DURATION_OPEN = 5
const DURATION_REPEAT_REPS = 6

// wktStepTarget enum
const TARGET_SPEED = 0
const TARGET_OPEN = 2

// intensity enum
const INTENSITY_ACTIVE = 0
const INTENSITY_REST = 1
const INTENSITY_WARMUP = 2
const INTENSITY_COOLDOWN = 3
const INTENSITY_RECOVERY = 4

function intensityForType(type: WatchWorkoutStep['type']): number {
  switch (type) {
    case 'WARMUP': return INTENSITY_WARMUP
    case 'COOLDOWN': return INTENSITY_COOLDOWN
    case 'RECOVERY':
    case 'REST': return INTENSITY_RECOVERY
    default: return INTENSITY_ACTIVE
  }
}

/**
 * pace (seconds/km) → speed in FIT units (m/s * 1000 = mm/s)
 * Slower pace = lower speed. "from" is faster (lower sec/km), "to" is slower.
 */
function paceToSpeedFit(secPerKm: number): number {
  if (secPerKm <= 0) return 0
  return Math.round((1000 / secPerKm) * 1000)
}

/** Format seconds/km as "M:SS" for embedding in step name */
function formatPaceLabel(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface FitStep extends Record<string, unknown> {
  mesgNum: number
  messageIndex: number
  wktStepName?: string
  durationType: number
  durationValue: number
  targetType: number
  targetValue: number
  customTargetValueLow: number
  customTargetValueHigh: number
  intensity: number
}

/**
 * Converts WatchWorkoutStep[] (with REPEAT_BEGIN/REPEAT_END markers) into
 * a flat list of FIT workout step messages.
 *
 * FIT repeat mechanism: a REPEAT step is placed at the END of the group,
 * with durationValue = index of the first step in the repeat block,
 * and targetValue = number of repetitions.
 */
function flattenToFitSteps(steps: WatchWorkoutStep[]): FitStep[] {
  const fitSteps: FitStep[] = []
  // Stack: [{ startIndex, repeatCount }]
  const repeatStack: Array<{ startIndex: number; repeatCount: number }> = []

  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') {
      // Mark where this repeat block starts (next step index)
      repeatStack.push({ startIndex: fitSteps.length, repeatCount: step.repeatCount ?? 1 })
      continue
    }

    if (step.type === 'REPEAT_END') {
      const frame = repeatStack.pop()
      if (!frame) continue
      // Create the FIT REPEAT step at the end of the block
      const idx = fitSteps.length
      fitSteps.push({
        mesgNum: MESG_NUM_WORKOUT_STEP,
        messageIndex: idx,
        durationType: DURATION_REPEAT_REPS,
        durationValue: frame.startIndex, // loop back to this step index
        targetType: TARGET_OPEN,
        targetValue: frame.repeatCount,  // stored as repeatSteps subfield
        customTargetValueLow: 0,
        customTargetValueHigh: 0,
        intensity: INTENSITY_ACTIVE,
      })
      continue
    }

    // Regular step
    let durationType = DURATION_OPEN
    let durationValue = 0

    if (step.durationUnit === 'TIME' && step.durationValue) {
      durationType = DURATION_TIME
      durationValue = Math.round(step.durationValue * 1000) // seconds * 1000
    } else if (step.durationUnit === 'DISTANCE' && step.durationValue) {
      durationType = DURATION_DISTANCE
      durationValue = Math.round(step.durationValue * 100) // meters * 100
    }

    let targetType = TARGET_OPEN
    let customLow = 0
    let customHigh = 0

    let paceLabel = ''
    if (step.targetUnit === 'PACE' && step.targetFrom && step.targetTo) {
      targetType = TARGET_SPEED
      // targetFrom = faster pace (lower sec/km) → higher speed
      // targetTo = slower pace (higher sec/km) → lower speed
      customLow = paceToSpeedFit(step.targetTo)   // slower pace = lower speed bound
      customHigh = paceToSpeedFit(step.targetFrom) // faster pace = upper speed bound
      paceLabel = ` ${formatPaceLabel(step.targetFrom)}-${formatPaceLabel(step.targetTo)}/km`
    } else if (step.targetUnit === 'PACE' && step.targetFrom) {
      targetType = TARGET_SPEED
      customLow = paceToSpeedFit(step.targetFrom)
      customHigh = paceToSpeedFit(step.targetFrom)
      paceLabel = ` ${formatPaceLabel(step.targetFrom)}/km`
    }

    // Embed pace in step name so ICU always shows it (ICU displays FIT speed targets
    // as % of threshold when no threshold is configured, but always shows step name).
    const stepName = step.name
      ? `${step.name}${paceLabel}`
      : paceLabel.trim() || undefined

    const idx = fitSteps.length
    fitSteps.push({
      mesgNum: MESG_NUM_WORKOUT_STEP,
      messageIndex: idx,
      wktStepName: stepName,
      durationType,
      durationValue,
      targetType,
      targetValue: 0,
      customTargetValueLow: customLow,
      customTargetValueHigh: customHigh,
      intensity: intensityForType(step.type),
    })
  }

  return fitSteps
}

/**
 * Encode a WatchWorkout into a binary FIT file buffer.
 */
export function stepsToFit(name: string, sport: WatchSport, steps: WatchWorkoutStep[]): Buffer {
  const encoder = new Encoder()

  // File ID message
  encoder.writeMesg({
    mesgNum: MESG_NUM_FILE_ID,
    type: FILE_TYPE_WORKOUT,
    manufacturer: 255, // development
    product: 0,
    timeCreated: Math.floor(Date.now() / 1000) - 631065600, // FIT epoch offset from Unix
  })

  const fitSteps = flattenToFitSteps(steps)

  // Workout message
  encoder.writeMesg({
    mesgNum: MESG_NUM_WORKOUT,
    sport: SPORT[sport] ?? SPORT.RUNNING,
    capabilities: 0,
    numValidSteps: fitSteps.length,
    wktName: name.slice(0, 16), // Garmin limits workout name length
  })

  // Workout step messages
  for (const step of fitSteps) {
    encoder.writeMesg(step)
  }

  const uint8 = encoder.close()
  return Buffer.from(uint8)
}
