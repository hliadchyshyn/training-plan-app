import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Mirror of tsclub.com.ua race data (anons registrations + race results).
 * WordPress is the source of truth: it pushes events on every change, and
 * plans periodically reconciles via a pull endpoint to recover lost pushes.
 */

const wpId = z.number().int().positive()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const isoDateTime = z.string().datetime({ offset: true })
const email = z.string().trim().email().max(254).transform((v) => v.toLowerCase())
const optionalText = (max: number) =>
  z.string().max(max).nullish().transform((v) => (v ? v : null))

export const registrationSchema = z.object({
  id: wpId,
  userId: wpId,
  email,
  userName: optionalText(255),
  anonsEventId: wpId,
  eventTitle: z.string().min(1).max(500),
  eventDate: isoDate,
  location: optionalText(255),
  eventUrl: optionalText(1000),
  distance: z.string().min(1).max(100),
  raceDistanceCode: optionalText(50),
  goalTimeRaw: optionalText(30),
  goalSeconds: z.number().int().nonnegative().nullish().transform((v) => (v ? v : null)),
  notes: optionalText(5000),
  updatedAt: isoDateTime,
})

export const resultSchema = z.object({
  id: wpId,
  userId: wpId,
  email,
  raceEventId: wpId,
  eventTitle: z.string().min(1).max(500),
  eventDate: isoDate,
  distanceCode: z.string().max(20),
  distanceLabel: z.string().max(100),
  distanceMeters: z.number().int().nonnegative(),
  resultTimeRaw: z.string().max(30),
  resultSeconds: z.number().int().nonnegative(),
  resultStatus: z.string().min(1).max(10),
  isPersonalBest: z.boolean().default(false),
  isSeasonBest: z.boolean().default(false),
  matchedRegistrationId: wpId.nullish().transform((v) => v ?? null),
  updatedAt: isoDateTime,
})

export const wpRaceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('registration.upserted'), registration: registrationSchema }),
  z.object({ type: z.literal('registration.deleted'), id: wpId }),
  z.object({ type: z.literal('result.upserted'), result: resultSchema }),
  z.object({ type: z.literal('result.deleted'), id: wpId }),
])

// Envelopes are strict; items are validated one by one so a single bad row in WP
// doesn't block the rest of the batch (and isn't retried forever).
export const wpRaceEventsBodySchema = z.object({
  events: z.array(z.unknown()).min(1).max(500),
})

const wpRaceSyncPageEnvelopeSchema = z.object({
  registrations: z.array(z.unknown()).max(1000),
  results: z.array(z.unknown()).max(1000),
  hasMore: z.boolean(),
})

export type WpRegistration = z.infer<typeof registrationSchema>
export type WpResult = z.infer<typeof resultSchema>
export type WpRaceEvent = z.infer<typeof wpRaceEventSchema>

export interface WpRaceSyncPage {
  registrations: WpRegistration[]
  results: WpResult[]
  hasMore: boolean
  /** Items dropped by validation. */
  rejected?: RejectedItem[]
}

/** Where validation failed — field paths only, never values (they hold PII). */
export interface RejectedItem {
  index: number
  kind: string
  wpId: number | null
  fields: string[]
}

function describeItem(item: unknown, fallbackKind: string): { kind: string; wpId: number | null } {
  const obj = (item ?? {}) as Record<string, unknown>
  const nested = (obj.registration ?? obj.result ?? obj) as Record<string, unknown>
  const id = typeof obj.id === 'number' ? obj.id : typeof nested.id === 'number' ? nested.id : null
  return { kind: typeof obj.type === 'string' ? obj.type.slice(0, 40) : fallbackKind, wpId: id }
}

export function parseItems<T>(items: unknown[], schema: z.ZodType<T, z.ZodTypeDef, unknown>, kind: string) {
  const valid: T[] = []
  const rejected: RejectedItem[] = []
  items.forEach((item, index) => {
    const parsed = schema.safeParse(item)
    if (parsed.success) {
      valid.push(parsed.data)
    } else {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))].slice(0, 10)
      rejected.push({ index, ...describeItem(item, kind), fields })
    }
  })
  return { valid, rejected }
}

