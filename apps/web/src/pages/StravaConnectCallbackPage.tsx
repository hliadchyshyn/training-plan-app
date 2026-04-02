import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

export default function StravaConnectCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return

    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      navigate('/strava/connected?error=access_denied')
      return
    }

    api.post('/strava/link', { code })
      .then(() => navigate('/strava/connected'))
      .catch(() => navigate('/strava/connected?error=token_exchange'))
  }, [hasHydrated, params, navigate])

  return <p style={{ padding: 32, textAlign: 'center' }}>Підключення Strava...</p>
}
