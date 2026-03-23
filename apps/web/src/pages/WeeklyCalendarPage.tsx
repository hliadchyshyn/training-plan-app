import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../api/client.js'
import { calcVolumeKm } from '../utils/volume.js'
import type { FeedbackStatus } from '@training-plan/shared'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

interface Feedback { status: FeedbackStatus; rpe: number; comment: string | null }
interface Session { id: string; exerciseGroupId: string | null; feedback: Feedback | null }
interface ExerciseGroup { id: string; name: string; parsedData?: unknown }
interface GroupPlan {
  id: string
  date: string
  title: string | null
  exerciseGroups: ExerciseGroup[]
  sessions: Session[]
}
interface IndPlanDay {
  id: string
  dayOfWeek: number
  rawText: string | null
  sessions: Session[]
}
interface IndPlan {
  id: string
  weekStart: string
  days: IndPlanDay[]
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const cfg = {
    COMPLETED: { label: 'Виконано', color: '#16a34a', bg: '#dcfce7' },
    PARTIAL:   { label: 'Частково', color: '#ca8a04', bg: '#fef9c3' },
    SKIPPED:   { label: 'Пропущено', color: '#dc2626', bg: '#fee2e2' },
  }[status]
  return (
    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: 9999, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function VolumeChart() {
  const { data: volumeData = [] } = useQuery<Array<{ week: string; volume: number }>>({
    queryKey: ['volume-stats'],
    queryFn: () => api.get('/my/stats/volume?weeks=4').then((r) => r.data),
  })

  if (volumeData.length === 0) return null

  const chartData = volumeData.map((d) => ({
    week: d.week.slice(5).replace('-', '.'),
    volume: d.volume,
  }))

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Тижневий обсяг (км)</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [`${v} км`, 'Обсяг']} />
          <Bar dataKey="volume" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export function WeeklyCalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date()
    const day = today.getDay() === 0 ? 7 : today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - day + 1)
    return monday.toISOString().split('T')[0]
  })

  const { data, isLoading } = useQuery({
    queryKey: ['week', currentDate],
    queryFn: () => api.get(`/my/plans/week?date=${currentDate}`).then((r) => r.data),
  })

  const prevWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d.toISOString().split('T')[0]) }
  const nextWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d.toISOString().split('T')[0]) }

  const weekDates = data ? getWeekDates(data.weekStart) : []
  const groupPlans: GroupPlan[] = data?.groupPlans ?? []
  const indPlans: IndPlan[] = data?.individualPlans ?? []

  const plansByDate: Record<string, GroupPlan[]> = {}
  for (const plan of groupPlans) {
    const date = plan.date.split('T')[0]
    if (!plansByDate[date]) plansByDate[date] = []
    plansByDate[date].push(plan)
  }

  // Weekly summary stats
  const allSessions: Session[] = [
    ...groupPlans.flatMap((p) => p.sessions),
    ...indPlans.flatMap((p) => p.days.flatMap((d) => d.sessions)),
  ]
  const withFeedback = allSessions.filter((s) => s.feedback)
  const completed = withFeedback.filter((s) => s.feedback!.status === 'COMPLETED').length
  const partial   = withFeedback.filter((s) => s.feedback!.status === 'PARTIAL').length
  const skipped   = withFeedback.filter((s) => s.feedback!.status === 'SKIPPED').length
  const avgRpe = withFeedback.length > 0
    ? Math.round(withFeedback.reduce((sum, s) => sum + s.feedback!.rpe, 0) / withFeedback.length * 10) / 10
    : null

  // Planned volume = group exercise groups + individual plan days
  const plannedVolumeKm = Math.round((
    groupPlans.reduce((sum, plan) =>
      sum + plan.exerciseGroups.reduce((s, g) => s + calcVolumeKm(g.parsedData), 0), 0
    ) +
    indPlans.reduce((sum, plan) =>
      sum + plan.days.reduce((s, d) => s + calcVolumeKm((d as IndPlanDay & { parsedData?: unknown }).parsedData), 0), 0
    )
  ) * 10) / 10

  // Completed volume = sessions with COMPLETED/PARTIAL feedback (group + individual)
  const completedVolumeKm = Math.round((
    groupPlans.reduce((sum, plan) => {
      const session = plan.sessions[0]
      if (!session?.feedback || session.feedback.status === 'SKIPPED') return sum
      if (session.exerciseGroupId) {
        const group = plan.exerciseGroups.find((g) => g.id === session.exerciseGroupId)
        return sum + (group ? calcVolumeKm(group.parsedData) : 0)
      }
      return sum + plan.exerciseGroups.reduce((s, g) => s + calcVolumeKm(g.parsedData), 0)
    }, 0) +
    indPlans.reduce((sum, plan) =>
      sum + plan.days.reduce((s, d) => {
        const session = d.sessions[0]
        if (!session?.feedback || session.feedback.status === 'SKIPPED') return s
        return s + calcVolumeKm((d as IndPlanDay & { parsedData?: unknown }).parsedData)
      }, 0), 0
    )
  ) * 10) / 10

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="page">
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <button className="btn-secondary" onClick={prevWeek}>← Попередній</button>
        <h2 style={{ fontWeight: 700, fontSize: '1.125rem', flex: 1, textAlign: 'center' }}>
          {weekDates[0] && `${weekDates[0].slice(5).replace('-', '.')} – ${weekDates[6]?.slice(5).replace('-', '.')}`}
        </h2>
        <button className="btn-secondary" onClick={nextWeek}>Наступний →</button>
      </div>

      {/* Weekly summary */}
      {!isLoading && (groupPlans.length > 0 || indPlans.length > 0) && (
        <div className="card" style={{ marginBottom: '1.25rem', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', color: '#0369a1' }}>Підсумок тижня</p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
            {plannedVolumeKm > 0 && (
              <span style={{ color: '#1e40af' }}>
                Заплановано: <strong>{plannedVolumeKm} км</strong>
              </span>
            )}
            {completedVolumeKm > 0 && (
              <span style={{ color: '#16a34a' }}>
                Тижневий об'єм: <strong>{completedVolumeKm} км</strong>
              </span>
            )}
            {completed > 0 && <span style={{ color: '#16a34a' }}>✓ Виконано: <strong>{completed}</strong></span>}
            {partial > 0   && <span style={{ color: '#ca8a04' }}>~ Частково: <strong>{partial}</strong></span>}
            {skipped > 0   && <span style={{ color: '#dc2626' }}>✗ Пропущено: <strong>{skipped}</strong></span>}
            {avgRpe !== null && <span style={{ color: '#1e40af' }}>RPE avg: <strong>{avgRpe}</strong></span>}
          </div>
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      {!isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {weekDates.map((date, idx) => {
            const dayGroupPlans = plansByDate[date] ?? []
            const dayIndDays = indPlans.flatMap((p) => p.days.filter((d) => d.dayOfWeek === idx + 1 && d.rawText).map((d) => ({ ...d, planId: p.id })))
            const isEmpty = dayGroupPlans.length === 0 && dayIndDays.length === 0
            const isToday = date === today

            return (
              <div key={date} className="card" style={{
                display: 'flex', gap: '1rem',
                opacity: isEmpty ? 0.45 : 1,
                background: isToday ? '#eff6ff' : undefined,
                border: isToday ? '1px solid #bfdbfe' : undefined,
              }}>
                {/* Day label */}
                <div style={{ width: 36, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: isToday ? 'var(--color-primary)' : undefined }}>
                    {DAY_NAMES[idx]}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {date.slice(5).replace('-', '.')}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEmpty && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>День відпочинку</span>}

                  {/* Group plans */}
                  {dayGroupPlans.map((plan) => {
                    const session = plan.sessions[0]
                    return (
                      <Link key={plan.id} to={`/plan/${plan.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: '0.5rem' }}>
                        <div style={{
                          background: 'var(--color-bg)', borderRadius: 'var(--radius)',
                          padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div>
                              <span style={{ fontSize: '0.6875rem', color: '#1e40af', fontWeight: 600, marginRight: '0.5rem' }}>ГРУПОВЕ</span>
                              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{plan.title ?? 'Тренування'}</span>
                            </div>
                            {session?.feedback && <StatusBadge status={session.feedback.status} />}
                            {session && !session.feedback && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Без відгуку →</span>}
                            {!session && <span style={{ fontSize: '0.6875rem', color: 'var(--color-primary)' }}>Розпочати →</span>}
                          </div>
                          {plan.exerciseGroups.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                              {plan.exerciseGroups.map((g) => {
                                const vol = calcVolumeKm(g.parsedData)
                                return (
                                  <span key={g.id} style={{ fontSize: '0.6875rem', background: '#dbeafe', color: '#1e40af', padding: '0.125rem 0.5rem', borderRadius: 9999 }}>
                                    {g.name}{vol > 0 ? ` ~${vol}км` : ''}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}

                  {/* Individual plan days */}
                  {dayIndDays.map((day) => {
                    const session = day.sessions[0] as Session | undefined
                    return (
                      <Link key={day.id} to={`/individual-plan/${day.planId}?day=${day.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: '0.5rem' }}>
                        <div style={{
                          background: '#f0fdf4', borderRadius: 'var(--radius)',
                          padding: '0.5rem 0.75rem', border: '1px solid #bbf7d0',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: '0.6875rem', color: '#15803d', fontWeight: 600, marginRight: '0.5rem' }}>ІНДИВІДУАЛЬНЕ</span>
                              <span style={{ fontSize: '0.875rem', whiteSpace: 'pre-line', display: 'block', marginTop: '0.25rem', color: 'var(--color-text)' }}>
                                {day.rawText}
                              </span>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              {session?.feedback && <StatusBadge status={session.feedback.status} />}
                              {session && !session.feedback && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Без відгуку →</span>}
                              {!session && <span style={{ fontSize: '0.6875rem', color: '#16a34a' }}>Розпочати →</span>}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* <VolumeChart /> */}
    </div>
  )
}
