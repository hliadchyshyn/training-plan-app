import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import type { WatchSport } from '@training-plan/shared'
import {
  WatchWorkoutStepList,
  SPORT_OPTIONS,
  STEP_TYPE_OPTIONS,
  makeStep,
  toWatchSteps,
  type DraftStep,
} from '../components/WatchWorkoutForm.js'

export default function CreateWatchWorkoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const canPublishTemplate = user?.role === 'TRAINER' || user?.role === 'ADMIN'
  const saveAsTemplate = searchParams.get('saveAsTemplate') === '1'

  const [name, setName] = useState('')
  const [sport, setSport] = useState<WatchSport>('RUNNING')
  const [notes, setNotes] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([
    makeStep('WARMUP'),
    makeStep('ACTIVE'),
    makeStep('COOLDOWN'),
  ])
  const [isTemplatePublic, setIsTemplatePublic] = useState(false)
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: async () => {
      const workoutResponse = await api.post('/watch-workouts', {
        name: name.trim(),
        sport,
        steps: toWatchSteps(steps),
        notes: notes || undefined,
      })

      if (!saveAsTemplate) return { mode: 'watch' as const, workout: workoutResponse.data }

      const templateResponse = await api.post('/templates/from-watch-workout', {
        watchWorkoutId: workoutResponse.data.id,
        isPublic: canPublishTemplate ? isTemplatePublic : false,
      })

      return {
        mode: 'template' as const,
        workout: workoutResponse.data,
        template: templateResponse.data,
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['watch-workouts'] })

      if (result.mode === 'template') {
        queryClient.invalidateQueries({ queryKey: ['templates'] })
        navigate(`/templates/${result.template.id}`)
        return
      }

      navigate(`/watch-workouts/${result.workout.id}`)
    },
    onError: () => setError('Помилка збереження. Перевірте заповнені поля.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError(saveAsTemplate ? 'Введіть назву шаблону' : 'Введіть назву тренування')
    if (steps.length === 0) return setError('Додайте хоча б один крок')
    setError('')
    createMutation.mutate()
  }

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate(saveAsTemplate ? '/templates' : '/watch-workouts')}>← Назад</button>
      <h2>{saveAsTemplate ? 'Новий шаблон тренування' : 'Нове тренування для годинника'}</h2>

      {saveAsTemplate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Шаблон для повторного використання</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
            Опишіть тренування по кроках один раз. Після збереження його можна буде швидко додавати в нові плани або готувати для годинника.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group" style={{ flex: '2 1 200px' }}>
            <label>Назва</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={saveAsTemplate ? 'Інтервальне тренування 10x400м' : 'Інтервальне тренування'}
              required
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label>Вид спорту</label>
            <select value={sport} onChange={(e) => setSport(e.target.value as WatchSport)}>
              {SPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Нотатки (опціонально)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        {saveAsTemplate && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Видимість шаблону</h3>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                  Поточний статус: <strong>{isTemplatePublic ? 'Публічний' : 'Персональний'}</strong>
                </p>
              </div>
              {canPublishTemplate ? (
                <label htmlFor="isTemplatePublic" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    id="isTemplatePublic"
                    checked={isTemplatePublic}
                    onChange={(e) => setIsTemplatePublic(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <span style={{ fontSize: 14 }}>Показувати в загальній бібліотеці</span>
                </label>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Лише тренер або адмін може змінювати публічність.
                </p>
              )}
            </div>
          </div>
        )}

        <h3 style={{ marginBottom: 8 }}>Кроки</h3>
        <WatchWorkoutStepList steps={steps} onChange={setSteps} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 20px' }}>
          {STEP_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.8125rem', padding: '4px 10px' }}
              onClick={() => setSteps((s) => [...s, makeStep(o.value)])}
            >
              + {o.label}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Збереження...' : saveAsTemplate ? 'Зберегти як шаблон' : 'Зберегти'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate(saveAsTemplate ? '/templates' : '/watch-workouts')}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
