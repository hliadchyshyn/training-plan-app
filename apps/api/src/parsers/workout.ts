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
  const blocks: WorkoutBlock[] = []

  // Match patterns like "4*800м", "2*600м", "4x400m"
  const intervalPattern = /(\d+)[*x×](\d+(?:\.\d+)?)\s*(м|км|m|km)/gi
  let match: RegExpExecArray | null

  while ((match = intervalPattern.exec(text)) !== null) {
    const block: WorkoutBlock = {
      sets: parseInt(match[1]),
      distance: `${match[2]}${match[3]}`,
    }

    // Look for rest after this block position
    const afterBlock = text.slice(match.index + match[0].length, match.index + match[0].length + 80)
    const restMatch = afterBlock.match(/через\s+(\d+(?:[.,]\d+)?)\s*(хв|хвилин|сек|секунд|min|хв відпочинку)/i)
    if (restMatch) {
      block.rest = `${restMatch[1]} ${restMatch[2].replace(' відпочинку', '')}`
    }

    blocks.push(block)
  }

  // Match series count "4 серії" or "3-4 серії"
  const seriesMatch = text.match(/(\d+)(?:-\d+)?\s+серії?/i)
  if (seriesMatch && blocks.length > 0) {
    blocks[0].series = parseInt(seriesMatch[1])
  }

  // Match rest between series "між серіями X хв"
  const seriesRestMatch = text.match(/між серіями\s+(\d+(?:-\d+)?)\s*(хв|хвилин|min)/i)
  if (seriesRestMatch && blocks.length > 0) {
    blocks[0].seriesRest = `${seriesRestMatch[1]} ${seriesRestMatch[2]}`
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
