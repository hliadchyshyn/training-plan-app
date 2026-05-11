import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { ActionIcon } from '@mantine/core'
import { IconPlus, IconDeviceWatch } from '@tabler/icons-react'
import { api } from '../api/client.js'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'
import { estimateWorkoutDurationSec, formatEstimatedDuration, SPORT_LABELS } from '../utils/watchWorkout.js'

interface WatchWorkout {
  id: string
  name: string
  sport: WatchSport
  steps: WatchWorkoutStep[]
  notes?: string
  sourceType?: string
  createdAt: string
}

export default function WatchWorkoutsPage() {
  const navigate = useNavigate()

  const { data: workouts = [], isLoading } = useQuery<WatchWorkout[]>({
    queryKey: ['watch-workouts'],
    queryFn: () => api.get('/watch-workouts').then((r) => r.data),
  })

  if (isLoading) return <p className="page-loading">Завантаження...</p>

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Тренування для годинника</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Тут зберігаються тренування по кроках, які можна відправити в Intervals.icu або завантажити на Garmin.
          </p>
        </div>
        <button className="btn-primary hide-mobile" onClick={() => navigate('/watch-workouts/new')}>
          + Створити тренування
        </button>
      </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Що тут робити</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
            Створіть тренування для конкретного виконання. Якщо хочете використати схоже тренування ще раз, збережіть його як шаблон у <Link to="/templates">бібліотеці шаблонів</Link>.
          </p>
        </div>

      {workouts.length === 0 ? (
        <div className="page-empty">
          <IconDeviceWatch size={40} color="var(--color-text-muted)" />
          <p>Тренувань ще немає.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workouts.map((w) => (
            <div
              key={w.id}
              className="card"
              onClick={() => navigate(`/watch-workouts/${w.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: '1rem' }}>{w.name}</strong>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge">{SPORT_LABELS[w.sport]}</span>
                    <span className="badge">{w.steps.length} кроків</span>
                    {(() => {
                      const t = formatEstimatedDuration(estimateWorkoutDurationSec(w.steps, w.sport))
                      return t ? <span className="badge">{t}</span> : null
                    })()}
                    {w.sourceType && w.sourceType !== 'MANUAL' && (
                      <span className="badge badge-partial">З плану</span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(w.createdAt).toLocaleDateString('uk-UA')}
                </span>
              </div>
              {w.notes && (
                <p style={{ margin: '8px 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {w.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <ActionIcon
        className="fab"
        radius="xl"
        size={56}
        onClick={() => navigate('/watch-workouts/new')}
        aria-label="Створити тренування"
      >
        <IconPlus size={24} />
      </ActionIcon>
    </div>
  )
}
