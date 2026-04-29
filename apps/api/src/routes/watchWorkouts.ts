import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'
import { parseWorkout } from '../parsers/workout.js'
import { parsedDataToSteps } from '../utils/planToWatch.js'
import { stepsToFit } from '../utils/watchExport.js'
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
})

const fromPlanSchema = z.object({
  sourceType: z.enum(['GROUP_PLAN', 'INDIVIDUAL_DAY']),
  sourceId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  sport: z.enum(['RUNNING', 'CYCLING', 'SWIMMING']).default('RUNNING'),
})

export const watchWorkoutsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/watch-workouts — list own workouts
  fastify.get(
    '/',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request) => {
      const userId = request.user.sub as string
      const workouts = await fastify.prisma.watchWorkout.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: 'desc' },
      })
      return workouts
    },
  )

  // POST /api/watch-workouts — create manually
  fastify.post(
    '/',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const data = createSchema.parse(request.body)
      const workout = await fastify.prisma.watchWorkout.create({
        data: {
          creatorId: userId,
          name: data.name,
          sport: data.sport,
          steps: data.steps as unknown as import('@prisma/client').Prisma.InputJsonValue,
          notes: data.notes,
          sourceType: 'MANUAL',
        },
      })
      reply.code(201)
      return workout
    },
  )

  // POST /api/watch-workouts/from-plan — convert from existing plan
  fastify.post(
    '/from-plan',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const role = request.user.role
      const { sourceType, sourceId, name, sport } = fromPlanSchema.parse(request.body)

      let parsedData: unknown = null
      let defaultName = name ?? 'Тренування'

      if (sourceType === 'GROUP_PLAN') {
        const group = await fastify.prisma.exerciseGroup.findUnique({
          where: { id: sourceId },
          include: { plan: { select: { trainerId: true, type: true } } },
        })
        if (!group) return reply.code(404).send({ error: 'ExerciseGroup not found' })
        const athlete = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { trainerId: true, isActive: true },
        })
        const canUseGroup =
          role === 'ADMIN' ||
          group.plan.trainerId === userId ||
          (group.plan.type === 'GROUP' && group.plan.trainerId === athlete?.trainerId && athlete?.isActive)
        if (!canUseGroup) return reply.code(403).send({ error: 'Forbidden' })
        parsedData = group.parsedData ?? parseWorkout(group.rawText)
        defaultName = name ?? group.name
      } else {
        const day = await fastify.prisma.individualPlanDay.findUnique({
          where: { id: sourceId },
          include: { plan: { select: { trainerId: true, athleteId: true } } },
        })
        if (!day) return reply.code(404).send({ error: 'IndividualPlanDay not found' })
        const canUseDay = role === 'ADMIN' || day.plan.trainerId === userId || day.plan.athleteId === userId
        if (!canUseDay) return reply.code(403).send({ error: 'Forbidden' })
        parsedData = day.parsedData ?? (day.rawText ? parseWorkout(day.rawText) : null)
      }

      const steps = parsedDataToSteps(parsedData)
      if (steps.length === 0) {
        return reply.code(422).send({ error: 'No structured data found in this plan' })
      }

      const workout = await fastify.prisma.watchWorkout.create({
        data: {
          creatorId: userId,
          name: defaultName,
          sport,
          steps: steps as unknown as import('@prisma/client').Prisma.InputJsonValue,
          sourceType,
          sourceId,
        },
      })
      reply.code(201)
      return workout
    },
  )

  // GET /api/watch-workouts/:id
  fastify.get(
    '/:id',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }
      const workout = await fastify.prisma.watchWorkout.findUnique({ where: { id } })
      if (!workout) return reply.code(404).send({ error: 'Not found' })
      if (workout.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })
      return workout
    },
  )

  // PUT /api/watch-workouts/:id
  fastify.put(
    '/:id',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }
      const existing = await fastify.prisma.watchWorkout.findUnique({ where: { id } })
      if (!existing) return reply.code(404).send({ error: 'Not found' })
      if (existing.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

      const data = createSchema.parse(request.body)
      const updated = await fastify.prisma.watchWorkout.update({
        where: { id },
        data: {
          name: data.name,
          sport: data.sport,
          steps: data.steps as unknown as import('@prisma/client').Prisma.InputJsonValue,
          notes: data.notes,
        },
      })
      return updated
    },
  )

  // DELETE /api/watch-workouts/:id
  fastify.delete(
    '/:id',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }
      const existing = await fastify.prisma.watchWorkout.findUnique({ where: { id } })
      if (!existing) return reply.code(404).send({ error: 'Not found' })
      if (existing.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })
      await fastify.prisma.watchWorkout.delete({ where: { id } })
      reply.code(204)
    },
  )

  // POST /api/watch-workouts/:id/schedule — add to training calendar
  fastify.post(
    '/:id/schedule',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const role = request.user.role
      const { id } = request.params as { id: string }
      const { date } = request.body as { date: string }
      if (!date) return reply.code(400).send({ error: 'date required' })

      if (role !== 'ATHLETE') {
        return reply.code(403).send({ error: 'Only athletes can add watch workouts to their calendar' })
      }

      const workout = await fastify.prisma.watchWorkout.findUnique({ where: { id } })
      if (!workout) return reply.code(404).send({ error: 'Not found' })
      if (workout.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

      const planDate = new Date(date)
      if (isNaN(planDate.getTime())) return reply.code(400).send({ error: 'Invalid date' })
      const rawText = watchStepsToPlanText(workout.steps as unknown as WatchWorkoutStep[]) || workout.notes || workout.name

      const plan = await fastify.prisma.trainingPlan.create({
        data: {
          trainerId: userId,
          date: planDate,
          type: 'GROUP',
          title: workout.name,
          exerciseGroups: {
            create: [{
              name: workout.name,
              rawText,
              parsedData: (parseWorkout(rawText) ?? undefined) as Prisma.InputJsonValue | undefined,
              order: 0,
            }],
          },
        },
      })

      reply.code(201)
      return { planId: plan.id }
    },
  )

  // GET /api/watch-workouts/:id/export/fit
  fastify.get(
    '/:id/export/fit',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { id } = request.params as { id: string }
      const workout = await fastify.prisma.watchWorkout.findUnique({ where: { id } })
      if (!workout) return reply.code(404).send({ error: 'Not found' })
      if (workout.creatorId !== userId) return reply.code(403).send({ error: 'Forbidden' })

      const steps = workout.steps as unknown as WatchWorkoutStep[]
      const fitBuffer = stepsToFit(workout.name, workout.sport as WatchSport, steps)

      const asciiName = workout.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'workout'
      const encodedName = encodeURIComponent(workout.name.replace(/\s+/g, '_')) + '.fit'
      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${asciiName}.fit"; filename*=UTF-8''${encodedName}`)
        .send(fitBuffer)
    },
  )
}
