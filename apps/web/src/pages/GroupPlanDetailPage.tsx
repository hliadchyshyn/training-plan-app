import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'
import { WorkoutCard } from '../components/WorkoutCard.js'
import type { FeedbackStatus } from '@training-plan/shared'

interface ExerciseGroup {
  id: string
  name: string
  rawText: string
  parsedData: unknown
}

interface Feedback {
  status: FeedbackStatus
  rpe: number
  comment: string | null
}

interface Session {
  id: string
  exerciseGroupId: string | null
  feedback: Feedback | null
}

interface Plan {
  id: string
  date: string
  title: string | null
  notes: string | null
  exerciseGroups: ExerciseGroup[]
  sessions: Session[]
  team: { id: string; name: string } | null
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  COMPLETED: 'Виконано',
  PARTIAL: 'Частково',
  SKIPPED: 'Пропущено',
}

export function GroupPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<{ status?: FeedbackStatus; rpe: number; comment: string }>({ rpe: 5, comment: '' })

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ['plan', id],
    queryFn: () => api.get(`/my/plans/group/${id}`).then((r) => r.data),
  })

  const mySession = plan?.sessions[0]

  const submitWithFeedback = useMutation({
    mutationFn: (data: typeof feedbackForm & { exerciseGroupId: string }) =>
      api.post('/my/sessions/with-feedback', {
        planId: id,
        exerciseGroupId: data.exerciseGroupId,
        date: plan?.date.split('T')[0],
        status: data.status,
        rpe: data.rpe,
        comment: data.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', id] })
      qc.invalidateQueries({ queryKey: ['week'] })
      setSelectedGroupId(null)
    },
  })

  if (isLoading) return <div className="page">Завантаження...</div>
  if (!plan) return <div className="page">План не знайдено</div>

  const planDate = new Date(plan.date).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

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
        {plan.title ?? 'Групове тренування'}
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        {planDate}{plan.team && ` · ${plan.team.name}`}
      </p>

      {plan.notes && (
        <div className="card" style={{ marginBottom: '1rem', fontStyle: 'italic', fontSize: '0.875rem' }}>
          {plan.notes}
        </div>
      )}

      {mySession?.feedback && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Відгук збережено</p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge badge-${mySession.feedback.status.toLowerCase() as 'completed' | 'partial' | 'skipped'}`}>
              {STATUS_LABELS[mySession.feedback.status]}
            </span>
            <span style={{ fontSize: '0.875rem' }}>RPE: {mySession.feedback.rpe}</span>
            {mySession.feedback.comment && (
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {mySession.feedback.comment}
              </span>
            )}
          </div>
        </div>
      )}

      {!mySession?.feedback && (
        <>
          <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
            {selectedGroupId ? 'Залиште відгук:' : 'Оберіть свою групу:'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {plan.exerciseGroups.map((group) => {
              const isSelected = selectedGroupId === group.id

              return (
                <div
                  key={group.id}
                  className="card"
                  style={{
                    cursor: isSelected ? 'default' : 'pointer',
                    border: isSelected
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    opacity: selectedGroupId && !isSelected ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                  onClick={() => {
                    if (!selectedGroupId) setSelectedGroupId(group.id)
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
                    {group.name}
                  </div>
                  <WorkoutCard rawText={group.rawText} parsedData={group.parsedData} />

                  {isSelected && (
                    <div
                      style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>Як пройшло?</label>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                          {(['COMPLETED', 'PARTIAL', 'SKIPPED'] as FeedbackStatus[]).map((s) => (
                            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="status"
                                value={s}
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
                          placeholder="Як пройшло тренування?"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn-primary"
                          disabled={!feedbackForm.status || submitWithFeedback.isPending}
                          onClick={() => submitWithFeedback.mutate({ ...feedbackForm, exerciseGroupId: group.id })}
                        >
                          {submitWithFeedback.isPending ? 'Збереження...' : 'Зберегти відгук'}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => setSelectedGroupId(null)}
                        >
                          Скасувати
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
