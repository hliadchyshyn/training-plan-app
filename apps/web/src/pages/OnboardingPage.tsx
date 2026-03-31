import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { getErrorMessage } from '../utils/errors'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [role, setRole] = useState<'ATHLETE' | 'TRAINER'>('ATHLETE')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/onboarding', {
        role,
        inviteCode: role === 'ATHLETE' && inviteCode ? inviteCode.toUpperCase() : undefined,
      })
      setAuth(data.accessToken, data.user)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Помилка'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Майже готово!</h1>
        <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          Оберіть свою роль щоб продовжити
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.25rem' }}>
            {(['ATHLETE', 'TRAINER'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                style={{
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: `2px solid ${role === r ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: role === r ? 'var(--mantine-color-blue-0)' : 'transparent',
                  color: role === r ? 'var(--color-primary)' : 'var(--color-text)',
                  fontWeight: role === r ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {r === 'ATHLETE' ? '🏃 Спортсмен' : '📋 Тренер'}
              </button>
            ))}
          </div>

          {role === 'ATHLETE' && (
            <div className="form-group">
              <label>Код тренера <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необов'язково)</span></label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="напр. ABC123"
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                Отримайте код у свого тренера в розділі Профіль
              </p>
            </div>
          )}

          {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

          <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Збереження...' : 'Продовжити'}
          </button>
        </form>
      </div>
    </div>
  )
}
