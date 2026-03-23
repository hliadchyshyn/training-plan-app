import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client.js'
import type { FeedbackStatus } from '@training-plan/shared'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

interface IndPlanDay {
  id: string
  dayOfWeek: number
  rawText: string | null
  sessions: Array<{
    id: string
    feedback: { status: FeedbackStatus; rpe: number; comment: string | null } | null
  }>
}

interface IndPlan {
  id: string
  weekStart: string
  notes: string | null
  days: IndPlanDay[]
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  COMPLETED: 'Виконано',
  PARTIAL: 'Частково',
  SKIPPED: 'Пропущено',
}

export function IndividualPlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<{ status?: FeedbackStatus; rpe: number; comment: string }>({ rpe: 5, comment: '' })

  const { data: plans, isLoading } = useQuery<IndPlan[]>({
    queryKey: ['individual-plans'],
    queryFn: () => api.get('/my/plans/individual').then((r) => r.data),
  })

  const plan = plans?.find((p) => p.id === id)

  const submitWithFeedback = useMutation({
    mutationFn: ({ dayId, date }: { dayId: string; date: string }) =>
      api.post('/my/sessions/with-feedback', {
        individualPlanDayId: dayId,
        date,
        status: feedbackForm.status,
        rpe: feedbackForm.rpe,
        comment: feedbackForm.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['individual-plans'] })
      qc.invalidateQueries({ queryKey: ['week'] })
      setActiveDayId(null)
    },
  })

  if (isLoading) return <div className="page">Завантаження...</div>
  if (!plan) return <div className="page">План не знайдено</div>

  const weekStart = new Date(plan.weekStart)
  const dateForDay = (dow: number) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dow - 1)
    return d.toISOString().split('T')[0]
  }

  return (
    <div className="page">
      <button
        className="btn-secondary"
        style={{ fontSize: '0.875rem', marginBottom: '1rem', padding: '0.25rem 0.75rem' }}
        onClick={() => navigate(-1)}
      >
        ← Назад
      </button>

      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>
        Індивідуальний план
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Тиждень {plan.weekStart.slice(0, 10)}
      </p>

      {plan.notes && (
        <div className="card" style={{ marginBottom: '1rem', fontStyle: 'italic', fontSize: '0.875rem' }}>
          {plan.notes}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {DAY_NAMES.map((name, idx) => {
          const dow = idx + 1
          const day = plan.days.find((d) => d.dayOfWeek === dow)
          const session = day?.sessions[0]
          const isActive = activeDayId === day?.id
          const date = dateForDay(dow)

          if (!day?.rawText) {
            return (
              <div key={dow} className="card" style={{ opacity: 0.4, display: 'flex', gap: '1rem' }}>
                <strong style={{ width: 30 }}>{name}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Відпочинок</span>
              </div>
            )
          }

          return (
            <div
              key={dow}
              className="card"
              style={{
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
                cursor: session?.feedback ? 'default' : 'pointer',
                border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
              onClick={() => {
                if (!session?.feedback && !isActive) {
                  setActiveDayId(day.id)
                  setFeedbackForm({ rpe: 5, comment: '', status: undefined })
                }
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <strong style={{ width: 30, flexShrink: 0 }}>{name}</strong>
                <div style={{ flex: 1, whiteSpace: 'pre-line', fontSize: '0.875rem' }}>{day.rawText}</div>
                {session?.feedback && (
                  <span className={`badge badge-${session.feedback.status.toLowerCase() as 'completed' | 'partial' | 'skipped'}`} style={{ flexShrink: 0 }}>
                    {STATUS_LABELS[session.feedback.status]}
                  </span>
                )}
                {!session?.feedback && !isActive && (
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-primary)', flexShrink: 0 }}>Залишити відгук →</span>
                )}
              </div>

              {session?.feedback && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', paddingLeft: 46 }}>
                  RPE: {session.feedback.rpe}{session.feedback.comment && ` · ${session.feedback.comment}`}
                </div>
              )}

              {isActive && (
                <div
                  style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="form-group">
                    <label style={{ fontWeight: 600 }}>Як пройшло?</label>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                      {(['COMPLETED', 'PARTIAL', 'SKIPPED'] as FeedbackStatus[]).map((s) => (
                        <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`status-${day.id}`}
                            checked={feedbackForm.status === s}
                            onChange={() => setFeedbackForm((f) => ({ ...f, status: s }))}
                            style={{ width: 'auto' }}
                          />
                          {STATUS_LABELS[s]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>RPE (навантаження): {feedbackForm.rpe}</label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={feedbackForm.rpe}
                      onChange={(e) => setFeedbackForm((f) => ({ ...f, rpe: +e.target.value }))}
                      style={{ padding: 0, border: 'none' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Коментар (необов'язково)</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.comment}
                      onChange={(e) => setFeedbackForm((f) => ({ ...f, comment: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn-primary"
                      disabled={!feedbackForm.status || submitWithFeedback.isPending}
                      onClick={() => submitWithFeedback.mutate({ dayId: day.id, date })}
                    >
                      {submitWithFeedback.isPending ? 'Збереження...' : 'Зберегти відгук'}
                    </button>
                    <button className="btn-secondary" onClick={() => setActiveDayId(null)}>
                      Скасувати
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
