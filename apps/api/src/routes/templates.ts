import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'
import { parseWorkout } from '../parsers/workout.js'
import { watchStepsToPlanText } from '../utils/watchStepsToPlanText.js'

const watchStepSchema = z.object({
  type: z.enum(['WARMUP', 'ACTIVE', 'RECOVERY', 'COOLDOWN', 'REST', 'REPEAT_BEGIN', 'REPEAT_END']),
  durationUnit: z.enum(['TIME', 'DISTANCE', 'OPEN']),
  durationValue: z.number().optional(),
  targetUnit: z.enum(['PACE', 'HEART_RATE_ZONE', 'OPEN']),
  targetFrom: z.number().optional(),
  targetTo: z.number().optional(),
  repeatCount: z.number().int().min(2).optional(),
  name: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sport: z.enum(['RUNNING', 'CYCLING', 'SWIMMING']).default('RUNNING'),
  steps: z.array(watchStepSchema).min(1),
  notes: z.string().optional(),
  isPublic: z.boolean().default(false),
})

const fromWatchWorkoutSchema = z.object({
  watchWorkoutId: z.string().uuid(),
  isPublic: z.boolean().default(false),
})

const CAN_PUBLISH: string[] = ['TRAINER', 'ADMIN']

export const templatesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/templates — public library + own private
  fastify.get(
    '/',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request) => {
      const userId = request.user.sub as string
      const query = request.query as { sport?: string; mine?: string }
      const onlyMine = query.mine === 'true'

      const where = onlyMine
        ? { creatorId: userId }
        : { OR: [{ isPublic: true }, { creatorId: userId }] }

      const sportFilter = query.sport && ['RUNNING', 'CYCLING', 'SWIMMING'].includes(query.sport)
        ? { sport: query.sport as WatchSport }
        : {}

      const templates = await fastify.prisma.workoutTemplate.findMany({
        where: { ...where, ...sportFilter },
        include: { creator: { select: { id: true, name: true } } },
        orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
      })

      return templates.map((t) => ({
        ...t,
        creatorName: t.creator.name,
        creator: undefined,
      }))
    },
  )

  // POST /api/templates — create
  fastify.post(
    '/',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const data = createSchema.parse(request.body)
      const isPublic = data.isPublic && CAN_PUBLISH.includes(request.user.role)

      const template = await fastify.prisma.workoutTemplate.create({
        data: {
          creatorId: userId,
          name: data.name,
          sport: data.sport,
          steps: data.steps as unknown as import('@prisma/client').Prisma.InputJsonValue,
          notes: data.notes,
          isPublic,
        },
        include: { creator: { select: { id: true, name: true } } },
      })

      reply.code(201)
      return { ...template, creatorName: template.creator.name, creator: undefined }
    },
  )

  // POST /api/templates/from-watch-workout — save WatchWorkout as template
  fastify.post(
    '/from-watch-workout',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { watchWorkoutId, isPublic: wantsPublic } = fromWatchWorkoutSchema.parse(request.body)

      const workout = await fastify.prisma.watchWorkout.findUnique({ where: { id: watchWorkoutId } })
      if (!workout) return reply.code(404).send({ error: 'WatchWorkout not found' })
      if (workout.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

      const isPublic = wantsPublic && CAN_PUBLISH.includes(request.user.role)

      const template = await fastify.prisma.workoutTemplate.create({
        data: {
          creatorId: userId,
          name: workout.name,
          sport: workout.sport,
          steps: workout.steps as Prisma.InputJsonValue,
          notes: workout.notes,
          isPublic,
        },
        include: { creator: { select: { id: true, name: true } } },
      })

      reply.code(201)
      return { ...template, creatorName: template.creator.name, creator: undefined }
    },
  )

  // GET /api/templates/:id
  fastify.get(
    '/:id',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }

      const template = await fastify.prisma.workoutTemplate.findUnique({
        where: { id },
        include: { creator: { select: { id: true, name: true } } },
      })
      if (!template) return reply.code(404).send({ error: 'Not found' })
      if (!template.isPublic && template.creatorId !== userId) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      return { ...template, creatorName: template.creator.name, creator: undefined }
    },
  )

  // PUT /api/templates/:id
  fastify.put(
    '/:id',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }

      const existing = await fastify.prisma.workoutTemplate.findUnique({ where: { id } })
      if (!existing) return reply.code(404).send({ error: 'Not found' })
      if (existing.creatorId !== userId && request.user.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      const data = createSchema.parse(request.body)
      const isPublic = data.isPublic && CAN_PUBLISH.includes(request.user.role)

      const updated = await fastify.prisma.workoutTemplate.update({
        where: { id },
        data: {
          name: data.name,
          sport: data.sport,
          steps: data.steps as unknown as import('@prisma/client').Prisma.InputJsonValue,
          notes: data.notes,
          isPublic,
        },
        include: { creator: { select: { id: true, name: true } } },
      })

      return { ...updated, creatorName: updated.creator.name, creator: undefined }
    },
  )

  // DELETE /api/templates/:id
  fastify.delete(
    '/:id',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }

      const existing = await fastify.prisma.workoutTemplate.findUnique({ where: { id } })
      if (!existing) return reply.code(404).send({ error: 'Not found' })
      if (existing.creatorId !== userId && request.user.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      await fastify.prisma.workoutTemplate.delete({ where: { id } })
      reply.code(204)
    },
  )

  // POST /api/templates/:id/fork — clone as own private template
  fastify.post(
    '/:id/fork',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }

      const source = await fastify.prisma.workoutTemplate.findUnique({ where: { id } })
      if (!source) return reply.code(404).send({ error: 'Not found' })
      if (!source.isPublic && source.creatorId !== userId) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      const forked = await fastify.prisma.workoutTemplate.create({
        data: {
          creatorId: userId,
          name: source.name,
          sport: source.sport,
          steps: source.steps as Prisma.InputJsonValue,
          notes: source.notes,
          isPublic: false,
        },
        include: { creator: { select: { id: true, name: true } } },
      })

      reply.code(201)
      return { ...forked, creatorName: forked.creator.name, creator: undefined }
    },
  )

  // POST /api/templates/apply/calendar — schedule template as a training plan entry
  fastify.post(
    '/apply/calendar',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { templateId, date } = request.body as { templateId: string; date: string }
      if (!templateId || !date) return reply.code(400).send({ error: 'templateId and date required' })

      const template = await fastify.prisma.workoutTemplate.findUnique({ where: { id: templateId } })
      if (!template) return reply.code(404).send({ error: 'Template not found' })
      if (!template.isPublic && template.creatorId !== userId) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      const planDate = new Date(date)
      if (isNaN(planDate.getTime())) return reply.code(400).send({ error: 'Invalid date' })
      const rawText = watchStepsToPlanText(template.steps as unknown as WatchWorkoutStep[]) || template.notes || template.name

      const plan = await fastify.prisma.trainingPlan.create({
        data: {
          trainerId: userId,
          date: planDate,
          type: 'GROUP',
          title: template.name,
          exerciseGroups: {
            create: [{
              name: template.name,
              rawText,
              parsedData: (parseWorkout(rawText) ?? undefined) as Prisma.InputJsonValue | undefined,
              order: 0,
            }],
          },
        },
        include: { exerciseGroups: true },
      })

      reply.code(201)
      return { planId: plan.id }
    },
  )

  // POST /api/templates/apply/watch — create WatchWorkout from template
  fastify.post(
    '/apply/watch',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { templateId, name } = request.body as { templateId: string; name?: string }
      if (!templateId) return reply.code(400).send({ error: 'templateId required' })

      const template = await fastify.prisma.workoutTemplate.findUnique({ where: { id: templateId } })
      if (!template) return reply.code(404).send({ error: 'Template not found' })
      if (!template.isPublic && template.creatorId !== userId) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      const workout = await fastify.prisma.watchWorkout.create({
        data: {
          creatorId: userId,
          name: name ?? template.name,
          sport: template.sport,
          steps: template.steps as Prisma.InputJsonValue,
          notes: template.notes,
          sourceType: 'TEMPLATE',
          sourceId: template.id,
        },
      })

      reply.code(201)
      return workout
    },
  )
}
