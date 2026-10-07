import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))

import axios from 'axios'
import { buildRaceSyncQuery, createWpRaceFetcher, getWpBridgeConfig } from '../wpRaceClient.js'
import { verifyWpBridgeSignature } from '../wpBridgeAuth.js'

describe('getWpBridgeConfig', () => {
  it('returns null unless both vars are set', () => {
    expect(getWpBridgeConfig({})).toBeNull()
    expect(getWpBridgeConfig({ WP_BASE_URL: 'https://tsclub.com.ua' })).toBeNull()
    expect(getWpBridgeConfig({ WP_BRIDGE_SECRET: 's' })).toBeNull()
  })

  it('trims trailing slashes', () => {
    expect(getWpBridgeConfig({ WP_BASE_URL: 'https://tsclub.com.ua//', WP_BRIDGE_SECRET: 's' })).toEqual({
      baseUrl: 'https://tsclub.com.ua',
      secret: 's',
    })
  })
})

describe('buildRaceSyncQuery', () => {
  it('omits updated_since when absent', () => {
    expect(buildRaceSyncQuery({ page: 1 })).toBe('page=1')
    expect(buildRaceSyncQuery({ updatedSince: '2026-10-06T09:59:00.000Z', page: 2 })).toBe(
      'updated_since=2026-10-06T09%3A59%3A00.000Z&page=2',
    )
  })
})

describe('createWpRaceFetcher', () => {
  beforeEach(() => vi.mocked(axios.get).mockReset())

  it('sends a signed GET and validates the response', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { registrations: [], results: [], hasMore: false } })

    const page = await createWpRaceFetcher({ baseUrl: 'https://tsclub.com.ua', secret: 'sec' })({ page: 3 })

    expect(page).toEqual({ registrations: [], results: [], hasMore: false, rejected: [] })
    const [url, opts] = vi.mocked(axios.get).mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://tsclub.com.ua/wp-json/tsclub/v1/race-sync?page=3')
    expect(
      verifyWpBridgeSignature({
        secret: 'sec',
        timestamp: opts.headers['X-TSClub-Timestamp'],
        signature: opts.headers['X-TSClub-Signature'],
        payload: 'page=3',
      }),
    ).toBe(true)
  })

  it('rejects a malformed WP response', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { foo: 1 } })
    await expect(createWpRaceFetcher({ baseUrl: 'https://x', secret: 's' })({ page: 1 })).rejects.toThrow()
  })
})
