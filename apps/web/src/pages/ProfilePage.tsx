import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { usePWAInstall } from '../hooks/usePWAInstall'
import stravaMarkOrange from '../assets/strava/strava-mark-orange.svg'

declare const __APP_VERSION__: string

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

interface Me {
  id: string
  email: string
  name: string
  role: string
  inviteCode: string | null
  trainerName: string | null
  hasPassword: boolean
  googleLinked: boolean
  stravaLinked: boolean
}

export default function ProfilePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const { canInstall, install } = usePWAInstall()

  const { data: me, isLoading } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
  })

  const flash = (ok: string) => { setMsg(ok); setErr(''); setTimeout(() => setMsg(''), 3000) }
  const flashErr = (e: unknown) => {
    const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Помилка'
    setErr(m); setMsg('')
  }

  const regenCode = useMutation({
    mutationFn: () => api.post('/auth/invite-code/regenerate'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    onError: flashErr,
  })

  const linkGoogle = useMutation({
    mutationFn: (credential: string) => api.post('/auth/google/link', { credential }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me'] }); flash('Google підключено') },
    onError: flashErr,
  })
  const linkGoogleMutateRef = useRef(linkGoogle.mutate)
  useEffect(() => { linkGoogleMutateRef.current = linkGoogle.mutate })

  const unlinkGoogle = useMutation({
    mutationFn: () => api.delete('/auth/google/link'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me'] }); flash('Google від\'язано') },
    onError: flashErr,
  })

  const linkStrava = useMutation({
    mutationFn: () => api.get('/strava/auth-url').then((r) => { window.location.href = r.data.url }),
    onError: flashErr,
  })

  const unlinkStrava = useMutation({
    mutationFn: () => api.delete('/strava/disconnect'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me'] }); flash('Strava від\'язано') },
    onError: flashErr,
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current || me?.googleLinked) return

    const render = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: { credential: string }) => linkGoogleMutateRef.current(resp.credential),
      })
      window.google?.accounts.id.renderButton(googleBtnRef.current!, {
        theme: 'outline', size: 'medium', text: 'signin_with', locale: 'uk',
        width: googleBtnRef.current!.offsetWidth || 200,
      })
    }

    if (window.google?.accounts) { render(); return }

    const existing = document.getElementById('gsi-script')
    if (existing) { existing.addEventListener('load', render); return }

    const script = document.createElement('script')
    script.id = 'gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = render
    document.head.appendChild(script)
  }, [me?.googleLinked])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    if (pwForm.newPassword.length < 8) { setPwError('Мінімум 8 символів'); return }
    try {
      await api.put('/auth/password', pwForm)
      setPwSuccess(true)
      setPwForm({ currentPassword: '', newPassword: '' })
      setTimeout(() => setPwSuccess(false), 3000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setPwError(msg ?? 'Помилка')
    }
  }

  const handleLogout = async () => {
    await api.post('/auth/logout').catch(() => {})
    logout()
    navigate('/login')
  }

  if (isLoading) return <p className="page-loading">Завантаження...</p>
  if (!me) return null

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <h2>Профіль</h2>

      {/* User info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{me.name}</p>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 14 }}>{me.email}</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
          Роль: {me.role}
        </p>
      </div>

      {msg && <p style={{ color: 'green', marginBottom: 12 }}>{msg}</p>}
      {err && <p className="error" style={{ marginBottom: 12 }}>{err}</p>}

      {/* Trainer invite code */}
      {(me.role === 'TRAINER' || me.role === 'ADMIN') && me.inviteCode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Код для спортсменів</h3>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-muted)' }}>
            Поділіться цим кодом — спортсмени вводять його при реєстрації і автоматично стають вашими.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.15em',
              padding: '8px 16px', background: 'var(--mantine-color-blue-0)',
              color: 'var(--color-primary)', borderRadius: 8, flex: 1, textAlign: 'center',
            }}>
              {me.inviteCode}
            </code>
            <button
              className="btn-secondary"
              onClick={() => navigator.clipboard.writeText(me.inviteCode ?? '').then(() => flash('Скопійовано')).catch(() => flashErr('Не вдалось скопіювати'))}
            >
              Копіювати
            </button>
            <button
              className="btn-secondary"
              onClick={() => { if (confirm('Згенерувати новий код? Старий більше не працюватиме.')) regenCode.mutate() }}
              disabled={regenCode.isPending}
              title="Згенерувати новий код"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Athlete trainer info */}
      {me.role === 'ATHLETE' && me.trainerName && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Тренер: <strong>{me.trainerName}</strong>
          </p>
        </div>
      )}

      {/* Auth methods */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Способи входу</h3>

        {/* Google */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span style={{ fontSize: 14 }}>Google</span>
          </div>
          {me.googleLinked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'green' }}>✓ Підключено</span>
              {me.hasPassword && (
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => unlinkGoogle.mutate()} disabled={unlinkGoogle.isPending}>
                  Від'язати
                </button>
              )}
            </div>
          ) : (
            <div ref={googleBtnRef} />
          )}
        </div>

        {/* Strava */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={stravaMarkOrange} alt="Strava" style={{ height: 20, width: 'auto' }} />
            <span style={{ fontSize: 14 }}>Strava</span>
          </div>
          {me.stravaLinked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'green' }}>✓ Підключено</span>
              {(me.hasPassword || me.googleLinked) && (
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => unlinkStrava.mutate()} disabled={unlinkStrava.isPending}>
                  Від'язати
                </button>
              )}
            </div>
          ) : (
            <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => linkStrava.mutate()} disabled={linkStrava.isPending}>
              Підключити Strava
            </button>
          )}
        </div>
      </div>

      {/* Change password */}
      {me.hasPassword && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Змінити пароль</h3>
          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label>Поточний пароль</label>
              <input
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label>Новий пароль</label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => { setPwForm((f) => ({ ...f, newPassword: e.target.value })); setPwError('') }}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Мінімум 8 символів"
              />
            </div>
            {pwError && <p className="error" style={{ marginBottom: 8 }}>{pwError}</p>}
            {pwSuccess && <p style={{ color: 'green', marginBottom: 8 }}>Пароль змінено ✓</p>}
            <button className="btn-primary" type="submit" style={{ width: '100%' }}>
              Зберегти
            </button>
          </form>
        </div>
      )}

      {/* Integrations */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Інтеграції</h3>
        <a
          href="/strava/connect"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'var(--color-strava)', fontSize: 14 }}
        >
          <img src={stravaMarkOrange} alt="Strava" style={{ height: 18, width: 'auto' }} />
          Strava — налаштування
        </a>
        <a
          href="/intervals"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: '#e8420a', fontSize: 14 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8420a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <path d="M2 10h20"/>
          </svg>
          Intervals.icu — налаштування
        </a>
      </div>

      {/* App actions */}
      <div className="card">
        {canInstall && (
          <button
            className="btn-secondary"
            style={{ width: '100%', marginBottom: 10 }}
            onClick={install}
          >
            Встановити додаток
          </button>
        )}
        <button
          className="btn-secondary"
          style={{ width: '100%', color: 'var(--color-error, #e53e3e)', borderColor: 'var(--color-error, #e53e3e)' }}
          onClick={handleLogout}
        >
          Вийти з акаунту
        </button>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          v{__APP_VERSION__}
        </p>
      </div>
    </div>
  )
}
