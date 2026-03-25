import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../api/client.js'
import { formatWeekRange } from '../../utils/date.js'
import { DAY_NAMES } from '../../utils/constants.js'

interface IndPlanDay { id: string; dayOfWeek: number; rawText: string | null }
interface IndPlan {
  id: string
  weekStart: string
  notes: string | null
  days: IndPlanDay[]
  athlete: { id: string; name: string; email: string }
}

export function EditIndividualPlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [days, setDays] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const { data: plan, isLoading } = useQuery<IndPlan>({
    queryKey: ['individual-plan', id],
    queryFn: () => api.get(`/plans/individual/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (!plan) return
    setNotes(plan.notes ?? '')
    const dayMap: Record<number, string> = {}
    plan.days.forEach((d) => { dayMap[d.dayOfWeek] = d.rawText ?? '' })
    setDays(dayMap)
  }, [plan?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const updatePlan = useMutation({
    mutationFn: (body: unknown) => api.put(`/plans/individual/${id}`, body),
    onSuccess: () => navigate('/trainer'),
    onError: () => setError('Помилка збереження'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updatePlan.mutate({
      notes: notes || undefined,
      days: Object.entries(days)
        .filter(([, text]) => text.trim())
        .map(([dow, rawText]) => ({ dayOfWeek: +dow, rawText })),
    })
  }

  if (isLoading) return <div className="page">Завантаження...</div>
  if (!plan) return <div className="page">План не знайдено</div>

  return (
    <div className="page">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.125rem' }}>{plan.athlete.name}</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {formatWeekRange(plan.weekStart)}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
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
                  placeholder="Тренування..."
                  style={{ resize: 'vertical', fontSize: '0.8125rem' }}
                />
              </div>
            )
          })}
        </div>

        {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" type="submit" disabled={updatePlan.isPending}>
            {updatePlan.isPending ? 'Збереження...' : 'Зберегти зміни'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/trainer')}>Скасувати</button>
        </div>
      </form>
    </div>
  )
}
