import type { ParsedWorkout } from './index.js'

/**
 * Parse a distance string like "1.5км", "400m", "5 km" into meters.
 * The lookahead stops "5 min" / "3 мін" reading as meters; \b can't be used
 * because it treats Cyrillic letters as non-word characters.
 */
export function parseDistanceMeters(str: string): number {
  const match = str.match(/(\d+(?:\.\d+)?)\s*(км|km|м|m)(?![a-zа-яіїєґ])/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  return /км|km/i.test(match[2]) ? value * 1000 : value
}

/** Sum a ParsedWorkout's blocks into total planned distance, in kilometers. */
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
