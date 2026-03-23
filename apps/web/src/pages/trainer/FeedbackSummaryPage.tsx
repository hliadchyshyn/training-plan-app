import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client.js'

interface FeedbackItem {
  id: string
  athlete: { id: string; name: string; email: string }
  exerciseGroup: { id: string; name: string } | null
  date: string | null
  feedback: { status: string; rpe: number; comment: string | null } | null
  hasSession?: boolean
}

function TrafficDot({ status, rpe, hasSession }: { status?: string; rpe?: number; hasSession?: boolean }) {
  let color = '#e5e7eb'
  let title = 'Не розпочато'

  if (hasSession && !status) {
    color = '#fbbf24'
    title = 'Розпочато, без відгуку'
  } else if (status === 'SKIPPED') {
    color = '#ef4444'
    title = 'Пропущено'
  } else if ((rpe ?? 0) >= 9) {
    color = '#ef4444'
    title = 'Висока RPE'
  } else if (status === 'COMPLETED') {
    color = '#22c55e'
    title = 'Виконано'
  } else if (status === 'PARTIAL') {
    color = '#f59e0b'
    title = 'Частково'
  }

  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 10, height: 10,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        marginTop: 3,
      }}
    />
  )
}

export function FeedbackSummaryPage() {
  const { id } = useParams<{ id: string }>()

  const { data: sessions = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback', id],
    queryFn: () => api.get(`/plans/${id}/feedback`).then((r) => r.data),
  })

  const withFeedback = sessions.filter((s) => s.feedback)
  const avgRpe = withFeedback.length
    ? (withFeedback.reduce((sum, s) => sum + (s.feedback?.rpe ?? 0), 0) / withFeedback.length).toFixed(1)
    : null

  const completed = withFeedback.filter((s) => s.feedback?.status === 'COMPLETED').length
  const partial = withFeedback.filter((s) => s.feedback?.status === 'PARTIAL').length
  const skipped = withFeedback.filter((s) => s.feedback?.status === 'SKIPPED').length

  return (
    <div className="page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/trainer" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          ← Назад до панелі
        </Link>
      </div>
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Відгуки спортсменів
      </h2>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      {!isLoading && sessions.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Ще немає відгуків</p>
      )}

      {sessions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {avgRpe && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Середній RPE</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{avgRpe}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Відповіли</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{withFeedback.length} / {sessions.length}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {completed > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />{completed}</span>}
              {partial > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0 }} />{partial}</span>}
              {skipped > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} />{skipped}</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sessions.map((session) => (
          <div key={session.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <TrafficDot
              status={session.feedback?.status}
              rpe={session.feedback?.rpe}
              hasSession={session.hasSession}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{session.athlete.name}</span>
                  {session.exerciseGroup && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginLeft: '0.5rem' }}>
                      {session.exerciseGroup.name}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                  {session.feedback && (
                    <>
                      <span className={`badge badge-${session.feedback.status.toLowerCase() as 'completed' | 'partial' | 'skipped'}`}>
                        {session.feedback.status === 'COMPLETED' ? 'Виконано' : session.feedback.status === 'PARTIAL' ? 'Частково' : 'Пропущено'}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>RPE {session.feedback.rpe}</span>
                    </>
                  )}
                  {!session.feedback && !session.hasSession && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Не розпочато</span>
                  )}
                  {!session.feedback && session.hasSession && (
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Без відгуку</span>
                  )}
                </div>
              </div>
              {session.feedback?.comment && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {session.feedback.comment}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
