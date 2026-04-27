import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import type { WatchSport } from '@training-plan/shared'
import {
  WatchWorkoutStepList,
  SPORT_OPTIONS,
  STEP_TYPE_OPTIONS,
  makeStep,
  toWatchSteps,
  fromWatchSteps,
  type DraftStep,
} from '../components/WatchWorkoutForm.js'

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canPublish = user?.role === 'TRAINER' || user?.role === 'ADMIN'

  const { data: template, isLoading } = useQuery({
    queryKey: ['template', id],
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data),
  })

  const [name, setName] = useState('')
  const [sport, setSport] = useState<WatchSport>('RUNNING')
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [steps, setSteps] = useState<DraftStep[]>([])
  const [error, setError] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (template && !initialized) {
      setName(template.name)
      setSport(template.sport)
      setNotes(template.notes ?? '')
      setIsPublic(template.isPublic)
      setSteps(fromWatchSteps(template.steps))
      setInitialized(true)
    }
  }, [template, initialized])

  const updateMutation = useMutation({
    mutationFn: (data: unknown) => api.put(`/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template', id] })
      navigate(`/templates/${id}`)
    },
    onError: () => setError('Помилка збереження. Перевірте заповнені поля.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Введіть назву шаблону')
    if (steps.length === 0) return setError('Додайте хоча б один крок')
    setError('')
    updateMutation.mutate({
      name: name.trim(),
      sport,
      steps: toWatchSteps(steps),
      notes: notes || undefined,
      isPublic: canPublish ? isPublic : false,
    })
  }

  if (isLoading) return <p className="page-loading">Завантаження...</p>

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate(`/templates/${id}`)}>← Назад</button>
      <h2>Редагувати шаблон</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group" style={{ flex: '2 1 200px' }}>
            <label>Назва</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
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

        <div className="card" style={{ marginBottom: 16, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Видимість шаблону</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                Поточний статус: <strong>{isPublic ? 'Публічний' : 'Персональний'}</strong>
              </p>
            </div>
            {canPublish ? (
              <label htmlFor="isPublic" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
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
          <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Збереження...' : 'Зберегти зміни'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate(`/templates/${id}`)}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
