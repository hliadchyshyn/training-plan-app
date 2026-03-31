import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { getErrorMessage } from '../utils/errors.js'
import stravaMarkWhite from '../assets/strava/strava-mark-white.svg'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GOOGLE_GSI_URL = 'https://accounts.google.com/gsi/client'
let gsiInitialized = false

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(searchParams.get('error') ? 'Помилка входу через OAuth' : '')
  const [loading, setLoading] = useState(false)
  const googleBtnRef = useRef<HTMLDivElement>(null)

  // Initialize Google Identity Services
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return

    const render = () => {
      if (gsiInitialized) return
      gsiInitialized = true
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      })
      window.google?.accounts.id.renderButton(googleBtnRef.current!, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'uk',
      })
    }

    if (window.google?.accounts) { render(); return }

    const existing = document.getElementById('gsi-script')
    if (existing) { existing.addEventListener('load', render); return }

    const script = document.createElement('script')
    script.id = 'gsi-script'
    script.src = GOOGLE_GSI_URL
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [])

  const handleGoogleCredential = async (response: { credential: string }) => {
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/google', { credential: response.credential })
      setAuth(data.accessToken, data.user)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Помилка входу через Google'))
    } finally {
      setLoading(false)
    }
  }

  const handleStravaLogin = async () => {
    setError('')
    try {
      const { data } = await api.get('/strava/login-url')
      window.location.href = data.url
    } catch {
      setError('Не вдалось отримати посилання Strava')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.accessToken, data.user)
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err, 'Невірний email або пароль'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Splitly</h1>

        {/* OAuth buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {GOOGLE_CLIENT_ID && (
            <div ref={googleBtnRef} style={{ width: '100%' }} />
          )}
          <button
            type="button"
            onClick={handleStravaLogin}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', padding: '10px 16px', borderRadius: 6, border: 'none',
              background: '#FC4C02', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            <img src={stravaMarkWhite} alt="" style={{ height: 20, width: 'auto' }} />
            Увійти через Strava
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>або через email</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Вхід...' : 'Увійти'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>
          Немає акаунту? <Link to="/register">Зареєструватись</Link>
        </p>
      </div>
    </div>
  )
}

// Extend window for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void
          renderButton: (el: HTMLElement, config: object) => void
          prompt: () => void
        }
      }
    }
  }
}
