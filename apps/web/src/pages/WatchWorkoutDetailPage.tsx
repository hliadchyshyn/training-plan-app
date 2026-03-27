import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'

interface WatchWorkout {
  id: string
  name: string
  sport: WatchSport
  steps: WatchWorkoutStep[]
  notes?: string
  sourceType?: string
  icuEventId?: string | null
  createdAt: string
}

const SPORT_LABEL: Record<WatchSport, string> = {
  RUNNING: 'Біг',
  CYCLING: 'Велосипед',
  SWIMMING: 'Плавання',
}

const STEP_LABEL: Record<WatchWorkoutStep['type'], string> = {
  WARMUP: 'Розминка',
  ACTIVE: 'Активно',
  RECOVERY: 'Відновлення',
  COOLDOWN: 'Заминка',
  REST: 'Відпочинок',
  REPEAT_BEGIN: '↩ Повтор',
  REPEAT_END: '↩ Кінець повтору',
}

const STEP_COLOR: Partial<Record<WatchWorkoutStep['type'], string>> = {
  WARMUP: '#f59e0b',
  ACTIVE: 'var(--mantine-color-blue-6)',
  RECOVERY: '#10b981',
  COOLDOWN: '#6366f1',
  REST: '#9ca3af',
}

function formatDuration(unit: WatchWorkoutStep['durationUnit'], value?: number): string {
  if (!value) return 'відкрита'
  if (unit === 'TIME') {
    const m = Math.floor(value / 60)
    const s = value % 60
    return s > 0 ? `${m}:${String(s).padStart(2, '0')} хв` : `${m} хв`
  }
  if (unit === 'DISTANCE') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} км` : `${value} м`
  }
  return 'відкрита'
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface IntervalsStatus {
  connected: boolean
  athleteId: string | null
}

export default function WatchWorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pushDate, setPushDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pushSuccess, setPushSuccess] = useState(false)
  const [pushError, setPushError] = useState('')

  const { data: workout, isLoading } = useQuery<WatchWorkout>({
    queryKey: ['watch-workout', id],
    queryFn: () => api.get(`/watch-workouts/${id}`).then((r) => r.data),
  })

  const { data: intervalsStatus } = useQuery<IntervalsStatus>({
    queryKey: ['intervals-status'],
    queryFn: () => api.get('/intervals/status').then((r) => r.data),
  })

  const pushMutation = useMutation({
    mutationFn: () => api.post('/intervals/push', { workoutId: id, date: pushDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch-workout', id] })
      setPushSuccess(true)
      setPushError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setPushError(msg ?? 'Помилка відправки')
    },
  })

  const deleteIcuMutation = useMutation({
    mutationFn: (eventId: string) => api.delete(`/intervals/event/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch-workout', id] })
      setPushSuccess(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setPushError(msg ?? 'Помилка видалення')
    },
  })

  const copyMutation = useMutation({
    mutationFn: () => api.post('/watch-workouts', {
      name: `${workout!.name} (копія)`,
      sport: workout!.sport,
      steps: workout!.steps,
      notes: workout!.notes,
      sourceType: 'MANUAL',
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['watch-workouts'] })
      navigate(`/watch-workouts/${res.data.id}/edit`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/watch-workouts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch-workouts'] })
      navigate('/watch-workouts')
    },
  })

  const handleDownload = async () => {
    const response = await api.get(`/watch-workouts/${id}/export/fit`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([response.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${workout?.name ?? 'workout'}.fit`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <p className="page-loading">Завантаження...</p>
  if (!workout) return <p className="page-empty">Тренування не знайдено</p>

  let depth = 0

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate('/watch-workouts')}>← Назад</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{workout.name}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary"
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
          >
            {copyMutation.isPending ? '...' : 'Копіювати'}
          </button>
          <button className="btn-secondary" onClick={() => navigate(`/watch-workouts/${id}/edit`)}>
            Редагувати
          </button>
          <button
            className="btn-danger"
            onClick={() => { if (confirm('Видалити тренування?')) deleteMutation.mutate() }}
          >
            Видалити
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="badge">{SPORT_LABEL[workout.sport]}</span>
        {workout.sourceType && workout.sourceType !== 'MANUAL' && (
          <span className="badge badge-partial">Конвертовано з плану</span>
        )}
      </div>

      {workout.notes && (
        <p style={{ marginBottom: 16, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {workout.notes}
        </p>
      )}

      {/* Steps */}
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        {workout.steps.map((step, i) => {
          if (step.type === 'REPEAT_BEGIN') {
            const el = (
              <div
                key={i}
                style={{
                  padding: '8px 16px',
                  background: '#f0f9ff',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '0.875rem',
                  color: 'var(--color-text-muted)',
                  marginLeft: depth * 16,
                }}
              >
                ↩ Повтор × {step.repeatCount}
              </div>
            )
            depth++
            return el
          }
          if (step.type === 'REPEAT_END') {
            depth = Math.max(0, depth - 1)
            return null
          }

          return (
            <div
              key={i}
              style={{
                padding: '10px 16px',
                borderBottom: i < workout.steps.length - 1 ? '1px solid var(--color-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginLeft: depth * 16,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: STEP_COLOR[step.type] ?? '#9ca3af',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                  {step.name ?? STEP_LABEL[step.type]}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {formatDuration(step.durationUnit, step.durationValue)}
                  {step.targetUnit === 'PACE' && step.targetFrom && step.targetTo && (
                    <> · Темп: {formatPace(step.targetFrom)}–{formatPace(step.targetTo)} /км</>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Intervals.icu */}
      {intervalsStatus?.connected ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>Відправити на Intervals.icu</strong>
          <p style={{ margin: '4px 0 12px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Тренування потрапить у ваш календар і автоматично синхронізується з Garmin, Wahoo та ін.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={pushDate}
              onChange={(e) => { setPushDate(e.target.value); setPushSuccess(false) }}
              style={{ flex: '0 1 160px' }}
            />
            <button
              className="btn-primary"
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending}
            >
              {pushMutation.isPending ? 'Відправка...' : 'Відправити'}
            </button>
          </div>
          {pushSuccess && (
            <p style={{ margin: '8px 0 0', color: 'var(--color-success)', fontSize: '0.875rem' }}>
              ✓ Тренування додано в календар Intervals.icu
            </p>
          )}
          {pushError && <p className="error" style={{ margin: '8px 0 0' }}>{pushError}</p>}
          {workout.icuEventId && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  В ICU календарі: <code style={{ fontSize: '0.75rem' }}>#{workout.icuEventId}</code>
                </span>
                <button
                  className="btn-danger"
                  style={{ fontSize: '0.8125rem', padding: '3px 10px' }}
                  onClick={() => { if (confirm('Видалити подію з ICU календаря?')) deleteIcuMutation.mutate(workout.icuEventId!) }}
                  disabled={deleteIcuMutation.isPending}
                >
                  {deleteIcuMutation.isPending ? 'Видалення...' : 'Видалити з ICU'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, borderStyle: 'dashed' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            <a href="/intervals" style={{ color: 'var(--color-primary)' }}>Підключіть Intervals.icu</a>{' '}
            щоб синхронізувати тренування з Garmin, Wahoo та Coros
          </p>
        </div>
      )}

      {/* Download */}
      <div className="card card-success" style={{ marginBottom: 16 }}>
        <strong>Завантажити на Garmin</strong>
        <p style={{ margin: '4px 0 4px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Підключіть годинник до комп'ютера через USB і перемістіть файл до папки <code>/Garmin/NewFiles/</code>.
          Після від'єднання тренування з'явиться в меню годинника.
        </p>
        <p style={{ margin: '0 0 12px', fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Coros: імпорт структурованих тренувань через FIT файл не підтримується.
          Створіть тренування вручну в додатку Coros (Бібліотека тренувань).
        </p>
        <button className="btn-primary" onClick={handleDownload}>
          ⬇ Завантажити .fit файл
        </button>
      </div>
    </div>
  )
}