export function parseWpRaceEvents(items: unknown[]) {
  return parseItems(items, wpRaceEventSchema, 'event')
}

export function parseWpRaceSyncPage(data: unknown): WpRaceSyncPage {
  const envelope = wpRaceSyncPageEnvelopeSchema.parse(data)
  const registrations = parseItems(envelope.registrations, registrationSchema, 'registration')
  const results = parseItems(envelope.results, resultSchema, 'result')
  return {
    registrations: registrations.valid,
    results: results.valid,
    hasMore: envelope.hasMore,
    rejected: [...registrations.rejected, ...results.rejected],
  }
}

type Db = Pick<PrismaClient, 'raceRegistration' | 'raceResult'>

function toDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00.000Z`)
}

function registrationData(r: WpRegistration) {
  return {
    wpUserId: r.userId,
    email: r.email,
    userName: r.userName,
    anonsEventId: r.anonsEventId,
    eventTitle: r.eventTitle,
    eventDate: toDate(r.eventDate),
    location: r.location,
    eventUrl: r.eventUrl,
    distance: r.distance,
    raceDistanceCode: r.raceDistanceCode,
    goalTimeRaw: r.goalTimeRaw,
    goalSeconds: r.goalSeconds,
    notes: r.notes,
    wpUpdatedAt: new Date(r.updatedAt),
    syncedAt: new Date(),
  } satisfies Omit<Prisma.RaceRegistrationUncheckedCreateInput, 'wpId'>
}

function resultData(r: WpResult) {
  return {
    wpUserId: r.userId,
    email: r.email,
    raceEventId: r.raceEventId,
    eventTitle: r.eventTitle,
    eventDate: toDate(r.eventDate),
    distanceCode: r.distanceCode,
    distanceLabel: r.distanceLabel,
    distanceMeters: r.distanceMeters,
    resultTimeRaw: r.resultTimeRaw,
    resultSeconds: r.resultSeconds,
    resultStatus: r.resultStatus,
    isPersonalBest: r.isPersonalBest,
    isSeasonBest: r.isSeasonBest,
    registrationWpId: r.matchedRegistrationId,
    wpUpdatedAt: new Date(r.updatedAt),
    syncedAt: new Date(),
  } satisfies Omit<Prisma.RaceResultUncheckedCreateInput, 'wpId'>
}

/** Upsert unless we already hold a newer version (out-of-order delivery). */
async function upsertRegistration(db: Db, r: WpRegistration): Promise<boolean> {
  const existing = await db.raceRegistration.findUnique({ where: { wpId: r.id }, select: { wpUpdatedAt: true } })
  if (existing && existing.wpUpdatedAt > new Date(r.updatedAt)) return false
  const data = registrationData(r)
  await db.raceRegistration.upsert({ where: { wpId: r.id }, create: { wpId: r.id, ...data }, update: data })
  return true
}

async function upsertResult(db: Db, r: WpResult): Promise<boolean> {
  const existing = await db.raceResult.findUnique({ where: { wpId: r.id }, select: { wpUpdatedAt: true } })
  if (existing && existing.wpUpdatedAt > new Date(r.updatedAt)) return false
  const data = resultData(r)
  await db.raceResult.upsert({ where: { wpId: r.id }, create: { wpId: r.id, ...data }, update: data })
  return true
}

export interface ApplyResult {
  applied: number
  skipped: number
}

export async function applyWpRaceEvents(db: Db, events: WpRaceEvent[]): Promise<ApplyResult> {
  let applied = 0
  for (const event of events) {
    let changed = true
    switch (event.type) {
      case 'registration.upserted':
        changed = await upsertRegistration(db, event.registration)
        break
      case 'registration.deleted':
        await db.raceRegistration.deleteMany({ where: { wpId: event.id } })
        break
      case 'result.upserted':
        changed = await upsertResult(db, event.result)
        break
      case 'result.deleted':
        await db.raceResult.deleteMany({ where: { wpId: event.id } })
        break
    }
    if (changed) applied++
  }
  return { applied, skipped: events.length - applied }
}

// ── Reconciliation (plans pulls from WP) ───────────────────────────────────

export type FetchWpRacePage = (params: { updatedSince?: string; page: number }) => Promise<WpRaceSyncPage>

export interface ReconcileOptions {
  /** Full sweep: fetch everything and delete local rows WP no longer has. */
  full?: boolean
  maxPages?: number
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export interface ReconcileResult {
  pages: number
  applied: number
  rejected: number
  deletedRegistrations: number
  deletedResults: number
}

/** Small overlap so rows saved in the same second as the last sync aren't missed. */
const INCREMENTAL_OVERLAP_MS = 60_000

async function latestWpUpdate(db: Db): Promise<Date | null> {
  const [reg, res] = await Promise.all([
    db.raceRegistration.aggregate({ _max: { wpUpdatedAt: true } }),
    db.raceResult.aggregate({ _max: { wpUpdatedAt: true } }),
  ])
  const dates = [reg._max.wpUpdatedAt, res._max.wpUpdatedAt].filter((d): d is Date => d !== null)
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
}

export async function reconcileWpRaces(
  db: Db,
  fetchPage: FetchWpRacePage,
  { full = false, maxPages = 500, log = () => {} }: ReconcileOptions = {},
): Promise<ReconcileResult> {
  let updatedSince: string | undefined
  if (!full) {
    const latest = await latestWpUpdate(db)
    // Nothing synced yet → incremental degrades to a full fetch (without deletions).
    if (latest) updatedSince = new Date(latest.getTime() - INCREMENTAL_OVERLAP_MS).toISOString()
  }

  const seenRegistrations = new Set<number>()
  const seenResults = new Set<number>()
  let applied = 0
  let rejected = 0
  let page = 1
  let complete = false

  for (; page <= maxPages; page++) {
    const data = await fetchPage({ updatedSince, page })
    if (data.rejected?.length) {
      rejected += data.rejected.length
      log('WP race reconcile: invalid rows skipped', { page, rejected: data.rejected })
    }
    const events: WpRaceEvent[] = [
      ...data.registrations.map((registration) => ({ type: 'registration.upserted' as const, registration })),
      ...data.results.map((result) => ({ type: 'result.upserted' as const, result })),
    ]
    data.registrations.forEach((r) => seenRegistrations.add(r.id))
    data.results.forEach((r) => seenResults.add(r.id))
    applied += (await applyWpRaceEvents(db, events)).applied
    if (!data.hasMore) {
      complete = true
      break
    }
  }
  const pages = Math.min(page, maxPages)

  if (!full) return { pages, applied, rejected, deletedRegistrations: 0, deletedResults: 0 }

  if (!complete) {
    log('WP race reconcile: page limit reached, skipping deletions', { maxPages })
    return { pages, applied, rejected, deletedRegistrations: 0, deletedResults: 0 }
  }

  // Guard against wiping the mirror if WP returns an empty set by mistake.
  const localCount = (await db.raceRegistration.count()) + (await db.raceResult.count())
  if (seenRegistrations.size + seenResults.size === 0 && localCount > 0) {
    log('WP race reconcile: WP returned no data, skipping deletions', { localCount })
    return { pages, applied, rejected, deletedRegistrations: 0, deletedResults: 0 }
  }

  const [deletedRegistrations, deletedResults] = await Promise.all([
    db.raceRegistration.deleteMany({ where: { wpId: { notIn: [...seenRegistrations] } } }),
    db.raceResult.deleteMany({ where: { wpId: { notIn: [...seenResults] } } }),
  ])

  return {
    pages,
    applied,
    rejected,
    deletedRegistrations: deletedRegistrations.count,
    deletedResults: deletedResults.count,
  }
}
