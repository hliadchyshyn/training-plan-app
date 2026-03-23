import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { parseWorkout } from '../parsers/workout.js'

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
  days: z.array(
    z.object({
      dayOfWeek: z.number().int().min(1).max(7),
      rawText: z.string().optional(),
    }),
  ),
})

const parseWorkoutSchema = z.object({
  text: z.string().min(1),
})

export const planRoutes: FastifyPluginAsync = async (fastify) => {
  // Parse preview endpoint (trainer only)
  fastify.post(
    '/parse-workout',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request) => {
      const { text } = parseWorkoutSchema.parse(request.body)
      const parsed = parseWorkout(text)
      return { parsed }
    },
  )

  // Create group plan
  fastify.post(
    '/group',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const body = createGroupPlanSchema.parse(request.body)
      const trainerId = request.user.sub

      // Verify trainer owns the team
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
          exerciseGroups: {
            create: body.groups.map((g) => ({
              name: g.name,
              order: g.order,
              rawText: g.rawText,
              parsedData: parseWorkout(g.rawText) ?? undefined,
            })),
          },
        },
        include: { exerciseGroups: { orderBy: { order: 'asc' } } },
      })

      return reply.status(201).send(plan)
    },
  )

  // Create individual plan
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
          days: {
            create: body.days
              .filter((d) => d.rawText)
              .map((d) => ({
                dayOfWeek: d.dayOfWeek,
                rawText: d.rawText,
                parsedData: d.rawText ? (parseWorkout(d.rawText) ?? undefined) : undefined,
              })),
          },
        },
        include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      })

      return reply.status(201).send(plan)
    },
  )

  // Get trainer's plans
  fastify.get(
    '/',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request) => {
      const trainerId = request.user.sub
      const { date, type } = request.query as { date?: string; type?: string }

      const groupPlans = await fastify.prisma.trainingPlan.findMany({
        where: {
          trainerId,
          ...(date ? { date: new Date(date) } : {}),
          ...(type === 'GROUP' ? { type: 'GROUP' } : {}),
        },
        include: {
          exerciseGroups: { orderBy: { order: 'asc' } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
      })

      const individualPlans = await fastify.prisma.individualPlan.findMany({
        where: {
          trainerId,
        },
        include: {
          days: { orderBy: { dayOfWeek: 'asc' } },
          athlete: { select: { id: true, name: true, email: true } },
        },
        orderBy: { weekStart: 'desc' },
      })

      return { groupPlans, individualPlans }
    },
  )

  // Get plan feedback (trainer) - includes all team members
  fastify.get(
    '/:id/feedback',
    { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      // Check if this is a group plan
      const plan = await fastify.prisma.trainingPlan.findUnique({
        where: { id },
        include: {
          team: {
            include: {
              members: {
                include: { athlete: { select: { id: true, name: true, email: true } } },
              },
            },
          },
        },
      })

      if (plan) {
        const sessions = await fastify.prisma.athleteSession.findMany({
          where: { planId: id },
          include: {
            athlete: { select: { id: true, name: true, email: true } },
            exerciseGroup: { select: { id: true, name: true } },
            feedback: true,
          },
          orderBy: { createdAt: 'desc' },
        })

        // Include all team members, marking those without sessions
        const teamMembers = plan.team?.members ?? []

        // Build map of athleteId -> session
        type SessionRow = (typeof sessions)[number]
        type MemberRow = (typeof teamMembers)[number]
        const sessionMap = new Map<string, SessionRow>(sessions.map((s: SessionRow) => [s.athleteId, s]))

        const result = teamMembers.map((member: MemberRow) => {
          const session: SessionRow | undefined = sessionMap.get(member.athleteId)
          return {
            id: session?.id ?? `pending-${member.athleteId}`,
            athlete: member.athlete,
            exerciseGroup: session?.exerciseGroup ?? null,
            date: session?.date ?? null,
            feedback: session?.feedback ?? null,
            hasSession: !!session,
          }
        })

        // Add athletes who have a session but aren't team members (edge case)
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
        include: {
          athlete: { select: { id: true, name: true, email: true } },
          individualPlanDay: true,
          feedback: true,
        },
      })
    },
  )

  // Update individual plan days
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

      // Replace all days
      await fastify.prisma.individualPlanDay.deleteMany({ where: { planId: id } })

      const updated = await fastify.prisma.individualPlan.update({
        where: { id },
        data: {
          notes: body.notes,
          days: {
            create: (body.days ?? [])
              .filter((d) => d.rawText)
              .map((d) => ({
                dayOfWeek: d.dayOfWeek!,
                rawText: d.rawText,
                parsedData: d.rawText ? (parseWorkout(d.rawText) ?? undefined) : undefined,
              })),
          },
        },
        include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      })

      return updated
    },
  )

  // Update group plan
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

      const updated = await fastify.prisma.trainingPlan.update({
        where: { id },
        data: {
          title: body.title,
          notes: body.notes,
          ...(body.groups
            ? {
                exerciseGroups: {
                  deleteMany: {},
                  create: body.groups.map((g) => ({
                    name: g.name,
                    order: g.order,
                    rawText: g.rawText,
                    parsedData: parseWorkout(g.rawText) ?? undefined,
                  })),
                },
              }
            : {}),
        },
        include: { exerciseGroups: { orderBy: { order: 'asc' } } },
      })

      return updated
    },
  )
}
