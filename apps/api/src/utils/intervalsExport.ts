import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'

/** Convert seconds/km pace to "M:SS" string */
function secToMinKm(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Convert distance in meters to Intervals.icu duration string.
 *  IMPORTANT: never use bare `Xm` — ICU parser reads "m" as "minutes", not meters.
 *  Always express as km (e.g. 0.2km for 200m).
 */
function metersToIntervals(m: number): string {
  return `${(m / 1000).toFixed(3).replace(/\.?0+$/, '')}km`
}

/** Convert time in seconds to Intervals.icu duration string */
function secondsToIntervals(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (rem === 0) return `${m}min`
  return `${m}min${rem}s`
}

const STEP_ZONE: Record<string, string> = {
  WARMUP: 'Z1',
  ACTIVE: '',
  RECOVERY: 'Z1',
  COOLDOWN: 'Z1',
  REST: 'Z1',
}

const STEP_LABEL_EN: Record<string, string> = {
  WARMUP: 'Warmup',
  ACTIVE: 'Active',
  RECOVERY: 'Recovery',
  COOLDOWN: 'Cooldown',
  REST: 'Rest',
}

// ─── Tree builder ────────────────────────────────────────────────────────────
type StepNode = { kind: 'step'; step: WatchWorkoutStep }
type RepeatNode = { kind: 'repeat'; count: number; children: TreeNode[] }
type TreeNode = StepNode | RepeatNode

function buildTree(steps: WatchWorkoutStep[]): TreeNode[] {
  const root: TreeNode[] = []
  const stack: { count: number; children: TreeNode[] }[] = []

  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') {
      stack.push({ count: step.repeatCount ?? 4, children: [] })
    } else if (step.type === 'REPEAT_END') {
      const frame = stack.pop()
      if (frame) {
        const node: RepeatNode = { kind: 'repeat', count: frame.count, children: frame.children }
        if (stack.length > 0) stack[stack.length - 1].children.push(node)
        else root.push(node)
      }
    } else {
      const node: StepNode = { kind: 'step', step }
      if (stack.length > 0) stack[stack.length - 1].children.push(node)
      else root.push(node)
    }
  }

  return root
}

function renderStep(step: WatchWorkoutStep): string {
  let duration = ''
  if (step.durationUnit === 'DISTANCE' && step.durationValue) {
    duration = metersToIntervals(step.durationValue)
  } else if (step.durationUnit === 'TIME' && step.durationValue) {
    duration = secondsToIntervals(step.durationValue)
  } else {
    duration = '1min'
  }

  // ICU absolute pace syntax: "3:00-3:15/km Pace" — replaces zone for steps with pace target.
  // FIT speed targets always render as % of threshold in ICU, so description is the only way
  // to display absolute min/km values.
  let intensity = ''
  if (step.targetUnit === 'PACE' && step.targetFrom && step.targetTo) {
    intensity = ` ${secToMinKm(step.targetFrom)}-${secToMinKm(step.targetTo)}/km Pace`
  } else if (step.targetUnit === 'PACE' && step.targetFrom) {
    intensity = ` ${secToMinKm(step.targetFrom)}/km Pace`
  } else {
    const zone = STEP_ZONE[step.type]
    if (zone) intensity = ` ${zone}`
  }

  const label = STEP_LABEL_EN[step.type] ?? step.type

  return `${duration}${intensity} ${label}`.trimEnd()
}

/**
 * Render tree nodes to Intervals.icu description lines.
 *
 * ICU uses 2-space indentation to define what belongs inside a repeat block:
 *   3x
 *     5x
 *       - 0.2km pace:3:00-3:15 Active
 *       - 1min Z1 Recovery
 *     - 5min Z1 Series rest
 *   - 10min Z1 Cooldown
 *
 * Indented lines after Nx = inside the repeat.
 * Non-indented lines = outside.
 */
function renderNodes(nodes: TreeNode[], depth: number): string[] {
  const indent = '  '.repeat(depth)
  const lines: string[] = []
  for (const node of nodes) {
    if (node.kind === 'step') {
      lines.push(indent + renderStep(node.step))
    } else {
      lines.push(indent + `${node.count}x`)
      lines.push(...renderNodes(node.children, depth + 1))
    }
  }
  return lines
}

/**
 * Converts WatchWorkoutStep[] to Intervals.icu workout description.
 * Uses indentation-based nesting so ICU correctly parses repeat blocks
 * and syncs proper interval structure to Garmin/Wahoo/Coros.
 */
export function stepsToIntervalsMarkdown(steps: WatchWorkoutStep[]): string {
  return renderNodes(buildTree(steps), 0).join('\n')
}

/**
 * Push a workout to Intervals.icu as a calendar event via FIT file upload.
 * FIT file is used for structured workout sync to Garmin/Coros/Wahoo via ICU integrations.
 * Pace is embedded in FIT step names (ICU always shows step names regardless of threshold).
 * Returns the created event id.
 */
export async function pushToIntervals(opts: {
  apiKey: string
  athleteId: string
  name: string
  sport: WatchSport
  fitBuffer: Buffer
  date: string // YYYY-MM-DD
}): Promise<{ id: string | number }> {
  const { apiKey, athleteId, name, sport, fitBuffer, date } = opts

  const sportMap: Record<WatchSport, string> = {
    RUNNING: 'Run',
    CYCLING: 'Ride',
    SWIMMING: 'Swim',
  }

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')

  const body = {
    start_date_local: `${date}T00:00:00`,
    name,
    type: sportMap[sport],
    category: 'WORKOUT',
    filename: `${safeName}.fit`,
    file_contents_base64: fitBuffer.toString('base64'),
  }

  const credentials = Buffer.from(`API_KEY:${apiKey}`).toString('base64')
  const res = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Intervals.icu API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<{ id: string | number }>
}

/**
 * Delete an event from the Intervals.icu calendar.
 */
export async function deleteIntervalsEvent(opts: {
  apiKey: string
  athleteId: string
  eventId: string
}): Promise<void> {
  const { apiKey, athleteId, eventId } = opts
  const credentials = Buffer.from(`API_KEY:${apiKey}`).toString('base64')
  const res = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Intervals.icu API error ${res.status}: ${text}`)
  }
}

/**
 * Verify Intervals.icu credentials by fetching athlete profile.
 */
export async function verifyIntervalsConnection(apiKey: string, athleteId: string): Promise<string> {
  const credentials = Buffer.from(`API_KEY:${apiKey}`).toString('base64')
  const res = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}`, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error(`Intervals.icu error ${res.status}`)
  const data = await res.json() as { name?: string }
  return data.name ?? athleteId
}
