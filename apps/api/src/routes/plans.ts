import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { parseWorkout } from '../parsers/workout.js'
import { ATHLETE_SELECT, EXERCISE_GROUPS_INCLUDE, DAYS_INCLUDE } from '../utils/db.js'

const exerciseGroupSchema = z.object({
  name: z.string().min(1),
  rawText: z.string(),
  order: z.number().int().min(0),
})

const createGroupPlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId: z.string().uuid(),
  title: z.string().optional(),
  notes: z.string().optional(),
  groups: z.array(exerciseGroupSchema).min(1),
})

const createIndividualPlanSchema = z.object({
  athleteId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  days: z.array(z.object({
    dayOfWeek: z.number().int().min(1).max(7),
    rawText: z.string().optional(),
  })),
})

const parseWorkoutSchema = z.object({ text: z.string().min(1) })

function toGroupCreate(groups: z.infer<typeof exerciseGroupSchema>[]) {
  return groups.map((g) => ({
    name: g.name,
    order: g.order,
    rawText: g.rawText,
    parsedData: (parseWorkout(g.rawText) ?? undefined) as Prisma.InputJsonValue | undefined,
  }))
}

function toDayCreate(days: Array<{ dayOfWeek: number; rawText?: string }>) {
  return days
    .filter((d) => d.rawText)
    .map((d) => ({
      dayOfWeek: d.dayOfWeek,
      rawText: d.rawText,
      parsedData: (d.rawText ? (parseWorkout(d.rawText) ?? undefined) : undefined) as Prisma.InputJsonValue | undefined,
    }))
}

