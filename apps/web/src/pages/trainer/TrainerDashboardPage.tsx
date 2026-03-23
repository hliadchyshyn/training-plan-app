import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client.js'

export function TrainerDashboardPage() {
  const today = new Date().toISOString().split('T')[0]

  const { data, isLoading } = useQuery({
    queryKey: ['trainer-plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  })

  const todayPlans = (data?.groupPlans ?? []).filter(
    (p: { date: string }) => p.date.split('T')[0] === today,
  )

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>Панель тренера</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to="/trainer/plans/new">
            <button className="btn-primary">+ Груповий план</button>
          </Link>
          <Link to="/trainer/plans/new/individual">
            <button className="btn-secondary">+ Індивідуальний</button>
          </Link>
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Сьогодні ({today})</h3>
      {!isLoading && todayPlans.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Немає тренувань на сьогодні.{' '}
          <Link to="/trainer/plans/new">Створити план</Link>
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {todayPlans.map((plan: {
          id: string
          title: string | null
          team: { name: string } | null
          exerciseGroups: Array<{ id: string; name: string }>
        }) => (
          <div key={plan.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{plan.title ?? 'Групове тренування'}</div>
                {plan.team && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    {plan.team.name}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  {plan.exerciseGroups.map((g) => (
                    <span
                      key={g.id}
                      style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1e40af', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
              <Link to={`/trainer/feedback/${plan.id}`}>
                <button className="btn-secondary" style={{ fontSize: '0.8125rem' }}>Відгуки</button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Всі плани</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
        {(data?.groupPlans ?? []).map((plan: {
          id: string
          date: string
          title: string | null
          team: { name: string } | null
        }) => (
          <div key={plan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>
              <strong style={{ marginRight: '0.5rem' }}>{plan.date.split('T')[0]}</strong>
              {plan.title ?? 'Груповий план'} — {plan.team?.name}
            </span>
            <Link to={`/trainer/feedback/${plan.id}`}>
              <button className="btn-secondary" style={{ fontSize: '0.8125rem' }}>Відгуки</button>
            </Link>
          </div>
        ))}
      </div>

      <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Індивідуальні плани</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(data?.individualPlans ?? []).length === 0 && (
          <p style={{ color: 'var(--color-text-muted)' }}>Немає індивідуальних планів.</p>
        )}
        {(data?.individualPlans ?? []).map((plan: {
          id: string
          weekStart: string
          athlete: { name: string }
          days: Array<{ dayOfWeek: number }>
        }) => (
          <div key={plan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>
              <strong style={{ marginRight: '0.5rem' }}>{plan.weekStart.slice(0, 10)}</strong>
              {plan.athlete.name}
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginLeft: '0.5rem' }}>
                {plan.days.length} дн.
              </span>
            </span>
            <Link to={`/trainer/plans/individual/${plan.id}/edit`}>
              <button className="btn-secondary" style={{ fontSize: '0.8125rem' }}>Редагувати</button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
