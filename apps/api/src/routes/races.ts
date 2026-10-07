import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ATHLETE_SELECT } from '../utils/db.js'
import { buildRaceEntries, type RaceAthlete } from '../utils/raceEntries.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_PAST_DAYS = 90
const DEFAULT_FUTURE_DAYS = 365
const MAX_RANGE_DAYS = 800

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const listQuerySchema = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  athleteId: z.string().uuid().optional(),
})

function resolveRange(from?: string, to?: string): { gte: Date; lte: Date } | null {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')
  const gte = from ? new Date(`${from}T00:00:00.000Z`) : new Date(today.getTime() - DEFAULT_PAST_DAYS * DAY_MS)
  const lte = to ? new Date(`${to}T00:00:00.000Z`) : new Date(today.getTime() + DEFAULT_FUTURE_DAYS * DAY_MS)
  if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) return null
  if (lte < gte || lte.getTime() - gte.getTime() > MAX_RANGE_DAYS * DAY_MS) return null
  return { gte, lte }
}

const byLowerEmail = (users: RaceAthlete[]) => new Map(users.map((u) => [u.email.toLowerCase(), u]))

/** Starts (anons goals + results) mirrored from tsclub.com.ua — read-only. */
export const raceRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/races?from&to&athleteId — trainer: own athletes, athlete: self, admin: everyone
  fastify.get('/', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request, reply) => {
    const { from, to, athleteId } = listQuerySchema.parse(request.query)
    const eventDate = resolveRange(from, to)
    if (!eventDate) return reply.status(400).send({ error: `Некоректний період (максимум ${MAX_RANGE_DAYS} днів)` })

    const { sub, role } = request.user
    let scope: RaceAthlete[] | null // null = no restriction (admin, all)

    if (role === 'ATHLETE') {
      if (athleteId && athleteId !== sub) return reply.status(403).send({ error: 'Forbidden' })
      scope = await fastify.prisma.user.findMany({ where: { id: sub }, select: ATHLETE_SELECT })
    } else if (role === 'TRAINER') {
      scope = await fastify.prisma.user.findMany({
        where: { trainerId: sub, ...(athleteId ? { id: athleteId } : {}) },
        select: ATHLETE_SELECT,
      })
      if (athleteId && scope.length === 0) return reply.status(404).send({ error: 'Athlete not found' })
    } else {
      scope = athleteId
        ? await fastify.prisma.user.findMany({ where: { id: athleteId }, select: ATHLETE_SELECT })
        : null
    }

    if (scope && scope.length === 0) return []

    const where = {
      eventDate,
      ...(scope ? { email: { in: scope.map((u) => u.email.toLowerCase()) } } : {}),
    }
    const [registrations, results] = await Promise.all([
      fastify.prisma.raceRegistration.findMany({ where, orderBy: { eventDate: 'asc' } }),
      fastify.prisma.raceResult.findMany({ where, orderBy: { eventDate: 'asc' } }),
    ])

    let athletes = scope
    if (!athletes) {
      const emails = [...new Set([...registrations, ...results].map((r) => r.email))]
      athletes = emails.length
        ? await fastify.prisma.user.findMany({
            where: { email: { in: emails, mode: 'insensitive' } },
            select: ATHLETE_SELECT,
          })
        : []
    }

    return buildRaceEntries(registrations, results, byLowerEmail(athletes))
  })

  // GET /api/races/unmatched — WP emails with race data but no plans account
  fastify.get('/unmatched', { preHandler: fastify.requireRole(['ADMIN']) }, async () => {
    const [regCounts, resCounts] = await Promise.all([
      fastify.prisma.raceRegistration.groupBy({ by: ['email'], _count: { _all: true } }),
      fastify.prisma.raceResult.groupBy({ by: ['email'], _count: { _all: true } }),
    ])

    const counts = new Map<string, { email: string; registrations: number; results: number }>()
    for (const r of regCounts) counts.set(r.email, { email: r.email, registrations: r._count._all, results: 0 })
    for (const r of resCounts) {
      const row = counts.get(r.email) ?? { email: r.email, registrations: 0, results: 0 }
      counts.set(r.email, { ...row, results: r._count._all })
    }
    if (counts.size === 0) return []

    const known = await fastify.prisma.user.findMany({
      where: { email: { in: [...counts.keys()], mode: 'insensitive' } },
      select: { email: true },
    })
    const knownEmails = new Set(known.map((u) => u.email.toLowerCase()))

    return [...counts.values()]
      .filter((row) => !knownEmails.has(row.email))
      .sort((a, b) => b.registrations + b.results - (a.registrations + a.results))
      .slice(0, 500)
  })
}
