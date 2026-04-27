import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../api/client.js'
import { getMondayOfWeek } from '../../utils/date.js'
import { DAY_NAMES } from '../../utils/constants.js'
import { TemplateLibraryPicker } from '../../components/TemplateLibraryPicker.js'

interface PendingTemplate {
  name: string
  planText: string
}

export function CreateIndividualPlanPage() {
  const navigate = useNavigate()
  const [athleteId, setAthleteId] = useState('')
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date().toISOString()))
  const [days, setDays] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState('')
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate | null>(null)
  const [error, setError] = useState('')

  const { data: uniqueAthletes = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ['my-athletes'],
    queryFn: () => api.get('/teams/athletes').then((r) => r.data),
  })

  const createPlan = useMutation({
    mutationFn: (data: unknown) => api.post('/plans/individual', data),
    onSuccess: () => navigate('/trainer'),
    onError: () => setError('Помилка збереження плану'),
  })

  const queueTemplateForDaySelection = (template: { name: string; planText: string }) => {
    setPendingTemplate({ name: template.name, planText: template.planText })
    setError('')
  }

  const applyTemplateToDay = (dayOfWeek: number) => {
    if (!pendingTemplate) return

    setDays((current) => {
      const existingText = current[dayOfWeek]?.trim()
      const nextText = existingText
        ? `${current[dayOfWeek].trim()}\n\n${pendingTemplate.planText}`
        : pendingTemplate.planText

      return { ...current, [dayOfWeek]: nextText }
    })

    setPendingTemplate(null)
    setError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!athleteId) return setError('Оберіть спортсмена')
    createPlan.mutate({
      athleteId,
      weekStart,
      notes: notes || undefined,
      days: Object.entries(days)
        .filter(([, text]) => text)
        .map(([dow, rawText]) => ({ dayOfWeek: +dow, rawText })),
    })
  }

  return (
    <div className="page">
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Індивідуальний план
      </h2>
      <form onSubmit={handleSubmit}>
        <TemplateLibraryPicker
          title="Додати тренування з бібліотеки"
          description="Оберіть шаблон, а після кліку виберіть день, куди його підставити."
          buttonLabel="Обрати день"
          onApply={queueTemplateForDaySelection}
        />

        {pendingTemplate && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Куди підставити тренування</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                Шаблон "{pendingTemplate.name}". Якщо день уже має текст, нове тренування буде додано нижче.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {DAY_NAMES.map((dayName, index) => {
                const dayOfWeek = index + 1
                return (
                  <button
                    key={dayName}
                    type="button"
                    className="btn-secondary"
                    onClick={() => applyTemplateToDay(dayOfWeek)}
                  >
                    {dayName}
                  </button>
                )
              })}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingTemplate(null)}
              >
                Скасувати вибір
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Спортсмен</label>
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} required>
              <option value="">Оберіть спортсмена...</option>
              {uniqueAthletes.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Тиждень (понеділок)</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(getMondayOfWeek(e.target.value))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Нотатки</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}>
          {DAY_NAMES.map((name, idx) => {
            const dow = idx + 1
            return (
              <div key={idx}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem' }}>{name}</label>
                <textarea
                  rows={5}
                  value={days[dow] ?? ''}
                  onChange={(e) => setDays((d) => ({ ...d, [dow]: e.target.value }))}
                  placeholder="Введіть тренування..."
                  style={{ resize: 'vertical', fontSize: '0.8125rem' }}
                />
              </div>
            )
          })}
        </div>

        {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" type="submit" disabled={createPlan.isPending}>
            {createPlan.isPending ? 'Збереження...' : 'Зберегти план'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/trainer')}>Скасувати</button>
        </div>
      </form>
    </div>
  )
}
