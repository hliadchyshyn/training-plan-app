import { useRaces } from '../api/races.js'
import { formatDate } from '../utils/date.js'
import { addDays } from '../utils/races.js'
import { RaceBadge } from './RaceBadge.js'

/**
 * Starts of one athlete in a plan week (± a week after, for tapering) —
 * shown while the trainer writes an individual plan.
 */
export function AthleteWeekRaces({ athleteId, weekStart }: { athleteId: string; weekStart: string }) {
  const weekEnd = addDays(weekStart, 13)
  const { data = [] } = useRaces({ from: weekStart, to: weekEnd, athleteId }, Boolean(athleteId && weekStart))

  if (data.length === 0) return null

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
        Старти цього й наступного тижня
      </div>
      {data.map((entry) => (
        <div key={entry.key}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.125rem' }}>{formatDate(entry.eventDate)}</div>
          <RaceBadge entry={entry} />
        </div>
      ))}
    </div>
  )
}
