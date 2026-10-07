import axios from 'axios'
import { wpBridgeHeaders } from './wpBridgeAuth.js'
import { parseWpRaceSyncPage, type FetchWpRacePage } from './wpRaceSync.js'

export const WP_RACE_SYNC_PATH = '/wp-json/tsclub/v1/race-sync'

export interface WpBridgeConfig {
  baseUrl: string
  secret: string
}

/** Reads WP_BASE_URL + WP_BRIDGE_SECRET; null when the integration isn't configured. */
export function getWpBridgeConfig(env: NodeJS.ProcessEnv = process.env): WpBridgeConfig | null {
  const baseUrl = env.WP_BASE_URL?.trim().replace(/\/+$/, '')
  const secret = env.WP_BRIDGE_SECRET?.trim()
  if (!baseUrl || !secret) return null
  return { baseUrl, secret }
}

export function buildRaceSyncQuery({ updatedSince, page }: { updatedSince?: string; page: number }): string {
  const params = new URLSearchParams()
  if (updatedSince) params.set('updated_since', updatedSince)
  params.set('page', String(page))
  return params.toString()
}

export function createWpRaceFetcher({ baseUrl, secret }: WpBridgeConfig): FetchWpRacePage {
  return async (params) => {
    const query = buildRaceSyncQuery(params)
    const res = await axios.get(`${baseUrl}${WP_RACE_SYNC_PATH}?${query}`, {
      headers: wpBridgeHeaders(secret, query),
      timeout: 15_000,
    })
    return parseWpRaceSyncPage(res.data)
  }
}
