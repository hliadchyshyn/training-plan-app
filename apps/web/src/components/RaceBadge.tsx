import type { RaceEntry } from '../api/races.js'
import { DIFF_TONE_COLORS, diffTone, formatDiff } from '../utils/races.js'

const PILL_STYLE = {
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.0625rem 0.5rem',
  borderRadius: 9999,
  whiteSpace: 'nowrap',
} as const

/** Result + difference to goal, coloured by how it went. */
export function RaceResultPill({ entry }: { entry: RaceEntry }) {
  if (!entry.result) return null
  const tone = diffTone(entry)
  const { color, background } = DIFF_TONE_COLORS[tone]
  const status = entry.result.status.toUpperCase()

  if (tone === 'dnf') return <span style={{ ...PILL_STYLE, color, background }}>{status}</span>

  return (
    <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{entry.result.timeRaw}</span>
      {entry.diffSeconds !== null && (
        <span style={{ ...PILL_STYLE, color, background }} title={`${entry.diffPct}% від цілі`}>
          {formatDiff(entry.diffSeconds)}
        </span>
      )}
      {entry.result.isPersonalBest && <span style={{ ...PILL_STYLE, color: '#7c3aed', background: '#ede9fe' }}>PB</span>}
      {!entry.result.isPersonalBest && entry.result.isSeasonBest && (
        <span style={{ ...PILL_STYLE, color: '#0369a1', background: '#e0f2fe' }}>SB</span>
      )}
    </span>
  )
}

/** Compact 🏁 card for calendars and plan editors. */
export function RaceBadge({ entry, showAthlete = false }: { entry: RaceEntry; showAthlete?: boolean }) {
  return (
    <div style={{
      background: '#fff7ed',
      border: '1px solid #fed7aa',
      borderRadius: 'var(--radius)',
      padding: '0.5rem 0.75rem',
      marginBottom: '0.5rem',
    }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.6875rem', color: '#c2410c', fontWeight: 700 }}>🏁 СТАРТ</span>
        {showAthlete && <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{entry.athlete?.name ?? entry.email}</span>}
        <span style={{ fontWeight: showAthlete ? 400 : 600, fontSize: '0.875rem' }}>{entry.eventTitle}</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{entry.distance}</span>
      </div>
      {(entry.goalTimeRaw || entry.result) && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.25rem', fontSize: '0.8125rem' }}>
          {entry.goalTimeRaw && <span style={{ color: 'var(--color-text-muted)' }}>ціль <strong style={{ color: 'var(--color-text)' }}>{entry.goalTimeRaw}</strong></span>}
          <RaceResultPill entry={entry} />
        </div>
      )}
    </div>
  )
}
