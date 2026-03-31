import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../api/client'

export default function StravaLoginCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const code = params.get('code')
    const token = params.get('token')
    const error = params.get('error')

    if (error) {
      navigate('/login?error=strava_failed')
      return
    }

    if (token) {
      // Legacy flow: token passed directly
      api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          setAuth(token, res.data)
          navigate('/')
        })
        .catch(() => navigate('/login?error=strava_failed'))
      return
    }

    if (code) {
      // New flow: exchange code for token via API
      api.post('/strava/login-exchange', { code })
        .then((res) => {
          setAuth(res.data.accessToken, res.data.user)
          navigate(res.data.isNewUser ? '/onboarding' : '/')
        })
        .catch(() => navigate('/login?error=strava_failed'))
      return
    }

    navigate('/login?error=strava_failed')
  }, [params, navigate, setAuth])

  return <p style={{ padding: 32, textAlign: 'center' }}>Вхід через Strava...</p>
}
