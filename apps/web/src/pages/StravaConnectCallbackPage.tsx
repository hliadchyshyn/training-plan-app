import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'

export default function StravaConnectCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      navigate('/strava/connected?error=access_denied')
      return
    }

    api.post('/strava/link', { code })
      .then(() => navigate('/strava/connected'))
      .catch(() => navigate('/strava/connected?error=token_exchange'))
  }, [params, navigate])

  return <p style={{ padding: 32, textAlign: 'center' }}>Підключення Strava...</p>
}
