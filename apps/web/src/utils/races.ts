import type { RaceEntry } from '../api/races.js'

export type DiffTone = 'better' | 'close' | 'worse' | 'dnf' | 'none'

/** Up to this many % slower than the goal still counts as "close". */
const CLOSE_PCT = 3

export function formatDuration(totalSeconds: number): string {
  const s = Math.abs(Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** "−0:35" faster than planned, "+1:10" slower. */
export function formatDiff(diffSeconds: number | null): string {
  if (diffSeconds === null) return ''
  if (diffSeconds === 0) return formatDuration(0)
  return `${diffSeconds < 0 ? '−' : '+'}${formatDuration(diffSeconds)}`
}

export function diffTone(entry: RaceEntry): DiffTone {
  if (!entry.result) return 'none'
  if (entry.result.status.toLowerCase() !== 'finished') return 'dnf'
  if (entry.diffPct === null) return 'none'
  if (entry.diffPct <= 0) return 'better'
  return entry.diffPct <= CLOSE_PCT ? 'close' : 'worse'
}

export const DIFF_TONE_COLORS: Record<DiffTone, { color: string; background: string }> = {
  better: { color: '#15803d', background: '#dcfce7' },
  close: { color: '#a16207', background: '#fef9c3' },
  worse: { color: '#b91c1c', background: '#fee2e2' },
  dnf: { color: '#4b5563', background: '#e5e7eb' },
  none: { color: 'var(--color-text-muted)', background: 'transparent' },
}

// Date strings are "YYYY-MM-DD"; do arithmetic in UTC so DST never shifts a day.
function toUtcMs(isoDay: string): number {
  const [y, m, d] = isoDay.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(isoDay: string, days: number): string {
  return new Date(toUtcMs(isoDay) + days * 86_400_000).toISOString().slice(0, 10)
}

export function daysUntil(isoDay: string, todayIsoDay: string): number {
  return Math.round((toUtcMs(isoDay) - toUtcMs(todayIsoDay)) / 86_400_000)
}

export function daysUntilLabel(days: number): string {
  if (days === 0) return 'сьогодні'
  if (days === 1) return 'завтра'
  return `через ${days} дн.`
}

/**
 * Upcoming = not yet raced (today's start counts until a result arrives), soonest first.
 * Past = date passed or result in, most recent first.
 */
export function splitRaces(entries: RaceEntry[], todayIsoDay: string): { upcoming: RaceEntry[]; past: RaceEntry[] } {
  const isPast = (e: RaceEntry) => e.eventDate < todayIsoDay || e.result !== null
  return {
    upcoming: entries.filter((e) => !isPast(e)).sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    past: entries.filter(isPast).sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
  }
}
