import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ActionIcon } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { api } from '../../api/client.js'
import { formatDate, formatWeekRange, toLocalDateStr } from '../../utils/date.js'

const LIMIT = 50
const MS_PER_DAY = 86400000
const MS_PER_WEEK = 7 * MS_PER_DAY

const UPCOMING_ORDER = ['Сьогодні', 'Цього тижня', 'Наступного тижня', 'Пізніше']
const IND_UPCOMING_ORDER = ['Цього тижня', 'Наступного тижня', 'Пізніше']
const SELECT_STYLE = {
  padding: '0.25rem 0.5rem',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--color-border)',
  fontSize: '0.8125rem',
}

type MainTab = 'group' | 'individual'
type TimeTab = 'upcoming' | 'past'
type SectionGroup<T> = { section: string; items: T[] }

type DateContext = {
  todayDate: Date
  todayStr: string
  thisWeekSun: Date
  nextWeekSun: Date
  thisMondayMs: number
}

type GroupPlan = {
  id: string
  date: string
  title: string | null
  exerciseGroups: Array<{ id: string }>
  team?: { name: string } | null
}

type IndividualPlan = {
  id: string
  weekStart: string
  athlete: { name: string }
  days: Array<{ sessions: Array<{ feedback: { status: string } | null }> }>
}

type AthleteOption = { id: string; name: string }

function createDateContext(now = new Date()): DateContext {
  const todayDate = new Date(now)
  todayDate.setHours(0, 0, 0, 0)

  const sunOffset = (7 - todayDate.getDay()) % 7
  const thisWeekSun = new Date(todayDate)
  thisWeekSun.setDate(todayDate.getDate() + sunOffset)

  const nextWeekSun = new Date(thisWeekSun)
  nextWeekSun.setDate(thisWeekSun.getDate() + 7)

  return {
    todayDate,
    todayStr: toLocalDateStr(todayDate),
    thisWeekSun,
    nextWeekSun,
    thisMondayMs: todayDate.getTime() - ((todayDate.getDay() + 6) % 7) * MS_PER_DAY,
  }
}

function getUpcomingSection(dateStr: string, context: DateContext): string {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  if (d.getTime() === context.todayDate.getTime()) return 'Сьогодні'
  if (d <= context.thisWeekSun) return 'Цього тижня'
  if (d <= context.nextWeekSun) return 'Наступного тижня'
  return 'Пізніше'
}

function getPastSection(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
}

function getUpcomingIndSection(weekStart: string, context: DateContext): string {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0)
  const weeksAhead = Math.round((ws.getTime() - context.thisMondayMs) / MS_PER_WEEK)
  if (weeksAhead === 0) return 'Цього тижня'
  if (weeksAhead === 1) return 'Наступного тижня'
  return 'Пізніше'
}

function groupBySection<T>(items: T[], getSection: (item: T) => string, order?: string[]): SectionGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const s = getSection(item)
    if (!map.has(s)) map.set(s, [])
    map.get(s)!.push(item)
  }
  const result: Array<{ section: string; items: T[] }> = []
  if (order) {
    for (const s of order) {
      if (map.has(s)) { result.push({ section: s, items: map.get(s)! }); map.delete(s) }
    }
  }
  for (const [s, its] of map) result.push({ section: s, items: its })
  return result
}

function buildMonthOptions(now = new Date()) {
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1)
    return {
      val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }),
    }
  })
}

function getFeedbackSummary(plan: IndividualPlan) {
  const totalDays = plan.days.length
  const daysWithFeedback = plan.days.filter((d) => d.sessions[0]?.feedback).length
  const completedDays = plan.days.filter((d) => d.sessions[0]?.feedback?.status === 'COMPLETED').length

  return { totalDays, daysWithFeedback, completedDays }
}

function useTimeTab(paramName: string): [TimeTab, (value: TimeTab) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramValue = searchParams.get(paramName)
  const value: TimeTab = paramValue === 'past' || paramValue === 'upcoming' ? paramValue : 'upcoming'
  const setValue = (nextValue: TimeTab) => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      next.set(paramName, nextValue)
      return next
    }, { replace: true })
  }

  return [value, setValue]
}

function readMainTab(value: string | null): MainTab {
  return value === 'individual' ? 'individual' : 'group'
}

function TabBar({ tabs, active, onChange }: { tabs: { value: string; label: string }[]; active: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: '1rem' }}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} style={{
          flex: 1, fontWeight: 600, fontSize: '0.9375rem', padding: '0.375rem 0.5rem',
          border: 'none', background: 'none', cursor: 'pointer',
          color: active === t.value ? 'var(--color-primary)' : 'var(--color-text-muted)',
          borderBottom: active === t.value ? '2px solid var(--color-primary)' : '2px solid transparent',
          marginBottom: -2,
        }}>{t.label}</button>
      ))}
    </div>
  )
}

