import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
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

  const [name, setName] = useState('')
  const [sport, setSport] = useState<WatchSport>('RUNNING')
  const [notes, setNotes] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([
    makeStep('WARMUP'),
    makeStep('ACTIVE'),
    makeStep('COOLDOWN'),
  ])
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: unknown) => api.post('/watch-workouts', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['watch-workouts'] })
      navigate(`/watch-workouts/${res.data.id}`)
    },
    onError: () => setError('Помилка збереження. Перевірте заповнені поля.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Введіть назву тренування')
    if (steps.length === 0) return setError('Додайте хоча б один крок')
    setError('')
    createMutation.mutate({ name: name.trim(), sport, steps: toWatchSteps(steps), notes: notes || undefined })
  }

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate('/watch-workouts')}>← Назад</button>
      <h2>Нове тренування для годинника</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group" style={{ flex: '2 1 200px' }}>
            <label>Назва</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Інтервальне тренування"
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
            {createMutation.isPending ? 'Збереження...' : 'Зберегти'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/watch-workouts')}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
