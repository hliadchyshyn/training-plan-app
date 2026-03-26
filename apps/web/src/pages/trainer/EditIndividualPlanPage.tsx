import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../api/client.js'
import { formatWeekRange } from '../../utils/date.js'
import { DAY_NAMES, STATUS_LABELS } from '../../utils/constants.js'
import { StravaActivityChip } from '../../components/StravaActivityChip.js'
import type { FeedbackStatus, StravaActivity } from '../../types/common.js'

interface Session { id: string; feedback: { status: FeedbackStatus; rpe: number; comment: string | null } | null; stravaActivity?: StravaActivity | null }
interface IndPlanDay { id: string; dayOfWeek: number; rawText: string | null; sessions: Session[] }
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
  const [tab, setTab] = useState<'edit' | 'feedback'>('feedback')
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
    onSuccess: () => navigate('/trainer?tab=individual'),
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

  if (isLoading) return <div className="page"><p className="page-loading">Завантаження...</p></div>
  if (!plan) return <div className="page"><p className="page-empty">План не знайдено</p></div>

  const daysByDow = new Map(plan.days.map((d) => [d.dayOfWeek, d]))

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate('/trainer?tab=individual')}>← Назад</button>

      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.125rem' }}>{plan.athlete.name}</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {formatWeekRange(plan.weekStart)}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {(['feedback', 'edit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontWeight: 600, fontSize: '0.9375rem', padding: '0.25rem 0.75rem',
              border: 'none', background: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'edit' ? 'Редагувати' : 'Відгуки'}
          </button>
        ))}
      </div>

      {tab === 'edit' && (
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
            <button type="button" className="btn-secondary" onClick={() => navigate('/trainer?tab=individual')}>Скасувати</button>
          </div>
        </form>
      )}

      {tab === 'feedback' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {DAY_NAMES.map((name, idx) => {
            const dow = idx + 1
            const day = daysByDow.get(dow)
            if (!day?.rawText) return null
            const session = day.sessions[0]
            const feedback = session?.feedback

            return (
              <div key={dow} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>{name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', whiteSpace: 'pre-line' }}>{day.rawText}</div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {feedback ? (
                      <>
                        <span className={`badge badge-${feedback.status.toLowerCase()}`}>
                          {STATUS_LABELS[feedback.status]}
                        </span>
                        <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>RPE {feedback.rpe}</div>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {session ? 'Без відгуку' : 'Не виконано'}
                      </span>
                    )}
                  </div>
                </div>
                {feedback?.comment && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    {feedback.comment}
                  </p>
                )}
                {session?.stravaActivity && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <StravaActivityChip activity={session.stravaActivity} />
                  </div>
                )}
              </div>
            )
          })}
          {plan.days.filter(d => d.rawText).length === 0 && (
            <p style={{ color: 'var(--color-text-muted)' }}>Немає запланованих днів</p>
          )}
        </div>
      )}
    </div>
  )
}
