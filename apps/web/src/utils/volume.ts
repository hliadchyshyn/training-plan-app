interface WorkoutBlock {
  sets?: number
  distance?: string
  series?: number
}

interface ParsedWorkout {
  blocks?: WorkoutBlock[]
}

export function parseDistanceMeters(str: string): number {
  const m = str?.match(/(\d+(?:\.\d+)?)\s*(км|km|м|m)/i)
  if (!m) return 0
  const val = parseFloat(m[1])
  return /км|km/i.test(m[2]) ? val * 1000 : val
}

export function calcVolumeKm(parsedData: unknown): number {
  const parsed = parsedData as ParsedWorkout | null
  if (!parsed?.blocks?.length) return 0
  let total = 0
  for (const block of parsed.blocks) {
    const meters = parseDistanceMeters(block.distance ?? '')
    if (meters > 0) {
      total += (block.sets ?? 1) * (block.series ?? 1) * meters / 1000
    }
  }
  return Math.round(total * 10) / 10
}
