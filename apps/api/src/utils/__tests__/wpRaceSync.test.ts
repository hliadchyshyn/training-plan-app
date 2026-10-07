import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyWpRaceEvents,
  parseWpRaceEvents,
  parseWpRaceSyncPage,
  reconcileWpRaces,
  wpRaceEventsBodySchema,
  type FetchWpRacePage,
  type WpRaceSyncPage,
} from '../wpRaceSync.js'

const rawRegistration = {
  id: 123,
  userId: 45,
  email: '  Ivan@Example.COM ',
  userName: 'Іван Петренко',
  anonsEventId: 77,
  eventTitle: 'Kyiv Half',
  eventDate: '2026-10-25',
  location: 'Київ',
  eventUrl: '',
  distance: 'Півмарафон',
  raceDistanceCode: 'HM',
  goalTimeRaw: '1:35:00',
  goalSeconds: 5700,
  notes: null,
  updatedAt: '2026-10-06T10:00:00Z',
}

const rawResult = {
  id: 900,
  userId: 45,
  email: 'ivan@example.com',
  raceEventId: 88,
  eventTitle: 'Kyiv Half',
  eventDate: '2026-10-25',
  distanceCode: 'HM',
  distanceLabel: 'Півмарафон',
  distanceMeters: 21097,
  resultTimeRaw: '1:34:12',
  resultSeconds: 5652,
  resultStatus: 'finished',
  isPersonalBest: true,
  isSeasonBest: true,
  matchedRegistrationId: 123,
  updatedAt: '2026-10-25T12:00:00+03:00',
}

function parseEvents(events: unknown[]) {
  const { valid, rejected } = parseWpRaceEvents(events)
  if (rejected.length) throw new Error(JSON.stringify(rejected))
  return valid
}

function makeDb() {
  const table = () => ({
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    aggregate: vi.fn().mockResolvedValue({ _max: { wpUpdatedAt: null } }),
    count: vi.fn().mockResolvedValue(0),
  })
  return { raceRegistration: table(), raceResult: table() }
}

type MockDb = ReturnType<typeof makeDb>

describe('wpRaceEventsBodySchema', () => {
  it('normalizes email and empty optional strings', () => {
    const [event] = parseEvents([{ type: 'registration.upserted', registration: rawRegistration }])
    if (event.type !== 'registration.upserted') throw new Error('unexpected type')
    expect(event.registration.email).toBe('ivan@example.com')
    expect(event.registration.eventUrl).toBeNull()
    expect(event.registration.notes).toBeNull()
  })

  it('treats goalSeconds 0 as "no goal"', () => {
    const [event] = parseEvents([{ type: 'registration.upserted', registration: { ...rawRegistration, goalSeconds: 0 } }])
    if (event.type !== 'registration.upserted') throw new Error('unexpected type')
    expect(event.registration.goalSeconds).toBeNull()
  })

  it('rejects unknown event types, bad dates and empty batches', () => {
    expect(() => parseEvents([{ type: 'user.deleted', id: 1 }])).toThrow()
    expect(() => parseEvents([{ type: 'registration.upserted', registration: { ...rawRegistration, eventDate: '25.10.2026' } }])).toThrow()
    expect(() => wpRaceEventsBodySchema.parse({ events: [] })).toThrow()
  })

  it('accepts distance codes up to 50 chars (WP column size)', () => {
    expect(() => parseEvents([{ type: 'registration.upserted', registration: { ...rawRegistration, raceDistanceCode: 'X'.repeat(50) } }])).not.toThrow()
  })
})

describe('parseWpRaceEvents', () => {
  it('keeps valid events and reports invalid ones without leaking values', () => {
    const { valid, rejected } = parseWpRaceEvents([
      { type: 'registration.deleted', id: 1 },
      { type: 'registration.upserted', registration: { ...rawRegistration, eventDate: '' } },
      'garbage',
    ])

    expect(valid).toHaveLength(1)
    expect(rejected).toEqual([
      { index: 1, kind: 'registration.upserted', wpId: 123, fields: ['registration.eventDate'] },
      { index: 2, kind: 'event', wpId: null, fields: ['(root)'] },
    ])
    expect(JSON.stringify(rejected)).not.toContain('example.com')
  })
})

