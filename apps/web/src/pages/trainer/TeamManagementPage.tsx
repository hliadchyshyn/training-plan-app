import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.js'

interface Athlete {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
}

export function TeamManagementPage() {
  const qc = useQueryClient()

  const { data: athletes = [], isLoading } = useQuery<Athlete[]>({
    queryKey: ['my-athletes'],
    queryFn: () => api.get('/teams/athletes').then((r) => r.data),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/teams/athletes/${id}/active`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-athletes'] }),
  })

  const removeAthlete = useMutation({
    mutationFn: (id: string) => api.delete(`/teams/athletes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-athletes'] }),
  })

  return (
    <div className="page">
      <h2 style={{ marginBottom: '1.25rem' }}>Мої спортсмени</h2>

      {isLoading ? (
        <p className="page-loading">Завантаження...</p>
      ) : athletes.length === 0 ? (
        <div className="card page-empty">
          <p style={{ color: 'var(--color-text-muted)' }}>Поки що немає спортсменів.</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
            Поділіться своїм кодом зі спортсменами — вони вкажуть його при реєстрації.
            Код знаходиться у розділі <strong>Профіль</strong>.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {athletes.map((athlete) => (
            <div key={athlete.id} className="card" style={{ padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem' }}>{athlete.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {athlete.email}
                  </p>
                </div>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', flexShrink: 0 }}
                  onClick={() => { if (confirm(`Видалити ${athlete.name} зі списку?`)) removeAthlete.mutate(athlete.id) }}
                  title="Видалити"
                >
                  ✕
                </button>
              </div>

              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '0.8125rem', fontWeight: 600,
                  padding: '3px 10px', borderRadius: 9999,
                  color: athlete.isActive ? '#16a34a' : '#dc2626',
                  background: athlete.isActive ? '#dcfce7' : '#fee2e2',
                }}>
                  {athlete.isActive ? 'Активний' : 'Заблокований'}
                </span>
                <button
                  className={athlete.isActive ? 'btn-secondary' : 'btn-primary'}
                  style={{ padding: '4px 14px', fontSize: 13 }}
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate({ id: athlete.id, isActive: !athlete.isActive })}
                >
                  {athlete.isActive ? 'Заблокувати' : 'Відновити'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