function TimeSegment({ value, onChange }: { value: TimeTab; onChange: (v: TimeTab) => void }) {
  return (
    <div style={{ display: 'flex', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', overflow: 'hidden', flexShrink: 0 }}>
      {(['upcoming', 'past'] as TimeTab[]).map((t, i) => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: '0.25rem 0.75rem', fontSize: '0.8125rem', fontWeight: 500,
          border: 'none', borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none',
          cursor: 'pointer',
          background: value === t ? 'var(--color-primary)' : 'transparent',
          color: value === t ? '#fff' : 'var(--color-text-muted)',
          transition: 'background 0.15s, color 0.15s',
        }}>
          {t === 'upcoming' ? 'Майбутні' : 'Минулі'}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      padding: '0.875rem 0.5rem 0.25rem',
    }}>
      {label}
    </div>
  )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginTop: '0.75rem', justifyContent: 'center' }}>
      <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.6rem' }} disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button key={p} onClick={() => onChange(p)} style={{
          fontSize: '0.8125rem', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius)',
          border: '1px solid var(--color-border)',
          background: p === page ? 'var(--color-primary)' : 'white',
          color: p === page ? 'white' : 'inherit', cursor: 'pointer',
        }}>{p}</button>
      ))}
      <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.6rem' }} disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  )
}

function PanelShell({ createHref, createLabel, timeValue, onTimeChange, filters, isLoading, isEmpty, page, totalPages, onPageChange, children }: {
  createHref: string
  createLabel: string
  timeValue: TimeTab
  onTimeChange: (v: TimeTab) => void
  filters?: ReactNode
  isLoading: boolean
  isEmpty: boolean
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  children: ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link to={createHref} className="hide-mobile">
          <button className="btn-primary" style={{ fontSize: '0.8125rem' }}>{createLabel}</button>
        </Link>
        <TimeSegment value={timeValue} onChange={onTimeChange} />
        {filters && <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>{filters}</div>}
      </div>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}
      {!isLoading && isEmpty && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>Немає планів</p>}

      {children}

      <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
    </div>
  )
}

function HoverLink({ to, today, compact, children }: { to: string; today?: boolean; compact?: boolean; children: ReactNode }) {
  const defaultBackground = today ? 'var(--color-today-bg)' : 'transparent'
  const hoverBackground = today ? 'var(--color-today-bg-hover)' : 'var(--mantine-color-gray-0)'

  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: compact ? '0.625rem 0.5rem' : '0.75rem 0.5rem',
        borderBottom: '1px solid var(--color-border)',
        textDecoration: 'none',
        color: 'var(--color-text)',
        background: defaultBackground,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBackground }}
      onMouseLeave={(e) => { e.currentTarget.style.background = defaultBackground }}
    >
      {children}
    </Link>
  )
}

function GroupPlanRow({ plan, todayStr }: { plan: GroupPlan; todayStr: string }) {
  const isToday = plan.date.split('T')[0] === todayStr

  return (
    <HoverLink to={`/trainer/feedback/${plan.id}`} today={isToday} compact>
      <span style={{ width: 68, flexShrink: 0, fontSize: '0.8125rem', color: isToday ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: isToday ? 600 : 400 }}>
        {formatDate(plan.date)}
      </span>
      <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {plan.title ?? 'Групове тренування'}
        {plan.team?.name && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: '0.375rem' }}>— {plan.team.name}</span>}
      </span>
      {plan.exerciseGroups.length > 0 && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{plan.exerciseGroups.length} гр.</span>
      )}
    </HoverLink>
  )
}

function IndividualPlanRow({ plan }: { plan: IndividualPlan }) {
  const { totalDays, completedDays, daysWithFeedback } = getFeedbackSummary(plan)

  return (
    <HoverLink to={`/trainer/plans/individual/${plan.id}/edit`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.125rem' }}>{plan.athlete.name}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{formatWeekRange(plan.weekStart)}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {daysWithFeedback > 0 ? (
          <>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: completedDays > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {completedDays}/{totalDays} дн.
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>відгуків {daysWithFeedback}</div>
          </>
        ) : (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{totalDays} дн.</span>
        )}
      </div>
    </HoverLink>
  )
}

