import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ActionIcon } from '@mantine/core'
import { IconPlus, IconDeviceWatch } from '@tabler/icons-react'
import { api } from '../api/client.js'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'

interface WatchWorkout {
  id: string
  name: string
  sport: WatchSport
  steps: WatchWorkoutStep[]
  notes?: string
  sourceType?: string
  createdAt: string
}

// Default pace sec/km used when step has DISTANCE duration but no target pace
const DEFAULT_SEC_PER_KM: Record<WatchSport, number> = {
  RUNNING: 330,  // ~5:30/km
  CYCLING: 120,  // ~30 km/h
  SWIMMING: 600, // ~10:00/100m expressed as sec/km
}

function estimateDurationSec(steps: WatchWorkoutStep[], sport: WatchSport): number {
  let total = 0
  const stack: { count: number; sub: number }[] = []

  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') {
      stack.push({ count: step.repeatCount ?? 4, sub: 0 })
      continue
    }
    if (step.type === 'REPEAT_END') {
      const frame = stack.pop()
      if (frame) {
        const contribution = frame.sub * frame.count
        if (stack.length > 0) stack[stack.length - 1].sub += contribution
        else total += contribution
      }
      continue
    }

    let dur = 0
    if (step.durationUnit === 'TIME' && step.durationValue) {
      dur = step.durationValue
    } else if (step.durationUnit === 'DISTANCE' && step.durationValue) {
      const pace = step.targetFrom && step.targetTo
        ? (step.targetFrom + step.targetTo) / 2
        : (step.targetFrom ?? DEFAULT_SEC_PER_KM[sport])
      dur = (step.durationValue / 1000) * pace
    }

    if (stack.length > 0) stack[stack.length - 1].sub += dur
    else total += dur
  }

  return Math.round(total)
}

function formatDuration(sec: number): string {
  if (sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `~${h}г ${m > 0 ? `${m}хв` : ''}`
  if (m > 0) return `~${m} хв`
  return `<1 хв`
}

const SPORT_LABEL: Record<WatchSport, string> = {
  RUNNING: 'Біг',
  CYCLING: 'Велосипед',
  SWIMMING: 'Плавання',
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
        <h2 style={{ margin: 0 }}>Тренування</h2>
        <button className="btn-primary hide-mobile" onClick={() => navigate('/watch-workouts/new')}>
          + Створити
        </button>
      </div>

      {workouts.length === 0 ? (
        <div className="page-empty">
          <IconDeviceWatch size={40} color="var(--color-text-muted)" />
          <p>Тренувань ще немає.</p>
          <button className="btn-primary" onClick={() => navigate('/watch-workouts/new')}>
            Створити перше
          </button>
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
                    <span className="badge">{SPORT_LABEL[w.sport]}</span>
                    <span className="badge">{w.steps.length} кроків</span>
                    {(() => { const t = formatDuration(estimateDurationSec(w.steps, w.sport)); return t ? <span className="badge">{t}</span> : null })()}
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
