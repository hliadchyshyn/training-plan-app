import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../api/client'

export default function StravaLoginCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const token = params.get('token')
    const error = params.get('error')

    if (error || !token) {
      navigate('/login?error=strava_failed')
      return
    }

    // Store token and fetch user profile
    api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setAuth(token, res.data)
        navigate('/')
      })
      .catch(() => navigate('/login?error=strava_failed'))
  }, [params, navigate, setAuth])

  return <p style={{ padding: 32, textAlign: 'center' }}>Вхід через Strava...</p>
}
