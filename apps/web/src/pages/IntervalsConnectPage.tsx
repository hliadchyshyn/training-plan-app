import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'

interface IntervalsStatus {
  connected: boolean
  athleteId: string | null
  since: string | null
}

export default function IntervalsConnectPage() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [error, setError] = useState('')

  const { data: status, isLoading } = useQuery<IntervalsStatus>({
    queryKey: ['intervals-status'],
    queryFn: () => api.get('/intervals/status').then((r) => r.data),
  })

  const connectMutation = useMutation({
    mutationFn: () => api.post('/intervals/connect', { apiKey: apiKey.trim(), athleteId: athleteId.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intervals-status'] })
      setApiKey('')
      setAthleteId('')
      setError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Помилка підключення')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/intervals/disconnect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['intervals-status'] }),
  })

  if (isLoading) return <p className="page-loading">Завантаження...</p>

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h2>Intervals.icu</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
        Intervals.icu — безкоштовний сервіс аналізу тренувань з підтримкою структурованих
        тренувань для Garmin, Wahoo, Coros та інших. Після підключення ви зможете відправляти
        тренування для годинника прямо в календар Intervals.icu.
      </p>

      {status?.connected ? (
        <div className="card card-success" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>Підключено</strong>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                Athlete ID: <code>{status.athleteId}</code>
              </div>
              {status.since && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  з {new Date(status.since).toLocaleDateString('uk-UA')}
                </div>
              )}
            </div>
            <button
              className="btn-danger"
              onClick={() => { if (confirm('Відключити Intervals.icu?')) disconnectMutation.mutate() }}
              disabled={disconnectMutation.isPending}
            >
              Відключити
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Підключити акаунт</h3>

          <ol style={{ paddingLeft: 20, marginBottom: 16, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            <li>Увійдіть на <strong>intervals.icu</strong></li>
            <li>Перейдіть в <strong>Settings → API Key</strong> (або Developer → API)</li>
            <li>Скопіюйте свій <strong>API Key</strong> та <strong>Athlete ID</strong></li>
          </ol>

          <div className="form-group">
            <label>Athlete ID</label>
            <input
              type="text"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              placeholder="i12345"
            />
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Знайдіть у Settings → General, поле "Athlete ID"
            </div>
          </div>

          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="•••••••••••••••"
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button
            className="btn-primary"
            onClick={() => {
              if (!apiKey.trim() || !athleteId.trim()) return setError('Заповніть всі поля')
              setError('')
              connectMutation.mutate()
            }}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? 'Перевірка...' : 'Підключити'}
          </button>
        </div>
      )}

      <div className="card" style={{ background: 'var(--color-bg-secondary)' }}>
        <strong style={{ fontSize: '0.875rem' }}>Як працює інтеграція</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          <li>Тренування відправляється в календар Intervals.icu на вибрану дату</li>
          <li>Intervals.icu автоматично синхронізує його з Garmin Connect, Wahoo, TrainingPeaks</li>
          <li>Для Coros: тренування з'явиться в календарі Intervals.icu, але пряма синхронізація з Coros через партнерський API (потребує окремого налаштування)</li>
        </ul>
      </div>
    </div>
  )
}