describe('parseWpRaceSyncPage', () => {
  it('drops invalid rows but keeps the page', () => {
    const page = parseWpRaceSyncPage({
      registrations: [rawRegistration, { ...rawRegistration, id: 124, email: 'nope' }],
      results: [rawResult],
      hasMore: true,
    })
    expect(page.registrations.map((r) => r.id)).toEqual([123])
    expect(page.results).toHaveLength(1)
    expect(page.hasMore).toBe(true)
    expect(page.rejected).toEqual([{ index: 1, kind: 'registration', wpId: 124, fields: ['email'] }])
  })

  it('rejects a malformed envelope', () => {
    expect(() => parseWpRaceSyncPage({ registrations: [] })).toThrow()
  })

  it('rejects a timestamp without timezone', () => {
    expect(() => parseEvents([{ type: 'result.upserted', result: { ...rawResult, updatedAt: '2026-10-25 12:00:00' } }])).toThrow()
  })
})

describe('applyWpRaceEvents', () => {
  let db: MockDb

  beforeEach(() => {
    db = makeDb()
  })

  it('upserts a new registration keyed by wpId', async () => {
    const res = await applyWpRaceEvents(db as never, parseEvents([{ type: 'registration.upserted', registration: rawRegistration }]))

    expect(res).toEqual({ applied: 1, skipped: 0 })
    const call = db.raceRegistration.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ wpId: 123 })
    expect(call.create).toMatchObject({
      wpId: 123,
      email: 'ivan@example.com',
      eventDate: new Date('2026-10-25T00:00:00.000Z'),
      goalSeconds: 5700,
      wpUpdatedAt: new Date('2026-10-06T10:00:00Z'),
    })
  })

  it('upserts a result with its matched registration id', async () => {
    await applyWpRaceEvents(db as never, parseEvents([{ type: 'result.upserted', result: rawResult }]))

    const call = db.raceResult.upsert.mock.calls[0][0]
    expect(call.create).toMatchObject({ wpId: 900, registrationWpId: 123, resultSeconds: 5652, isPersonalBest: true })
  })

  it('skips an update older than the stored version', async () => {
    db.raceRegistration.findUnique.mockResolvedValue({ wpUpdatedAt: new Date('2026-10-07T00:00:00Z') })

    const res = await applyWpRaceEvents(db as never, parseEvents([{ type: 'registration.upserted', registration: rawRegistration }]))

    expect(res).toEqual({ applied: 0, skipped: 1 })
    expect(db.raceRegistration.upsert).not.toHaveBeenCalled()
  })

  it('applies an update with the same timestamp (idempotent re-delivery)', async () => {
    db.raceResult.findUnique.mockResolvedValue({ wpUpdatedAt: new Date(rawResult.updatedAt) })

    const res = await applyWpRaceEvents(db as never, parseEvents([{ type: 'result.upserted', result: rawResult }]))

    expect(res.applied).toBe(1)
    expect(db.raceResult.upsert).toHaveBeenCalled()
  })

  it('deletes idempotently', async () => {
    const res = await applyWpRaceEvents(
      db as never,
      parseEvents([
        { type: 'registration.deleted', id: 123 },
        { type: 'result.deleted', id: 900 },
      ]),
    )

    expect(res.applied).toBe(2)
    expect(db.raceRegistration.deleteMany).toHaveBeenCalledWith({ where: { wpId: 123 } })
    expect(db.raceResult.deleteMany).toHaveBeenCalledWith({ where: { wpId: 900 } })
  })
})

