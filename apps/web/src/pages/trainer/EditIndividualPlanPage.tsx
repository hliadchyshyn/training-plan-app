import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../api/client.js'
import { formatWeekRange } from '../../utils/date.js'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

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

  const { data, isLoading } = useQuery({
    queryKey: ['trainer-plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  })

  const plan: IndPlan | undefined = data?.individualPlans?.find((p: IndPlan) => p.id === id)

  // Pre-fill form once plan loads
  useEffect(() => {
    if (!plan) return
    setNotes(plan.notes ?? '')
    const dayMap: Record<number, string> = {}
    plan.days.forEach((d) => { dayMap[d.dayOfWeek] = d.rawText ?? '' })
    setDays(dayMap)
  }, [plan?.id])

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
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>
        Редагувати план
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        {plan.athlete.name} — тиждень {formatWeekRange(plan.weekStart)}
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Нотатки</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                {DAY_NAMES.map((n, i) => (
                  <th key={i} style={{
                    padding: '0.5rem', textAlign: 'left', fontWeight: 600,
                    fontSize: '0.875rem', borderBottom: '2px solid var(--color-border)',
                    width: `${100 / 7}%`,
                  }}>
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {DAY_NAMES.map((_, idx) => {
                  const dow = idx + 1
                  return (
                    <td key={idx} style={{ padding: '0.5rem', verticalAlign: 'top', borderBottom: '1px solid var(--color-border)' }}>
                      <textarea
                        rows={6}
                        value={days[dow] ?? ''}
                        onChange={(e) => setDays((d) => ({ ...d, [dow]: e.target.value }))}
                        placeholder="Тренування..."
                        style={{ resize: 'vertical', fontSize: '0.8125rem', minHeight: 100 }}
                      />
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" type="submit" disabled={updatePlan.isPending}>
            {updatePlan.isPending ? 'Збереження...' : 'Зберегти зміни'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/trainer')}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
