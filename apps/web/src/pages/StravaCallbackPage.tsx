import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

export function StravaCallbackPage() {
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const error = searchParams.get('error')

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['strava-status'] })
    qc.invalidateQueries({ queryKey: ['week'] })
  }, [qc])

  if (error) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem', fontWeight: 600 }}>
          Не вдалося підключити Strava
        </p>
        <Link to="/strava/connect">
          <button className="btn-secondary">Спробувати знову</button>
        </Link>
      </div>
    )
  }

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '3rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.5rem' }}>Strava підключено!</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.9375rem' }}>
        Ваші активності синхронізуються у фоновому режимі
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button className="btn-primary" onClick={() => navigate('/')}>До календаря</button>
        <button className="btn-secondary" onClick={() => navigate('/strava/connect')}>Налаштування Strava</button>
      </div>
    </div>
  )
}
