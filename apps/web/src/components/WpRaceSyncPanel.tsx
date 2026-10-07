import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'
import { getErrorMessage } from '../utils/errors.js'

interface UnmatchedEmail {
  email: string
  registrations: number
  results: number
}

interface ReconcileResult {
  pages: number
  applied: number
  rejected: number
  deletedRegistrations: number
  deletedResults: number
}

/** Admin: sync state with tsclub.com.ua — people who didn't match by email + manual full reconcile. */
export function WpRaceSyncPanel() {
  const qc = useQueryClient()
  const { data: unmatched = [], isLoading } = useQuery<UnmatchedEmail[]>({
    queryKey: ['races-unmatched'],
    queryFn: () => api.get('/races/unmatched').then((r) => r.data),
  })

  const reconcile = useMutation({
    mutationFn: () => api.post('/integrations/wp/reconcile', { full: true }).then((r) => r.data.data as ReconcileResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['races-unmatched'] })
      qc.invalidateQueries({ queryKey: ['races'] })
    },
  })

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <strong>Старти з tsclub.com.ua</strong>
        <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.75rem' }} disabled={reconcile.isPending} onClick={() => reconcile.mutate()}>
          {reconcile.isPending ? 'Звіряю…' : 'Повна звірка з WP'}
        </button>
      </div>

      {reconcile.isSuccess && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-success)', marginBottom: '0.5rem' }}>
          Готово: оновлено {reconcile.data.applied}, видалено {reconcile.data.deletedRegistrations + reconcile.data.deletedResults}
          {reconcile.data.rejected > 0 && `, пропущено некоректних ${reconcile.data.rejected}`}.
        </p>
      )}
      {reconcile.isError && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', marginBottom: '0.5rem' }}>
          {getErrorMessage(reconcile.error, 'Звірка не вдалася')}
        </p>
      )}

      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        Email з tsclub.com.ua, для яких немає акаунта тут. Їхні старти з'являться автоматично, щойно людина зареєструється з тим самим email.
      </p>
      {isLoading ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Завантаження...</p>
      ) : unmatched.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-success)' }}>Усі зіставлені ✓</p>
      ) : (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.875rem' }}>Незіставлені: {unmatched.length}</summary>
          <div style={{ marginTop: '0.5rem', maxHeight: 260, overflowY: 'auto' }}>
            {unmatched.map((u) => (
              <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
                <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>анонсів {u.registrations} · результатів {u.results}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
