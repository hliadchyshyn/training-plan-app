import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'

export default function StravaConnectCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [hydrated, setHydrated] = useState(useAuthStore.persist.hasHydrated())

  useEffect(() => {
    if (hydrated) return
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true))
    return unsub
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return

    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      navigate('/strava/connected?error=access_denied')
      return
    }

    api.post('/strava/link', { code })
      .then(() => navigate('/strava/connected'))
      .catch(() => navigate('/strava/connected?error=token_exchange'))
  }, [hydrated, params, navigate])

  return <p style={{ padding: 32, textAlign: 'center' }}>Підключення Strava...</p>
}