export const planRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/parse-workout',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request) => {
      const { text } = parseWorkoutSchema.parse(request.body)
      return { parsed: parseWorkout(text) }
    },
  )

  fastify.post(
    '/group',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const body = createGroupPlanSchema.parse(request.body)
      const trainerId = request.user.sub

      const team = await fastify.prisma.trainerTeam.findUnique({ where: { id: body.teamId } })
      if (!team || team.trainerId !== trainerId) {
        return reply.status(403).send({ error: 'Not your team' })
      }

      const plan = await fastify.prisma.trainingPlan.create({
        data: {
          trainerId,
          date: new Date(body.date),
          type: 'GROUP',
          title: body.title,
          notes: body.notes,
          teamId: body.teamId,
          exerciseGroups: { create: toGroupCreate(body.groups) },
        },
        include: { exerciseGroups: EXERCISE_GROUPS_INCLUDE },
      })
      return reply.status(201).send(plan)
    },
  )

  fastify.post(
    '/individual',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const body = createIndividualPlanSchema.parse(request.body)
      const trainerId = request.user.sub

      const plan = await fastify.prisma.individualPlan.create({
        data: {
          trainerId,
          athleteId: body.athleteId,
          weekStart: new Date(body.weekStart),
          notes: body.notes,
          days: { create: toDayCreate(body.days) },
        },
        include: { days: DAYS_INCLUDE },
      })
      return reply.status(201).send(plan)
    },
  )

  fastify.get(
    '/',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request) => {
      const trainerId = request.user.sub
      const q = request.query as {
        date?: string
        tab?: 'upcoming' | 'past'
        teamId?: string
        athleteId?: string
        month?: string
        groupPage?: string
        indPage?: string
        limit?: string
      }

      const limit = Math.min(parseInt(q.limit ?? '20', 10), 100)
      const groupPage = Math.max(parseInt(q.groupPage ?? '1', 10), 1)
      const indPage = Math.max(parseInt(q.indPage ?? '1', 10), 1)

      const today = new Date(); today.setHours(0, 0, 0, 0)

      let dateFilter: Record<string, Date> = {}
      if (q.month) {
        const [y, m] = q.month.split('-').map(Number)
        dateFilter = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) }
      } else if (q.tab === 'past') {
        dateFilter = { lt: today }
      } else if (!q.date) {
        dateFilter = { gte: today }
      }

      const hasDateFilter = Object.keys(dateFilter).length > 0

      const groupWhere = {
        trainerId,
        ...(q.date ? { date: new Date(q.date) } : hasDateFilter ? { date: dateFilter } : {}),
        ...(q.teamId ? { teamId: q.teamId } : {}),
      }

      const indWhere = {
        trainerId,
        ...(hasDateFilter ? { weekStart: dateFilter } : {}),
        ...(q.athleteId ? { athleteId: q.athleteId } : {}),
      }

      // Legacy single-date path (trainer dashboard "today" filter)
      if (q.date) {
        const [groupPlans, individualPlans] = await Promise.all([
          fastify.prisma.trainingPlan.findMany({
            where: groupWhere,
            include: { exerciseGroups: EXERCISE_GROUPS_INCLUDE, team: { select: { id: true, name: true } } },
            orderBy: { date: 'desc' },
          }),
          fastify.prisma.individualPlan.findMany({
            where: { trainerId },
            include: { days: DAYS_INCLUDE, athlete: { select: ATHLETE_SELECT } },
            orderBy: { weekStart: 'desc' },
          }),
        ])
        return { groupPlans, individualPlans }
      }

      const orderDir = q.tab === 'past' ? 'desc' as const : 'asc' as const

      const [groupData, groupTotal, indData, indTotal] = await Promise.all([
        fastify.prisma.trainingPlan.findMany({
          where: groupWhere,
          include: { exerciseGroups: EXERCISE_GROUPS_INCLUDE, team: { select: { id: true, name: true } } },
          orderBy: { date: orderDir },
          skip: (groupPage - 1) * limit,
          take: limit,
        }),
        fastify.prisma.trainingPlan.count({ where: groupWhere }),
        fastify.prisma.individualPlan.findMany({
          where: indWhere,
          include: { days: DAYS_INCLUDE, athlete: { select: ATHLETE_SELECT } },
          orderBy: { weekStart: orderDir },
          skip: (indPage - 1) * limit,
          take: limit,
        }),
        fastify.prisma.individualPlan.count({ where: indWhere }),
      ])

      return {
        groupPlans: { data: groupData, total: groupTotal, page: groupPage, totalPages: Math.ceil(groupTotal / limit) },
        individualPlans: { data: indData, total: indTotal, page: indPage, totalPages: Math.ceil(indTotal / limit) },
      }
    },
  )

  fastify.get(
    '/:id/feedback',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const [plan, sessions] = await Promise.all([
        fastify.prisma.trainingPlan.findUnique({
          where: { id },
          include: {
            team: {
              include: { members: { include: { athlete: { select: ATHLETE_SELECT } } } },
            },
          },
        }),
        fastify.prisma.athleteSession.findMany({
          where: { planId: id },
          include: {
            athlete: { select: ATHLETE_SELECT },
            exerciseGroup: { select: { id: true, name: true } },
            feedback: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      if (plan) {
        const teamMembers = plan.team?.members ?? []
        type SessionRow = (typeof sessions)[number]
        type MemberRow = (typeof teamMembers)[number]

        const sessionMap = new Map<string, SessionRow>(sessions.map((s) => [s.athleteId, s]))

        const result = teamMembers.map((member: MemberRow) => {
          const session = sessionMap.get(member.athleteId)
          return {
            id: session?.id ?? `pending-${member.athleteId}`,
            athlete: member.athlete,
            exerciseGroup: session?.exerciseGroup ?? null,
            date: session?.date ?? null,
            feedback: session?.feedback ?? null,
            hasSession: !!session,
          }
        })

        for (const session of sessions) {
          if (!teamMembers.find((m: MemberRow) => m.athleteId === session.athleteId)) {
            result.push({
              id: session.id,
              athlete: session.athlete,
              exerciseGroup: session.exerciseGroup,
              date: session.date,
              feedback: session.feedback,
              hasSession: true,
            })
          }
        }

        return result
      }

      // Individual plan fallback
      const dayIds = (
        await fastify.prisma.individualPlanDay.findMany({
          where: { planId: id },
          select: { id: true },
        })
      ).map((d) => d.id)

      return fastify.prisma.athleteSession.findMany({
        where: { individualPlanDayId: { in: dayIds } },
        include: { athlete: { select: ATHLETE_SELECT }, individualPlanDay: true, feedback: true },
      })
    },
  )

  fastify.get(
    '/individual/:id',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const trainerId = request.user.sub
      const plan = await fastify.prisma.individualPlan.findUnique({
        where: { id },
        include: { athlete: { select: ATHLETE_SELECT }, days: { orderBy: { dayOfWeek: 'asc' } } },
      })
      if (!plan || plan.trainerId !== trainerId) return reply.status(404).send({ error: 'Plan not found' })
      return plan
    },
  )

  fastify.put(
    '/individual/:id',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const trainerId = request.user.sub
      const body = createIndividualPlanSchema.partial().parse(request.body)

      const plan = await fastify.prisma.individualPlan.findUnique({ where: { id } })
      if (!plan || plan.trainerId !== trainerId) {
        return reply.status(404).send({ error: 'Plan not found' })
      }

      await fastify.prisma.individualPlanDay.deleteMany({ where: { planId: id } })

      return fastify.prisma.individualPlan.update({
        where: { id },
        data: {
          notes: body.notes,
          days: { create: toDayCreate(body.days ?? []) },
        },
        include: { days: DAYS_INCLUDE },
      })
    },
  )

  fastify.put(
    '/:id',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const trainerId = request.user.sub
      const body = createGroupPlanSchema.partial().parse(request.body)

      const plan = await fastify.prisma.trainingPlan.findUnique({ where: { id } })
      if (!plan || plan.trainerId !== trainerId) {
        return reply.status(404).send({ error: 'Plan not found' })
      }

      return fastify.prisma.trainingPlan.update({
        where: { id },
        data: {
          title: body.title,
          notes: body.notes,
          ...(body.groups ? { exerciseGroups: { deleteMany: {}, create: toGroupCreate(body.groups) } } : {}),
        },
        include: { exerciseGroups: EXERCISE_GROUPS_INCLUDE },
      })
    },
  )
}
