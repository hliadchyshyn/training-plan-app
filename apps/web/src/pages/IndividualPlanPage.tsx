import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'
import { FeedbackForm } from '../components/FeedbackForm.js'
import { StravaActivityChip } from '../components/StravaActivityChip.js'
import { formatWeekRange } from '../utils/date.js'
import { DAY_NAMES, STATUS_LABELS } from '../utils/constants.js'
import type { FeedbackStatus, StravaActivity } from '../types/common.js'

interface IndPlanDay {
  id: string
  dayOfWeek: number
  rawText: string | null
  sessions: Array<{
    id: string
    feedback: { status: FeedbackStatus; rpe: number; comment: string | null } | null
    stravaActivity?: StravaActivity | null
  }>
}

interface IndPlan {
  id: string
  weekStart: string
  notes: string | null
  days: IndPlanDay[]
}

export function IndividualPlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [activeDayId, setActiveDayId] = useState<string | null>(() => searchParams.get('day'))

  const { data: plans, isLoading } = useQuery<IndPlan[]>({
    queryKey: ['individual-plans'],
    queryFn: () => api.get('/my/plans/individual').then((r) => r.data),
  })

  const plan = plans?.find((p) => p.id === id)

  const submitFeedback = useMutation({
    mutationFn: ({ dayId, date }: { dayId: string; date: string }) =>
      api.post('/my/sessions/with-feedback', {
        individualPlanDayId: dayId,
        date,
        status: undefined, // overridden by FeedbackForm onSubmit
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['individual-plans'] })
      qc.invalidateQueries({ queryKey: ['week'] })
      if (searchParams.get('day')) navigate(-1); else setActiveDayId(null)
    },
  })

  if (isLoading) return <div className="page"><p className="page-loading">Завантаження...</p></div>
  if (!plan) return <div className="page"><p className="page-empty">План не знайдено</p></div>

  const weekStart = new Date(plan.weekStart)
  const dateForDay = (dow: number) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dow - 1)
    return d.toISOString().split('T')[0]
  }

  // Index days by dayOfWeek for O(1) lookup
  const daysByDow = new Map(plan.days.map((d) => [d.dayOfWeek, d]))

  const handleCancel = () => {
    if (searchParams.get('day')) navigate(-1); else setActiveDayId(null)
  }

  return (
    <div className="page">
      <button className="btn-back" onClick={handleCancel}>← Назад</button>

      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>
        Індивідуальний план
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Тиждень {formatWeekRange(plan.weekStart)}
      </p>

      {plan.notes && (
        <div className="card" style={{ marginBottom: '1rem', fontStyle: 'italic', fontSize: '0.875rem' }}>
          {plan.notes}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {DAY_NAMES.map((name, idx) => {
          const dow = idx + 1
          const day = daysByDow.get(dow)
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
                if (!session?.feedback && !isActive) setActiveDayId(day.id)
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <strong style={{ width: 30, flexShrink: 0 }}>{name}</strong>
                <div style={{ flex: 1, whiteSpace: 'pre-line', fontSize: '0.875rem' }}>{day.rawText}</div>
                {session?.feedback && (
                  <span className={`badge badge-${session.feedback.status.toLowerCase()}`} style={{ flexShrink: 0 }}>
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
                  {session.stravaActivity && (
                    <div style={{ marginTop: '0.375rem' }}>
                      <StravaActivityChip activity={{ ...session.stravaActivity, stravaId: session.stravaActivity.stravaId.toString() }} />
                    </div>
                  )}
                </div>
              )}

              {isActive && (
                <div
                  style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <FeedbackForm
                    namePrefix={`status-${day.id}`}
                    isPending={submitFeedback.isPending}
                    onSubmit={(values) =>
                      api.post('/my/sessions/with-feedback', {
                        individualPlanDayId: day.id,
                        date,
                        ...values,
                        comment: values.comment || undefined,
                      }).then(() => {
                        qc.invalidateQueries({ queryKey: ['individual-plans'] })
                        qc.invalidateQueries({ queryKey: ['week'] })
                        if (searchParams.get('day')) navigate(-1); else setActiveDayId(null)
                      })
                    }
                    onCancel={handleCancel}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
