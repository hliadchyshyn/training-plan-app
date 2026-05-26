import type { ParsedWorkout, WorkoutBlock, PaceInfo } from '@training-plan/shared'

/**
 * Parse workout text into structured data.
 * Returns null if no recognizable patterns found.
 *
 * Handles Ukrainian athletics notation like:
 * "4*800м через 3 хв відпочинку. 2 серії між серіями 5 хв. Пейс 1.20-1.25 хлопці 1.30-1.35 дівчата"
 */
export function parseWorkout(text: string): ParsedWorkout | null {
  const blocks = parseBlocks(text)
  const pace = parsePace(text)
  const notes = extractNotes(text)

  if (blocks.length === 0 && !pace) return null

  return { blocks, pace, notes }
}

function parseBlocks(text: string): WorkoutBlock[] {
  // Collect all positional matches so blocks are sorted by appearance in text,
  // not by which regex ran first. Without this, interval blocks (e.g. "3*120м")
  // were always placed before plain-km blocks (e.g. "4км" warmup) even when the
  // warmup appeared earlier in the text — causing wrong repeat structure in FIT.
  const positional: Array<{ start: number; block: WorkoutBlock }> = []
  const matchedRanges: Array<[number, number]> = []

  // Match patterns like "4*800м", "2*600м", "4x400m", "4–6 × 100m"
  // Supports optional range in sets (e.g. "4–6"), spaces around multiplier
  const intervalPattern = /(\d+(?:[–\-]\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(м|км|m|km)/gi
  let match: RegExpExecArray | null

  while ((match = intervalPattern.exec(text)) !== null) {
    matchedRanges.push([match.index, match.index + match[0].length])
    const block: WorkoutBlock = {
      sets: parseInt(match[1]), // parseInt("4–6") = 4 (lower bound)
      distance: `${match[2]}${match[3]}`,
    }

    // Look for rest after this block position
    const afterBlock = text.slice(match.index + match[0].length, match.index + match[0].length + 80)
    const restMatch = afterBlock.match(/через\s+(\d+(?:[.,]\d+)?)\s*(хв|хвилин|сек|секунд|min|хв відпочинку)/i)
    if (restMatch) {
      block.rest = `${restMatch[1]} ${restMatch[2].replace(' відпочинку', '')}`
    }

    positional.push({ start: match.index, block })
  }

  // Match plain km distance blocks not already captured by interval pattern
  // e.g. "5–8 km легко", "10km easy"
  const plainKmPattern = /([\d.]+(?:[–\-][\d.]+)?)\s*(км|km)/gi
  while ((match = plainKmPattern.exec(text)) !== null) {
    const alreadyMatched = matchedRanges.some(([s, e]) => match!.index >= s && match!.index < e)
    if (!alreadyMatched) {
      positional.push({ start: match.index, block: { distance: `${parseFloat(match[1])}km` } })
    }
  }

  // Sort by position in text to preserve the order blocks appear
  positional.sort((a, b) => a.start - b.start)
  const blocks = positional.map((p) => p.block)

  // Match series count "4 серії" or "3-4 серії" — attach to first interval block
  const firstIntervalIdx = blocks.findIndex((b) => b.sets !== undefined)
  const seriesMatch = text.match(/(\d+)(?:-\d+)?\s+серії?/i)
  if (seriesMatch && firstIntervalIdx !== -1) {
    blocks[firstIntervalIdx].series = parseInt(seriesMatch[1])
  }

  // Match rest between series "між серіями X хв"
  const seriesRestMatch = text.match(/між серіями\s+(\d+(?:-\d+)?)\s*(хв|хвилин|min)/i)
  if (seriesRestMatch && firstIntervalIdx !== -1) {
    blocks[firstIntervalIdx].seriesRest = `${seriesRestMatch[1]} ${seriesRestMatch[2]}`
  }

  // Match intensity "85%", "70%", "60%"
  const intensityMatch = text.match(/(\d+(?:-\d+)?)\s*%/)
  if (intensityMatch && blocks.length > 0) {
    blocks[blocks.length - 1].intensity = `${intensityMatch[1]}%`
  }

  // Match duration runs without sets*distance pattern (e.g. "25 хв бігу", "10 хв розминочний біг")
  if (blocks.length === 0) {
    const durationPattern = /(\d+)\s*хв\s+(?:бігу|біг|розминочний)/i
    const durMatch = text.match(durationPattern)
    if (durMatch) {
      blocks.push({ duration: `${durMatch[1]} хв` })
    }
  }

  return blocks
}

function parsePace(text: string): PaceInfo | undefined {
  const pace: PaceInfo = {}

  // Men pace: "1.20-1.25 хлопці" or "пейс хлопці 3.45-3.50"
  const menPattern = /(\d+[.:]\d+[-–]\d+[.:]\d+)\s*(?:хлопці|чоловіки|men)|(?:хлопці|чоловіки|men)[:\s]+(\d+[.:]\d+[-–]\d+[.:]\d+)/i
  const menMatch = text.match(menPattern)
  if (menMatch) {
    pace.men = normalizePace(menMatch[1] ?? menMatch[2])
  }

  // Women pace: "1.30-1.35 дівчата" or "пейс дівчата 4.10"
  const womenPattern = /(\d+[.:]\d+[-–]\d+[.:]\d+)\s*(?:дівчата|жінки|women)|(?:дівчата|жінки|women)[:\s]+(\d+[.:]\d+[-–]\d+[.:]\d+)/i
  const womenMatch = text.match(womenPattern)
  if (womenMatch) {
    pace.women = normalizePace(womenMatch[1] ?? womenMatch[2])
  }

  // General pace: "пейс 3.45-3.50" or "пейс по 1.20"
  const generalPattern = /пейс(?:\s+по)?\s+(\d+[.:]\d+(?:[-–]\d+[.:]\d+)?)/i
  const generalMatch = text.match(generalPattern)
  if (generalMatch && !menMatch && !womenMatch) {
    pace.general = normalizePace(generalMatch[1])
  }

  if (!pace.men && !pace.women && !pace.general) return undefined
  return pace
}

// Normalize "1.20" → "1:20", keep "1:20-1:25" as is
function normalizePace(pace: string): string {
  return pace.replace(/\./g, ':')
}

function extractNotes(text: string): string | undefined {
  // Sentences that don't contain workout patterns (heuristic)
  const hasWorkoutPattern = /\d+[*x×]\d+|через\s+\d+\s+хв|пейс|серії/i.test(text)
  if (!hasWorkoutPattern) return text.trim()
  return undefined
}
