import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDeviceWatch } from '@tabler/icons-react'
import { api } from '../api/client.js'
import { WorkoutCard } from '../components/WorkoutCard.js'
import { FeedbackForm } from '../components/FeedbackForm.js'
import { StravaActivityChip } from '../components/StravaActivityChip.js'
import { STATUS_LABELS } from '../utils/constants.js'
import type { FeedbackStatus, ExerciseGroup, Session } from '../types/common.js'

interface Plan {
  id: string
  date: string
  title: string | null
  notes: string | null
  exerciseGroups: ExerciseGroup[]
  sessions: Session[]
  team: { id: string; name: string } | null
}

export function GroupPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [isEditingFeedback, setIsEditingFeedback] = useState(false)

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ['plan', id],
    queryFn: () => api.get(`/my/plans/group/${id}`).then((r) => r.data),
  })

  const convertToWatch = useMutation({
    mutationFn: (body: { sourceId: string; name: string }) =>
      api.post('/watch-workouts/from-plan', { sourceType: 'GROUP_PLAN', ...body }).then((r) => r.data),
    onSuccess: (data) => navigate(`/watch-workouts/${data.id}`),
  })

  const submitFeedback = useMutation({
    mutationFn: (body: { exerciseGroupId: string; status: FeedbackStatus; rpe: number; comment: string }) =>
      api.post('/my/sessions/with-feedback', {
        planId: id,
        date: plan?.date.split('T')[0],
        ...body,
        comment: body.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', id] })
      qc.invalidateQueries({ queryKey: ['week'] })
      setSelectedGroupId(null)
      setIsEditingFeedback(false)
    },
  })

  if (isLoading) return <div className="page"><p className="page-loading">Завантаження...</p></div>
  if (!plan) return <div className="page"><p className="page-empty">План не знайдено</p></div>

  const planDate = new Date(plan.date).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const mySession = plan.sessions[0]
  const stravaActivity = (mySession as { stravaActivity?: { id: string; stravaId: string; name: string; type: string; startDateLocal: string; distance: number; movingTime: number; averageHeartrate?: number | null; maxHeartrate?: number | null; totalElevationGain?: number | null; sessionId?: string | null } } | undefined)?.stravaActivity ?? null

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate(-1)}>← Назад</button>

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

      {mySession?.feedback && !isEditingFeedback && (
        <div className="card card-success" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Відгук збережено</p>
            <button
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '2px 8px', flexShrink: 0 }}
              onClick={() => setIsEditingFeedback(true)}
            >
              Редагувати
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge badge-${mySession.feedback.status.toLowerCase()}`}>
              {STATUS_LABELS[mySession.feedback.status]}
            </span>
            <span style={{ fontSize: '0.875rem' }}>RPE: {mySession.feedback.rpe}</span>
            {mySession.feedback.comment && (
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {mySession.feedback.comment}
              </span>
            )}
          </div>
          {stravaActivity && (
            <div style={{ marginTop: '0.75rem' }}>
              <StravaActivityChip activity={{ ...stravaActivity, stravaId: stravaActivity.stravaId.toString() }} />
            </div>
          )}
        </div>
      )}

      {mySession?.feedback && isEditingFeedback && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Редагування відгуку</p>
          <FeedbackForm
            namePrefix="status-edit"
            isPending={submitFeedback.isPending}
            initialValues={mySession.feedback}
            onSubmit={(values) => submitFeedback.mutate({ exerciseGroupId: mySession.exerciseGroupId ?? '', ...values })}
            onCancel={() => setIsEditingFeedback(false)}
          />
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
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    opacity: selectedGroupId && !isSelected ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                  onClick={() => { if (!selectedGroupId) setSelectedGroupId(group.id) }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
                    {group.name}
                  </div>
                  <WorkoutCard rawText={group.rawText} parsedData={group.parsedData} />

                  <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      disabled={convertToWatch.isPending}
                      onClick={() => convertToWatch.mutate({ sourceId: group.id, name: group.name })}
                    >
                      <IconDeviceWatch size={14} /> На годинник
                    </button>
                  </div>

                  {isSelected && (
                    <div
                      style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FeedbackForm
                        namePrefix={`status-${group.id}`}
                        isPending={submitFeedback.isPending}
                        onSubmit={(values) => submitFeedback.mutate({ exerciseGroupId: group.id, ...values })}
                        onCancel={() => setSelectedGroupId(null)}
                      />
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
