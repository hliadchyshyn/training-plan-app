import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../api/client.js'
import { useAuthStore } from '../../store/auth.js'

interface ExerciseGroupDraft {
  name: string
  rawText: string
  preview: unknown
}

export function CreateGroupPlanPage() {
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [groups, setGroups] = useState<ExerciseGroupDraft[]>([{ name: '', rawText: '', preview: null }])
  const [error, setError] = useState('')

  const parsePreview = useMutation({
    mutationFn: (text: string) => api.post('/plans/parse-workout', { text }).then((r) => r.data),
  })

  const createPlan = useMutation({
    mutationFn: (data: unknown) => api.post('/plans/group', data),
    onSuccess: () => navigate('/trainer'),
    onError: () => setError('Помилка збереження плану'),
  })

  const handleGroupChange = (idx: number, field: 'name' | 'rawText', value: string) => {
    setGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, [field]: value } : g)))
  }

  const handlePreview = async (idx: number) => {
    const text = groups[idx].rawText
    if (!text) return
    const result = await parsePreview.mutateAsync(text)
    setGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, preview: result.parsed } : g)))
  }

  const addGroup = () =>
    setGroups((gs) => [...gs, { name: '', rawText: '', preview: null }])

  const removeGroup = (idx: number) =>
    setGroups((gs) => gs.filter((_, i) => i !== idx))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createPlan.mutate({
      date,
      title: title || undefined,
      notes: notes || undefined,
      groups: groups.map((g, i) => ({ name: g.name, rawText: g.rawText, order: i })),
    })
  }

  return (
    <div className="page">
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Новий груповий план
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Дата тренування</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        <div className="form-group">
          <label>Назва (необов'язково)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад: Швидкісне тренування" />
        </div>

        <div className="form-group">
          <label>Загальні нотатки</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Загальна інформація про тренування" />
        </div>

        <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Групи вправ</h3>
        {groups.map((group, idx) => (
          <div key={idx} className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <strong>Група {idx + 1}</strong>
              {groups.length > 1 && (
                <button
                  type="button"
                  className="btn-danger"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => removeGroup(idx)}
                >
                  Видалити
                </button>
              )}
            </div>
            <div className="form-group">
              <label>Назва групи</label>
              <input
                value={group.name}
                onChange={(e) => handleGroupChange(idx, 'name', e.target.value)}
                placeholder="Витривалість 1 / Спринт 1"
                required
              />
            </div>
            <div className="form-group">
              <label>Опис тренування</label>
              <textarea
                rows={4}
                value={group.rawText}
                onChange={(e) => handleGroupChange(idx, 'rawText', e.target.value)}
                placeholder="4*800м через 3 хв відпочинку. 2 серії між серіями 5 хв. Пейс 1.20-1.25 хлопці 1.30-1.35 дівчата"
              />
            </div>
            {isAdmin && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.8125rem' }}
                onClick={() => handlePreview(idx)}
              >
                Перевірити парсинг
              </button>
            )}
            {!!group.preview && (
              <pre
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  background: '#f3f4f6',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius)',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(group.preview, null, 2)}
              </pre>
            )}
          </div>
        ))}

        <button type="button" className="btn-secondary" onClick={addGroup} style={{ marginBottom: '1rem' }}>
          + Додати групу
        </button>

        {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" type="submit" disabled={createPlan.isPending}>
            {createPlan.isPending ? 'Збереження...' : 'Зберегти план'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/trainer')}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
