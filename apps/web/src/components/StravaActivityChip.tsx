import type { StravaActivity } from '../types/common.js'

const TYPE_ICON: Record<string, string> = {
  Run: '🏃',
  Ride: '🚴',
  Swim: '🏊',
  Walk: '🚶',
  Hike: '🥾',
  WeightTraining: '🏋️',
  Workout: '💪',
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function StravaActivityChip({ activity }: { activity: StravaActivity }) {
  const icon = TYPE_ICON[activity.type] ?? '🏃'
  const km = activity.distance > 0 ? `${(activity.distance / 1000).toFixed(1)} км` : null
  const time = formatDuration(activity.movingTime)
  const hr = activity.averageHeartrate ? `♥ ${Math.round(activity.averageHeartrate)}` : null
  const matched = !!activity.sessionId

  return (
    <a
      href={`https://www.strava.com/activities/${activity.stravaId}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none' }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        background: '#fff4ef',
        border: `1px solid ${matched ? 'var(--color-strava)' : '#fdd0bb'}`,
        borderRadius: 9999,
        padding: '0.25rem 0.625rem',
        fontSize: '0.75rem',
        color: 'var(--color-strava)',
        cursor: 'pointer',
        marginTop: '0.25rem',
      }}>
        <span>{icon}</span>
        {km && <span style={{ fontWeight: 600 }}>{km}</span>}
        <span>{time}</span>
        {hr && <span>{hr}</span>}
        {matched && (
          <span style={{ fontSize: '0.6875rem', background: 'var(--color-strava)', color: 'white', padding: '0 0.375rem', borderRadius: 9999, fontWeight: 600 }}>
            ✓
          </span>
        )}
      </div>
    </a>
  )
}
