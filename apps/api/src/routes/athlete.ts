import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ATHLETE_SELECT, EXERCISE_GROUPS_INCLUDE, IND_PLAN_DAYS_INCLUDE } from '../utils/db.js'

function serializeStrava(act: { stravaId: bigint; [k: string]: unknown } | null) {
  return act ? { ...act, stravaId: act.stravaId.toString() } : null
}

function parseDistanceMeters(str: string): number {
  const m = str.match(/(\d+(?:\.\d+)?)\s*(км|km|м|m)/i)
  if (!m) return 0
  const val = parseFloat(m[1])
  return /км|km/i.test(m[2]) ? val * 1000 : val
}

const createSessionSchema = z.object({
  planId: z.string().uuid().optional(),
  individualPlanDayId: z.string().uuid().optional(),
  exerciseGroupId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const feedbackSchema = z.object({
  status: z.enum(['COMPLETED', 'PARTIAL', 'SKIPPED']),
  rpe: z.number().int().min(1).max(10),
  comment: z.string().optional(),
})

const sessionWithFeedbackSchema = createSessionSchema.extend({
  status: z.enum(['COMPLETED', 'PARTIAL', 'SKIPPED']),
  rpe: z.number().int().min(1).max(10),
  comment: z.string().optional(),
})

export const athleteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/plans/week', async (request) => {
    const athleteId = request.user.sub
    const { date } = request.query as { date?: string }

    const ref = date ? new Date(date) : new Date()
    const day = ref.getDay() === 0 ? 7 : ref.getDay()
    const monday = new Date(ref)
    monday.setDate(ref.getDate() - day + 1)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    const memberships = await fastify.prisma.teamMember.findMany({
      where: { athleteId },
      select: { teamId: true },
    })
    const teamIds = memberships.map((m) => m.teamId)

    const [groupPlans, individualPlans] = await Promise.all([
      fastify.prisma.trainingPlan.findMany({
        where: { type: 'GROUP', teamId: { in: teamIds }, date: { gte: monday, lte: sunday } },
        include: {
          exerciseGroups: EXERCISE_GROUPS_INCLUDE,
          team: { select: { id: true, name: true } },
          sessions: { where: { athleteId }, include: { feedback: true } },
        },
        orderBy: { date: 'asc' },
      }),
      fastify.prisma.individualPlan.findMany({
        where: { athleteId, weekStart: { gte: monday, lte: sunday } },
        include: {
          days: {
            ...IND_PLAN_DAYS_INCLUDE,
            include: {
              sessions: { where: { athleteId }, include: { feedback: true } },
            },
          },
        },
      }),
    ])

    const stravaActivities = await fastify.prisma.stravaActivity.findMany({
      where: { athleteId, startDate: { gte: monday, lte: sunday } },
      select: {
        id: true, stravaId: true, name: true, type: true,
        startDateLocal: true, distance: true, movingTime: true,
        averageHeartrate: true, maxHeartrate: true, totalElevationGain: true,
        sessionId: true, matchConfidence: true,
      },
    })

    return {
      weekStart: monday.toISOString().split('T')[0],
      weekEnd: sunday.toISOString().split('T')[0],
      groupPlans,
      individualPlans,
      stravaActivities: stravaActivities.map((a) => ({ ...a, stravaId: a.stravaId.toString() })),
    }
  })

  fastify.get('/plans/individual', async (request) => {
    const athleteId = request.user.sub
    const plans = await fastify.prisma.individualPlan.findMany({
      where: { athleteId },
      include: {
        days: {
          ...IND_PLAN_DAYS_INCLUDE,
          include: {
            sessions: {
              where: { athleteId },
              include: {
                feedback: true,
                stravaActivity: { select: { id: true, stravaId: true, name: true, type: true, startDateLocal: true, distance: true, movingTime: true, averageHeartrate: true, maxHeartrate: true, totalElevationGain: true, sessionId: true } },
              },
            },
          },
        },
      },
      orderBy: { weekStart: 'asc' },
    })
    return plans.map((p) => ({
      ...p,
      days: p.days.map((d) => ({
        ...d,
        sessions: d.sessions.map((s) => ({
          ...s,
          stravaActivity: serializeStrava(s.stravaActivity as { stravaId: bigint; [k: string]: unknown } | null),
        })),
      })),
    }))
  })

  fastify.get('/plans/group/:id', async (request, reply) => {
    const athleteId = request.user.sub
    const { id } = request.params as { id: string }

    const plan = await fastify.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        exerciseGroups: EXERCISE_GROUPS_INCLUDE,
        team: { select: { id: true, name: true } },
        sessions: { where: { athleteId }, include: { feedback: true, stravaActivity: { select: { id: true, stravaId: true, name: true, type: true, startDateLocal: true, distance: true, movingTime: true, averageHeartrate: true, maxHeartrate: true, totalElevationGain: true, sessionId: true } } } },
      },
    })

    if (!plan) return reply.status(404).send({ error: 'Plan not found' })
    if (!plan.teamId) return reply.status(403).send({ error: 'Forbidden' })

    const member = await fastify.prisma.teamMember.findUnique({
      where: { teamId_athleteId: { teamId: plan.teamId, athleteId } },
    })
    if (!member) return reply.status(403).send({ error: 'Forbidden' })

    return {
      ...plan,
      sessions: plan.sessions.map((s) => ({
        ...s,
        stravaActivity: serializeStrava(s.stravaActivity as { stravaId: bigint; [k: string]: unknown } | null),
      })),
    }
  })

  fastify.post('/sessions', async (request, reply) => {
    const athleteId = request.user.sub
    const body = createSessionSchema.parse(request.body)

    if (!body.planId && !body.individualPlanDayId) {
      return reply.status(400).send({ error: 'planId or individualPlanDayId required' })
    }

    const session = await fastify.prisma.athleteSession.create({
      data: {
        athleteId,
        planId: body.planId,
        individualPlanDayId: body.individualPlanDayId,
        exerciseGroupId: body.exerciseGroupId,
        date: new Date(body.date),
      },
    })
    return reply.status(201).send(session)
  })

  fastify.post('/sessions/with-feedback', async (request, reply) => {
    const athleteId = request.user.sub
    const body = sessionWithFeedbackSchema.parse(request.body)

    if (!body.planId && !body.individualPlanDayId) {
      return reply.status(400).send({ error: 'planId or individualPlanDayId required' })
    }

    const result = await fastify.prisma.$transaction(async (tx) => {
      let session = body.planId
        ? await tx.athleteSession.findFirst({ where: { athleteId, planId: body.planId } })
        : await tx.athleteSession.findFirst({ where: { athleteId, individualPlanDayId: body.individualPlanDayId } })

      if (!session) {
        session = await tx.athleteSession.create({
          data: {
            athleteId,
            planId: body.planId,
            individualPlanDayId: body.individualPlanDayId,
            exerciseGroupId: body.exerciseGroupId,
            date: new Date(body.date),
          },
        })
      } else if (body.exerciseGroupId && session.exerciseGroupId !== body.exerciseGroupId) {
        session = await tx.athleteSession.update({
          where: { id: session.id },
          data: { exerciseGroupId: body.exerciseGroupId },
        })
      }

      const feedback = await tx.sessionFeedback.upsert({
        where: { sessionId: session.id },
        create: { sessionId: session.id, status: body.status, rpe: body.rpe, comment: body.comment },
        update: { status: body.status, rpe: body.rpe, comment: body.comment },
      })

      return { session, feedback }
    })

    return reply.status(201).send(result)
  })

  fastify.post('/sessions/:id/feedback', async (request, reply) => {
    const athleteId = request.user.sub
    const { id } = request.params as { id: string }
    const body = feedbackSchema.parse(request.body)

    const session = await fastify.prisma.athleteSession.findUnique({ where: { id } })
    if (!session || session.athleteId !== athleteId) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    return fastify.prisma.sessionFeedback.upsert({
      where: { sessionId: id },
      create: { sessionId: id, ...body },
      update: body,
    })
  })

  fastify.get('/sessions', async (request) => {
    const athleteId = request.user.sub
    return fastify.prisma.athleteSession.findMany({
      where: { athleteId },
      include: {
        plan: { select: { id: true, date: true, title: true } },
        exerciseGroup: { select: { id: true, name: true } },
        individualPlanDay: { select: { id: true, dayOfWeek: true, rawText: true } },
        feedback: true,
      },
      orderBy: { date: 'desc' },
    })
  })

  fastify.get('/stats/volume', async (request) => {
    const athleteId = request.user.sub
    const { weeks = '8' } = request.query as { weeks?: string }
    const numWeeks = Math.min(parseInt(weeks, 10) || 8, 26)

    const since = new Date()
    since.setDate(since.getDate() - numWeeks * 7)

    const sessions = await fastify.prisma.athleteSession.findMany({
      where: { athleteId, date: { gte: since } },
      include: {
        exerciseGroup: { select: { parsedData: true } },
        feedback: { select: { status: true } },
      },
      orderBy: { date: 'asc' },
    })

    const weekMap: Record<string, number> = {}

    for (const session of sessions) {
      if (!session.exerciseGroup?.parsedData) continue

      const d = new Date(session.date)
      const day = d.getDay() === 0 ? 7 : d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - day + 1)
      const weekKey = monday.toISOString().split('T')[0]

      const parsed = session.exerciseGroup.parsedData as {
        blocks?: Array<{ sets?: number; distance?: string; series?: number }>
      }
      let volumeKm = 0
      for (const block of parsed.blocks ?? []) {
        const meters = parseDistanceMeters(block.distance ?? '')
        if (meters > 0) volumeKm += (block.sets ?? 1) * (block.series ?? 1) * meters / 1000
      }

      weekMap[weekKey] = (weekMap[weekKey] ?? 0) + volumeKm
    }

    return Object.entries(weekMap)
      .map(([week, volume]) => ({ week, volume: Math.round(volume * 10) / 10 }))
      .sort((a, b) => a.week.localeCompare(b.week))
  })
}
