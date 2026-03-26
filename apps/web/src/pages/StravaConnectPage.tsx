import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'
import { IconStrava } from '../components/IconStrava.js'

interface StravaStatus {
  connected: boolean
  stravaAthleteId?: string
  connectedAt?: string
  lastSync?: string
}

export function StravaConnectPage() {
  const qc = useQueryClient()

  const { data: status, isLoading } = useQuery<StravaStatus>({
    queryKey: ['strava-status'],
    queryFn: () => api.get('/strava/status').then((r) => r.data),
  })

  const sync = useMutation({
    mutationFn: () => api.post('/strava/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strava-status'] }),
  })

  const disconnect = useMutation({
    mutationFn: () => api.delete('/strava/disconnect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strava-status'] }),
  })

  const handleConnect = async () => {
    const { data } = await api.get<{ url: string }>('/strava/auth-url')
    window.location.href = data.url
  }

  return (
    <div className="page">
      <h2 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '1.25rem' }}>Strava</h2>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      {!isLoading && !status?.connected && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 12, background: 'var(--color-strava)' }}>
            <IconStrava size={32} color="white" />
          </div>
          <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
            Підключіть Strava, щоб автоматично синхронізувати тренування
          </p>
          <button
            className="btn-primary"
            onClick={handleConnect}
            style={{ background: 'var(--color-strava)', fontSize: '0.9375rem', padding: '0.625rem 1.5rem' }}
          >
            Підключити Strava
          </button>
        </div>
      )}

      {!isLoading && status?.connected && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-strava)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconStrava size={22} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Strava підключено</div>
              {status.connectedAt && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  З {new Date(status.connectedAt).toLocaleDateString('uk-UA')}
                </div>
              )}
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', background: '#dcfce7', color: '#16a34a', padding: '0.25rem 0.6rem', borderRadius: 9999, fontWeight: 600 }}>
              ✓ Активно
            </span>
          </div>

          {status.lastSync && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Остання синхронізація: {new Date(status.lastSync).toLocaleString('uk-UA')}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              style={{ fontSize: '0.875rem' }}
            >
              {sync.isPending ? 'Синхронізація...' : '🔄 Синхронізувати'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              style={{ fontSize: '0.875rem', color: 'var(--color-danger)' }}
            >
              Відключити
            </button>
          </div>

          {sync.isSuccess && (
            <p style={{ fontSize: '0.8125rem', color: '#16a34a', marginTop: '0.75rem' }}>
              ✓ Синхронізацію завершено
            </p>
          )}
        </div>
      )}
    </div>
  )
}
