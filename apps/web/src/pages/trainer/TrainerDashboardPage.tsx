import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client.js'
import { formatDate, formatWeekRange } from '../../utils/date.js'

const LIMIT = 20

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginTop: '0.75rem' }}>
      <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.6rem' }} disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            fontSize: '0.8125rem', padding: '0.25rem 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)',
            background: p === page ? 'var(--color-primary)' : 'white',
            color: p === page ? 'white' : 'inherit',
            cursor: 'pointer',
          }}
        >{p}</button>
      ))}
      <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.6rem' }} disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  )
}

export function TrainerDashboardPage() {
  const today = new Date().toISOString().split('T')[0]

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [month, setMonth] = useState('')
  const [teamId, setTeamId] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [groupPage, setGroupPage] = useState(1)
  const [indPage, setIndPage] = useState(1)

  // Reset pages when filters change
  const setTabReset = (t: 'upcoming' | 'past') => { setTab(t); setGroupPage(1); setIndPage(1) }
  const setMonthReset = (m: string) => { setMonth(m); setGroupPage(1); setIndPage(1) }
  const setTeamReset = (id: string) => { setTeamId(id); setGroupPage(1) }
  const setAthleteReset = (id: string) => { setAthleteId(id); setIndPage(1) }

  // Today's plans (dashboard header)
  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ['trainer-today', today],
    queryFn: () => api.get('/plans', { params: { date: today } }).then((r) => r.data),
  })

  // Paginated plans
  const params = { tab, ...(month ? { month } : {}), ...(teamId ? { teamId } : {}), ...(athleteId ? { athleteId } : {}), groupPage, indPage, limit: LIMIT }
  const { data, isLoading } = useQuery({
    queryKey: ['trainer-plans', tab, month, teamId, athleteId, groupPage, indPage],
    queryFn: () => api.get('/plans', { params }).then((r) => r.data),
  })

  // Teams for filter
  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
  })

  // Athletes for filter (from all teams)
  const { data: allAthletes } = useQuery({
    queryKey: ['all-athletes'],
    queryFn: () => api.get('/teams/athletes').then((r) => r.data),
  })

  const todayPlans = (todayData?.groupPlans ?? []).filter(
    (p: { date: string }) => p.date.split('T')[0] === today,
  )

  const groupPlans = data?.groupPlans?.data ?? []
  const groupTotal = data?.groupPlans?.total ?? 0
  const groupTotalPages = data?.groupPlans?.totalPages ?? 1
  const indPlans = data?.individualPlans?.data ?? []
  const indTotal = data?.individualPlans?.total ?? 0
  const indTotalPages = data?.individualPlans?.totalPages ?? 1

  // Generate month options (current month ± 12)
  const monthOptions = Array.from({ length: 13 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 6 + i)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
    return { val, label }
  })

  return (
    <div className="page">
      <div style={{
        marginBottom: '1.25rem', textAlign: 'center',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--color-bg)',
        padding: '0.75rem 0',
        marginLeft: '-0.75rem', marginRight: '-0.75rem', paddingLeft: '0.75rem', paddingRight: '0.75rem',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem' }}>Панель тренера</h2>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <Link to="/trainer/plans/new"><button className="btn-primary" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>+ Груповий план</button></Link>
          <Link to="/trainer/plans/new/individual"><button className="btn-secondary" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>+ Індивідуальний</button></Link>
        </div>
      </div>

      {/* Today's section */}
      <h3 style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9375rem', color: 'var(--color-text-muted)' }}>Сьогодні ({today})</h3>
      {todayLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}
      {!todayLoading && todayPlans.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Немає тренувань на сьогодні.{' '}
          <Link to="/trainer/plans/new">Створити план</Link>
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {todayPlans.map((plan: { id: string; title: string | null; team: { name: string } | null; exerciseGroups: Array<{ id: string; name: string }> }) => (
          <Link key={plan.id} to={`/trainer/feedback/${plan.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'var(--color-text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--color-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--color-border)' }}
          >
            <div style={{ fontWeight: 600 }}>{plan.title ?? 'Групове тренування'}</div>
            {plan.team && <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{plan.team.name}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {plan.exerciseGroups.map((g) => (
                <span key={g.id} style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1e40af', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}>{g.name}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '2px solid var(--color-border)', paddingBottom: '0.5rem', justifyContent: 'center' }}>
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTabReset(t)}
            style={{
              fontWeight: 600, fontSize: '0.9375rem', padding: '0.25rem 0.75rem',
              border: 'none', background: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'upcoming' ? 'Майбутні' : 'Минулі'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select value={month} onChange={(e) => setMonthReset(e.target.value)} style={{ flex: '1 1 140px', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
            <option value="">Всі місяці</option>
            {monthOptions.map((o) => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
          <select value={teamId} onChange={(e) => setTeamReset(e.target.value)} style={{ flex: '1 1 140px', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
            <option value="">Всі команди</option>
            {(teams ?? []).map((t: { id: string; name: string }) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={athleteId} onChange={(e) => setAthleteReset(e.target.value)} style={{ flex: '1 1 140px', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
            <option value="">Всі спортсмени</option>
            {(allAthletes ?? []).map((a: { id: string; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {(month || teamId || athleteId) && (
          <button className="btn-secondary" style={{ fontSize: '0.8125rem', alignSelf: 'flex-start' }} onClick={() => { setMonthReset(''); setTeamReset(''); setAthleteReset('') }}>
            Скинути фільтри
          </button>
        )}
      </div>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      {/* Group plans */}
      <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        Групові плани
        {groupTotal > 0 && <span style={{ fontWeight: 400, fontSize: '0.875rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>({groupTotal})</span>}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {!isLoading && groupPlans.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Немає планів.</p>}
        {groupPlans.map((plan: { id: string; date: string; title: string | null; team: { name: string } | null }) => (
          <Link key={plan.id} to={`/trainer/feedback/${plan.id}`} style={{
            display: 'block', padding: '0.5rem 0.25rem', borderBottom: '1px solid var(--color-border)',
            fontSize: '0.875rem', color: 'var(--color-text)', textDecoration: 'none',
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text)' }}
          >
            <strong style={{ marginRight: '0.375rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{formatDate(plan.date)}</strong>
            {plan.title ?? 'Груповий план'}{plan.team?.name ? ` — ${plan.team.name}` : ''}
          </Link>
        ))}
      </div>
      <Pagination page={groupPage} totalPages={groupTotalPages} onChange={setGroupPage} />

      {/* Individual plans */}
      <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', marginTop: '2rem' }}>
        Індивідуальні плани
        {indTotal > 0 && <span style={{ fontWeight: 400, fontSize: '0.875rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>({indTotal})</span>}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {!isLoading && indPlans.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Немає індивідуальних планів.</p>}
        {indPlans.map((plan: { id: string; weekStart: string; athlete: { name: string }; days: Array<{ dayOfWeek: number }> }) => (
          <Link key={plan.id} to={`/trainer/plans/individual/${plan.id}/edit`} style={{
            display: 'block', padding: '0.5rem 0.25rem', borderBottom: '1px solid var(--color-border)',
            fontSize: '0.875rem', color: 'var(--color-text)', textDecoration: 'none',
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text)' }}
          >
            <strong style={{ marginRight: '0.375rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{formatWeekRange(plan.weekStart)}</strong>
            {plan.athlete.name}
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginLeft: '0.375rem' }}>{plan.days.length} дн.</span>
          </Link>
        ))}
      </div>
      <Pagination page={indPage} totalPages={indTotalPages} onChange={setIndPage} />
    </div>
  )
}