function GroupPlansPanel() {
  const [timeTab, setTimeTab] = useTimeTab('gtime')
  const [month, setMonth] = useState('')
  const [page, setPage] = useState(1)
  const dateContext = useMemo(() => createDateContext(), [])
  const monthOptions = useMemo(() => buildMonthOptions(), [])

  const setTimeReset = (t: TimeTab) => {
    setTimeTab(t)
    setPage(1)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['trainer-group-plans', timeTab, month, page],
    queryFn: () => api.get('/plans', { params: { tab: timeTab, ...(month && { month }), groupPage: page, limit: LIMIT } }).then((r) => r.data),
  })

  const plans: GroupPlan[] = data?.groupPlans?.data ?? []
  const totalPages: number = data?.groupPlans?.totalPages ?? 1

  const grouped = timeTab === 'upcoming'
    ? groupBySection(plans, (p) => getUpcomingSection(p.date, dateContext), UPCOMING_ORDER)
    : groupBySection(plans, (p) => getPastSection(p.date))

  return (
    <PanelShell
      createHref="/trainer/plans/new" createLabel="+ Груповий план"
      timeValue={timeTab} onTimeChange={setTimeReset}
      isLoading={isLoading} isEmpty={plans.length === 0}
      page={page} totalPages={totalPages} onPageChange={setPage}
      filters={<>
        <select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }} style={SELECT_STYLE}>
          <option value="">Місяць</option>
          {monthOptions.map((o) => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
        {month && (
          <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }} onClick={() => { setMonth(''); setPage(1) }}>✕</button>
        )}
      </>}
    >
      {grouped.map(({ section, items }) => (
        <div key={section}>
          <SectionHeader label={section} />
          {items.map((plan) => {
            return <GroupPlanRow key={plan.id} plan={plan} todayStr={dateContext.todayStr} />
          })}
        </div>
      ))}
    </PanelShell>
  )
}

function IndividualPlansPanel() {
  const [timeTab, setTimeTab] = useTimeTab('itime')
  const [athleteId, setAthleteId] = useState('')
  const [page, setPage] = useState(1)
  const dateContext = useMemo(() => createDateContext(), [])

  const { data: allAthletes } = useQuery<AthleteOption[]>({ queryKey: ['all-athletes'], queryFn: () => api.get('/teams/athletes').then((r) => r.data) })

  const { data, isLoading } = useQuery({
    queryKey: ['trainer-ind-plans', timeTab, athleteId, page],
    queryFn: () => api.get('/plans', { params: { tab: timeTab, ...(athleteId && { athleteId }), indPage: page, limit: LIMIT } }).then((r) => r.data),
  })

  const plans: IndividualPlan[] = data?.individualPlans?.data ?? []
  const totalPages: number = data?.individualPlans?.totalPages ?? 1

  const grouped = timeTab === 'upcoming'
    ? groupBySection(plans, (p) => getUpcomingIndSection(p.weekStart, dateContext), IND_UPCOMING_ORDER)
    : groupBySection(plans, (p) => getPastSection(p.weekStart))

  return (
    <PanelShell
      createHref="/trainer/plans/new/individual" createLabel="+ Індивідуальний план"
      timeValue={timeTab}
      onTimeChange={(v) => { setTimeTab(v); setPage(1) }}
      isLoading={isLoading} isEmpty={plans.length === 0}
      page={page} totalPages={totalPages} onPageChange={setPage}
      filters={
        <select value={athleteId} onChange={(e) => { setAthleteId(e.target.value); setPage(1) }} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
          <option value="">Всі спортсмени</option>
          {(allAthletes ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      }
    >
      {grouped.map(({ section, items }) => (
        <div key={section}>
          <SectionHeader label={section} />
          {items.map((plan) => <IndividualPlanRow key={plan.id} plan={plan} />)}
        </div>
      ))}
    </PanelShell>
  )
}

export function TrainerDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mainTab = readMainTab(searchParams.get('tab'))
  const navigate = useNavigate()
  const [showInfo, setShowInfo] = useState(false)

  const setMainTab = (tab: MainTab) => setSearchParams({ tab }, { replace: true })
  const fabHref = mainTab === 'group' ? '/trainer/plans/new' : '/trainer/plans/new/individual'

  return (
    <div className="page">
        <div className="card" style={{ marginBottom: 16, padding: '0.75rem 1rem' }}>
          <button
            type="button"
            onClick={() => setShowInfo((value) => !value)}
            aria-expanded={showInfo}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--color-text)',
            }}
          >
            <strong style={{ display: 'block', fontSize: 16 }}>
              Про плани
            </strong>
            <span style={{ fontSize: 20, lineHeight: 1, color: 'var(--color-text-muted)' }}>
              {showInfo ? '−' : '+'}
            </span>
          </button>

          {showInfo && (
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                Тут ви плануєте тренування для спортсменів. Якщо тренування потрібно виконати по кроках на годиннику, підготуйте його через <Link to="/templates">Шаблони</Link>. Часті тренування можна зберігати там само як шаблони.
              </p>
            </div>
          )}
        </div>

      <TabBar
        tabs={[{ value: 'group', label: 'Групові плани' }, { value: 'individual', label: 'Індивідуальні плани' }]}
        active={mainTab}
        onChange={(v) => setMainTab(v as MainTab)}
      />
      {mainTab === 'group' ? <GroupPlansPanel /> : <IndividualPlansPanel />}

      <ActionIcon className="fab" size={52} radius="xl" variant="filled" color="blue" onClick={() => navigate(fabHref)} aria-label="Додати план">
        <IconPlus size={24} />
      </ActionIcon>
    </div>
  )
}
