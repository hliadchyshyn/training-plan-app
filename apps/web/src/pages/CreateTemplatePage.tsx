import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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

export default function CreateTemplatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canPublish = user?.role === 'TRAINER' || user?.role === 'ADMIN'

  const [name, setName] = useState('')
  const [sport, setSport] = useState<WatchSport>('RUNNING')
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [steps, setSteps] = useState<DraftStep[]>([
    makeStep('WARMUP'),
    makeStep('ACTIVE'),
    makeStep('COOLDOWN'),
  ])
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: unknown) => api.post('/templates', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate(`/templates/${res.data.id}`)
    },
    onError: () => setError('Помилка збереження. Перевірте заповнені поля.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Введіть назву шаблону')
    if (steps.length === 0) return setError('Додайте хоча б один крок')
    setError('')
    createMutation.mutate({
      name: name.trim(),
      sport,
      steps: toWatchSteps(steps),
      notes: notes || undefined,
      isPublic: canPublish ? isPublic : false,
    })
  }

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate('/templates')}>← Назад</button>
      <h2>Новий шаблон тренування</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group" style={{ flex: '2 1 200px' }}>
            <label>Назва</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Інтервальне тренування 10x400м"
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

        {canPublish && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <label htmlFor="isPublic" style={{ margin: 0, cursor: 'pointer', fontSize: 14 }}>
              Опублікувати в загальній бібліотеці
            </label>
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
            {createMutation.isPending ? 'Збереження...' : 'Зберегти шаблон'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/templates')}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
