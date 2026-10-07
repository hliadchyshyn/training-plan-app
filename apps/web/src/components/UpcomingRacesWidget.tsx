import { Link } from 'react-router-dom'
import { useRaces } from '../api/races.js'
import { formatDate, toLocalDateStr } from '../utils/date.js'
import { addDays, daysUntil, daysUntilLabel, splitRaces } from '../utils/races.js'

const WINDOW_DAYS = 14
const MAX_ROWS = 6

/** Trainer dashboard: team starts in the next two weeks. Hidden when there are none. */
export function UpcomingRacesWidget() {
  const today = toLocalDateStr(new Date())
  const { data = [], isLoading } = useRaces({ from: today, to: addDays(today, WINDOW_DAYS) })
  const { upcoming } = splitRaces(data, today)

  if (isLoading || upcoming.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16, padding: '0.75rem 1rem', background: '#fff7ed', border: '1px solid #fed7aa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: 15 }}>🏁 Старти команди — найближчі {WINDOW_DAYS} днів</strong>
        <Link to="/races" style={{ fontSize: '0.8125rem' }}>Всі старти →</Link>
      </div>
      {upcoming.slice(0, MAX_ROWS).map((e) => {
        const days = daysUntil(e.eventDate, today)
        return (
          <div key={e.key} style={{ display: 'flex', gap: '0.625rem', fontSize: '0.875rem', padding: '0.25rem 0', alignItems: 'baseline' }}>
            <span style={{ width: 64, flexShrink: 0, color: days <= 7 ? '#c2410c' : 'var(--color-text-muted)', fontWeight: days <= 7 ? 600 : 400 }}>
              {days <= 1 ? daysUntilLabel(days) : formatDate(e.eventDate)}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{e.athlete?.name ?? e.email}</strong> · {e.eventTitle} · {e.distance}
            </span>
            {e.goalTimeRaw && <span style={{ flexShrink: 0, color: 'var(--color-text-muted)' }}>ціль {e.goalTimeRaw}</span>}
          </div>
        )
      })}
      {upcoming.length > MAX_ROWS && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
          і ще {upcoming.length - MAX_ROWS}…
        </div>
      )}
    </div>
  )
}
