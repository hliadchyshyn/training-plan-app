import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { getErrorMessage } from '../utils/errors.js'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ email: '', name: '', password: '' })
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
      const { data } = await api.post('/auth/register', form)
      setAuth(data.accessToken, data.user)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Помилка реєстрації'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Реєстрація</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Ім'я</label>
            <input name="name" value={form.name} onChange={handleChange} required minLength={2} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
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