describe('reconcileWpRaces', () => {
  let db: MockDb
  const registration = parseEvents([{ type: 'registration.upserted', registration: rawRegistration }])[0]
  const result = parseEvents([{ type: 'result.upserted', result: rawResult }])[0]
  if (registration.type !== 'registration.upserted' || result.type !== 'result.upserted') throw new Error('setup')

  const page = (overrides: Partial<WpRaceSyncPage> = {}): WpRaceSyncPage => ({
    registrations: [],
    results: [],
    hasMore: false,
    ...overrides,
  })

  beforeEach(() => {
    db = makeDb()
  })

  it('incremental: asks WP for changes since the latest stored update minus overlap', async () => {
    db.raceResult.aggregate.mockResolvedValue({ _max: { wpUpdatedAt: new Date('2026-10-06T10:00:00Z') } })
    const fetchPage = vi.fn<FetchWpRacePage>().mockResolvedValue(page({ registrations: [registration.registration] }))

    const res = await reconcileWpRaces(db as never, fetchPage)

    expect(fetchPage).toHaveBeenCalledWith({ updatedSince: '2026-10-06T09:59:00.000Z', page: 1 })
    expect(res).toEqual({ pages: 1, applied: 1, rejected: 0, deletedRegistrations: 0, deletedResults: 0 })
    expect(db.raceRegistration.deleteMany).not.toHaveBeenCalled()
  })

  it('incremental with an empty mirror fetches everything', async () => {
    const fetchPage = vi.fn<FetchWpRacePage>().mockResolvedValue(page())
    await reconcileWpRaces(db as never, fetchPage)
    expect(fetchPage).toHaveBeenCalledWith({ updatedSince: undefined, page: 1 })
  })

  it('follows pagination until hasMore is false', async () => {
    const fetchPage = vi
      .fn<FetchWpRacePage>()
      .mockResolvedValueOnce(page({ registrations: [registration.registration], hasMore: true }))
      .mockResolvedValueOnce(page({ results: [result.result] }))

    const res = await reconcileWpRaces(db as never, fetchPage)

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenLastCalledWith({ updatedSince: undefined, page: 2 })
    expect(res.applied).toBe(2)
  })

  it('full: deletes rows WP no longer returns', async () => {
    db.raceRegistration.deleteMany.mockResolvedValue({ count: 2 })
    db.raceResult.deleteMany.mockResolvedValue({ count: 1 })
    const fetchPage = vi
      .fn<FetchWpRacePage>()
      .mockResolvedValue(page({ registrations: [registration.registration], results: [result.result] }))

    const res = await reconcileWpRaces(db as never, fetchPage, { full: true })

    expect(fetchPage).toHaveBeenCalledWith({ updatedSince: undefined, page: 1 })
    expect(db.raceRegistration.deleteMany).toHaveBeenCalledWith({ where: { wpId: { notIn: [123] } } })
    expect(db.raceResult.deleteMany).toHaveBeenCalledWith({ where: { wpId: { notIn: [900] } } })
    expect(res).toMatchObject({ deletedRegistrations: 2, deletedResults: 1 })
  })

  it('full: refuses to wipe the mirror when WP returns nothing', async () => {
    db.raceRegistration.count.mockResolvedValue(10)
    const log = vi.fn()

    const res = await reconcileWpRaces(db as never, vi.fn<FetchWpRacePage>().mockResolvedValue(page()), { full: true, log })

    expect(db.raceRegistration.deleteMany).not.toHaveBeenCalled()
    expect(res.deletedRegistrations).toBe(0)
    expect(log).toHaveBeenCalled()
  })

  it('full: skips deletions when the page limit cuts the sweep short', async () => {
    const fetchPage = vi.fn<FetchWpRacePage>().mockResolvedValue(page({ registrations: [registration.registration], hasMore: true }))

    const res = await reconcileWpRaces(db as never, fetchPage, { full: true, maxPages: 2 })

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(res.pages).toBe(2)
    expect(db.raceRegistration.deleteMany).not.toHaveBeenCalled()
  })

  it('counts and logs rows rejected by validation', async () => {
    const log = vi.fn()
    const fetchPage = vi.fn<FetchWpRacePage>().mockResolvedValue({
      ...page(),
      rejected: [{ index: 0, kind: 'registration', wpId: 7, fields: ['eventDate'] }],
    })

    const res = await reconcileWpRaces(db as never, fetchPage, { log })

    expect(res.rejected).toBe(1)
    expect(log).toHaveBeenCalledWith('WP race reconcile: invalid rows skipped', expect.objectContaining({ page: 1 }))
  })

  it('propagates fetch errors', async () => {
    const fetchPage = vi.fn<FetchWpRacePage>().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(reconcileWpRaces(db as never, fetchPage)).rejects.toThrow('ECONNREFUSED')
  })
})
