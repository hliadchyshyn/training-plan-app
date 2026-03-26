import type { PrismaClient, StravaAccount } from '@prisma/client'
import axios from 'axios'

const STRAVA_API = 'https://www.strava.com/api/v3'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

export interface StravaActivityRaw {
  id: number
  name: string
  type: string
  start_date: string
  start_date_local: string
  distance: number
  moving_time: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed?: number
  average_cadence?: number
  total_elevation_gain?: number
  splits_metric?: unknown
}

export async function getValidToken(account: StravaAccount, prisma: PrismaClient): Promise<string> {
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000)
  if (account.tokenExpiresAt > fiveMinFromNow) {
    return account.accessToken
  }

  const resp = await axios.post(STRAVA_TOKEN_URL, {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
  })

  const { access_token, refresh_token, expires_at } = resp.data

  await prisma.stravaAccount.update({
    where: { id: account.id },
    data: {
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt: new Date(expires_at * 1000),
    },
  })

  return access_token as string
}

export async function fetchStravaActivities(token: string, afterUnix: number): Promise<StravaActivityRaw[]> {
  const all: StravaActivityRaw[] = []
  let page = 1
  while (true) {
    const resp = await axios.get<StravaActivityRaw[]>(`${STRAVA_API}/athlete/activities`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { after: afterUnix, per_page: 100, page },
    })
    const batch = resp.data
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < 100) break
    page++
  }
  return all
}

export async function syncActivities(userId: string, prisma: PrismaClient, weeks = 8): Promise<{ upserted: number }> {
  const account = await prisma.stravaAccount.findUnique({ where: { userId } })
  if (!account) return { upserted: 0 }

  const token = await getValidToken(account, prisma)
  const afterDate = new Date()
  afterDate.setDate(afterDate.getDate() - weeks * 7)
  const afterUnix = Math.floor(afterDate.getTime() / 1000)

  const activities = await fetchStravaActivities(token, afterUnix)

  for (const a of activities) {
    await prisma.stravaActivity.upsert({
      where: { stravaId: BigInt(a.id) },
      create: {
        stravaAccountId: account.id,
        athleteId: userId,
        stravaId: BigInt(a.id),
        name: a.name,
        type: a.type,
        startDate: new Date(a.start_date),
        startDateLocal: new Date(a.start_date_local),
        distance: a.distance,
        movingTime: a.moving_time,
        averageHeartrate: a.average_heartrate ?? null,
        maxHeartrate: a.max_heartrate ?? null,
        averageSpeed: a.average_speed ?? null,
        averageCadence: a.average_cadence ?? null,
        totalElevationGain: a.total_elevation_gain ?? null,
        splitsMetric: a.splits_metric ? (a.splits_metric as object) : undefined,
      },
      update: {
        name: a.name,
        averageHeartrate: a.average_heartrate ?? null,
        maxHeartrate: a.max_heartrate ?? null,
        updatedAt: new Date(),
      },
    })
  }

  return { upserted: activities.length }
}
