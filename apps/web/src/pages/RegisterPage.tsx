import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { getErrorMessage } from '../utils/errors.js'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [role, setRole] = useState<'ATHLETE' | 'TRAINER'>('ATHLETE')
  const [form, setForm] = useState({ email: '', name: '', password: '', inviteCode: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        email: form.email,
        name: form.name,
        password: form.password,
        role,
        inviteCode: role === 'ATHLETE' && form.inviteCode ? form.inviteCode : undefined,
      })
      setAuth(data.accessToken, data.user)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Помилка реєстрації'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Реєстрація</h1>

        {/* Role selector */}
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

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Ім'я</label>
            <input name="name" value={form.name} onChange={handleChange} required minLength={2} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} required minLength={8} autoComplete="new-password" />
          </div>
          {role === 'ATHLETE' && (
            <div className="form-group">
              <label>Код тренера <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необов'язково)</span></label>
              <input
                name="inviteCode"
                value={form.inviteCode}
                onChange={handleChange}
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
            {loading ? 'Реєстрація...' : 'Зареєструватись'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>
          Вже є акаунт? <Link to="/login">Увійти</Link>
        </p>
      </div>
    </div>
  )
}
