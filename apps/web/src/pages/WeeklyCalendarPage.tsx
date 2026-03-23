import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { calcVolumeKm } from '../utils/volume.js'
import { formatDate, formatWeekRange, toLocalDateStr } from '../utils/date.js'
import { DAY_NAMES } from '../utils/constants.js'
import type { FeedbackStatus } from '../types/common.js'

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
  parsedData?: unknown
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

function SessionStatus({ session, startColor }: { session: Session | undefined; startColor: string }) {
  if (session?.feedback) return <StatusBadge status={session.feedback.status} />
  if (session) return <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Без відгуку →</span>
  return <span style={{ fontSize: '0.6875rem', color: startColor }}>Розпочати →</span>
}

function getWeekDates(weekStart: string): string[] {
  const [y, mo, da] = weekStart.split('-').map(Number)
  const start = new Date(y, mo - 1, da)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toLocalDateStr(d)
  })
}

export function WeeklyCalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [currentDate, setCurrentDate] = useState(() => {
    const weekParam = searchParams.get('week')
    if (weekParam) return weekParam
    const today = new Date()
    const day = today.getDay() === 0 ? 7 : today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - day + 1)
    return toLocalDateStr(monday)
  })

  const { data, isLoading } = useQuery({
    queryKey: ['week', currentDate],
    queryFn: () => api.get(`/my/plans/week?date=${currentDate}`).then((r) => r.data),
  })

  const changeWeek = (offset: number) => {
    const [y, mo, da] = currentDate.split('-').map(Number)
    const d = new Date(y, mo - 1, da)
    d.setDate(d.getDate() + offset)
    const next = toLocalDateStr(d)
    setCurrentDate(next)
    setSearchParams({ week: next }, { replace: true })
  }

  const weekDates = data ? getWeekDates(data.weekStart) : []
  const groupPlans: GroupPlan[] = data?.groupPlans ?? []
  const indPlans: IndPlan[] = data?.individualPlans ?? []

  // Group plans indexed by date
  const plansByDate: Record<string, GroupPlan[]> = {}
  for (const plan of groupPlans) {
    const date = plan.date.split('T')[0]
    if (!plansByDate[date]) plansByDate[date] = []
    plansByDate[date].push(plan)
  }

  // Individual plan days indexed by day-of-week (1=Mon..7=Sun)
  const indDaysByDow: Record<number, Array<IndPlanDay & { planId: string }>> = {}
  for (const plan of indPlans) {
    for (const day of plan.days) {
      if (!day.rawText) continue
      if (!indDaysByDow[day.dayOfWeek]) indDaysByDow[day.dayOfWeek] = []
      indDaysByDow[day.dayOfWeek].push({ ...day, planId: plan.id })
    }
  }

  // Weekly stats — single pass
  const allSessions: Session[] = [
    ...groupPlans.flatMap((p) => p.sessions),
    ...indPlans.flatMap((p) => p.days.flatMap((d) => d.sessions)),
  ]
  const stats = allSessions.reduce(
    (acc, s) => {
      if (!s.feedback) return acc
      acc[s.feedback.status]++
      acc.rpeSum += s.feedback.rpe
      acc.rpeCount++
      return acc
    },
    { COMPLETED: 0, PARTIAL: 0, SKIPPED: 0, rpeSum: 0, rpeCount: 0 },
  )
  const avgRpe = stats.rpeCount > 0 ? Math.round(stats.rpeSum / stats.rpeCount * 10) / 10 : null

  // Volume — single pass over both types
  let plannedKm = 0
  let completedKm = 0
  for (const plan of groupPlans) {
    const groupVolumes = new Map(plan.exerciseGroups.map((g) => [g.id, calcVolumeKm(g.parsedData)]))
    const planVol = [...groupVolumes.values()].reduce((s, v) => s + v, 0)
    plannedKm += planVol
    const session = plan.sessions[0]
    if (session?.feedback && session.feedback.status !== 'SKIPPED') {
      completedKm += session.exerciseGroupId
        ? (groupVolumes.get(session.exerciseGroupId) ?? 0)
        : planVol
    }
  }
  for (const plan of indPlans) {
    for (const day of plan.days) {
      const vol = calcVolumeKm(day.parsedData)
      plannedKm += vol
      const session = day.sessions[0]
      if (session?.feedback && session.feedback.status !== 'SKIPPED') completedKm += vol
    }
  }
  const plannedVolumeKm = Math.round(plannedKm * 10) / 10
  const completedVolumeKm = Math.round(completedKm * 10) / 10

  const today = toLocalDateStr(new Date())

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <button className="btn-secondary" onClick={() => changeWeek(-7)}>← Попередній</button>
        <h2 style={{ fontWeight: 700, fontSize: '1.125rem', flex: 1, textAlign: 'center' }}>
          {data?.weekStart && formatWeekRange(data.weekStart)}
        </h2>
        <button className="btn-secondary" onClick={() => changeWeek(7)}>Наступний →</button>
      </div>

      {!isLoading && (groupPlans.length > 0 || indPlans.length > 0) && (
        <div className="card" style={{ marginBottom: '1.25rem', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', color: '#0369a1' }}>Підсумок тижня</p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
            {plannedVolumeKm > 0 && <span style={{ color: '#1e40af' }}>Заплановано: <strong>{plannedVolumeKm} км</strong></span>}
            {completedVolumeKm > 0 && <span style={{ color: '#16a34a' }}>Тижневий об'єм: <strong>{completedVolumeKm} км</strong></span>}
            {stats.COMPLETED > 0 && <span style={{ color: '#16a34a' }}>✓ Виконано: <strong>{stats.COMPLETED}</strong></span>}
            {stats.PARTIAL > 0   && <span style={{ color: '#ca8a04' }}>~ Частково: <strong>{stats.PARTIAL}</strong></span>}
            {stats.SKIPPED > 0   && <span style={{ color: '#dc2626' }}>✗ Пропущено: <strong>{stats.SKIPPED}</strong></span>}
            {avgRpe !== null && <span style={{ color: '#1e40af' }}>RPE avg: <strong>{avgRpe}</strong></span>}
          </div>
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      {!isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {weekDates.map((date, idx) => {
            const dow = idx + 1
            const dayGroupPlans = plansByDate[date] ?? []
            const dayIndDays = indDaysByDow[dow] ?? []
            const isEmpty = dayGroupPlans.length === 0 && dayIndDays.length === 0
            const isToday = date === today

            return (
              <div key={date} className="card" style={{
                display: 'flex', gap: '1rem',
                opacity: isEmpty ? 0.45 : 1,
                background: isToday ? '#eff6ff' : undefined,
                border: isToday ? '1px solid #bfdbfe' : undefined,
              }}>
                <div style={{ width: 36, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: isToday ? 'var(--color-primary)' : undefined }}>
                    {DAY_NAMES[idx]}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {formatDate(date).slice(0, 5)}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEmpty && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>День відпочинку</span>}

                  {dayGroupPlans.map((plan) => (
                    <Link key={plan.id} to={`/plan/${plan.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: '0.5rem' }}>
                      <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.6875rem', color: '#1e40af', fontWeight: 600, marginRight: '0.5rem' }}>ГРУПОВЕ</span>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{plan.title ?? 'Тренування'}</span>
                          </div>
                          <SessionStatus session={plan.sessions[0]} startColor="var(--color-primary)" />
                        </div>
                        {plan.exerciseGroups.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                            {plan.exerciseGroups.map((g) => {
                              const vol = calcVolumeKm(g.parsedData)
                              const chosenGroupId = plan.sessions[0]?.exerciseGroupId
                              const isChosen = chosenGroupId === g.id
                              const isInactive = !!chosenGroupId && !isChosen
                              return (
                                <span key={g.id} style={{
                                  fontSize: '0.6875rem',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: 9999,
                                  background: isInactive ? 'transparent' : '#dbeafe',
                                  color: isInactive ? '#93c5fd' : '#1e40af',
                                  border: isInactive ? '1px solid #bfdbfe' : 'none',
                                  textDecoration: isInactive ? 'line-through' : 'none',
                                }}>
                                  {g.name}{vol > 0 ? ` ~${vol}км` : ''}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}

                  {dayIndDays.map((day) => (
                    <Link key={day.id} to={`/individual-plan/${day.planId}?day=${day.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: '0.5rem' }}>
                      <div style={{ background: '#f0fdf4', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem', border: '1px solid #bbf7d0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.6875rem', color: '#15803d', fontWeight: 600, marginRight: '0.5rem' }}>ІНДИВІДУАЛЬНЕ</span>
                            <span style={{ fontSize: '0.875rem', whiteSpace: 'pre-line', display: 'block', marginTop: '0.25rem', color: 'var(--color-text)' }}>
                              {day.rawText}
                            </span>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <SessionStatus session={day.sessions[0]} startColor="#16a34a" />
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}