import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'
import {
  verifyIntervalsConnection,
  pushToIntervals,
  deleteIntervalsEvent,
} from '../utils/intervalsExport.js'
import { stepsToFit } from '../utils/watchExport.js'

const connectSchema = z.object({
  apiKey: z.string().min(1),
  athleteId: z.string().min(1),
})

const pushSchema = z.object({
  workoutId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const intervalsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/intervals/status — check if connected
  fastify.get(
    '/status',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request) => {
      const userId = request.user.sub as string
      const conn = await fastify.prisma.intervalsConnection.findUnique({
        where: { userId },
        select: { athleteId: true, createdAt: true },
      })
      return { connected: !!conn, athleteId: conn?.athleteId ?? null, since: conn?.createdAt ?? null }
    },
  )

  // POST /api/intervals/connect — save API key (verify first)
  fastify.post(
    '/connect',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { apiKey, athleteId } = connectSchema.parse(request.body)

      // Verify credentials
      try {
        await verifyIntervalsConnection(apiKey, athleteId)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return reply.status(400).send({ error: `Не вдалося підключитись: ${msg}` })
      }

      await fastify.prisma.intervalsConnection.upsert({
        where: { userId },
        create: { userId, apiKey, athleteId },
        update: { apiKey, athleteId },
      })

      return { ok: true }
    },
  )

  // DELETE /api/intervals/disconnect
  fastify.delete(
    '/disconnect',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request) => {
      const userId = request.user.sub as string
      await fastify.prisma.intervalsConnection.deleteMany({ where: { userId } })
      return { ok: true }
    },
  )

  // POST /api/intervals/push — push a watch workout to Intervals.icu
  fastify.post(
    '/push',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { workoutId, date } = pushSchema.parse(request.body)

      const conn = await fastify.prisma.intervalsConnection.findUnique({ where: { userId } })
      if (!conn) return reply.status(400).send({ error: 'Intervals.icu не підключено' })

      const workout = await fastify.prisma.watchWorkout.findUnique({ where: { id: workoutId } })
      if (!workout) return reply.status(404).send({ error: 'Тренування не знайдено' })
      if (workout.creatorId !== userId) return reply.status(403).send({ error: 'Немає доступу' })

      const steps = workout.steps as WatchWorkoutStep[]
      const fitBuffer = stepsToFit(workout.name, workout.sport as WatchSport, steps)

      try {
        const result = await pushToIntervals({
          apiKey: conn.apiKey,
          athleteId: conn.athleteId,
          name: workout.name,
          sport: workout.sport as WatchSport,
          fitBuffer,
          date,
        })
        const eventId = String(result.id)
        await fastify.prisma.watchWorkout.update({
          where: { id: workoutId },
          data: { icuEventId: eventId },
        })
        return { ok: true, eventId }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return reply.status(502).send({ error: msg })
      }
    },
  )

  // DELETE /api/intervals/event/:eventId — remove event from Intervals.icu calendar
  fastify.delete(
    '/event/:eventId',
    { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) },
    async (request, reply) => {
      const userId = request.user.sub as string
      const { eventId } = request.params as { eventId: string }

      const conn = await fastify.prisma.intervalsConnection.findUnique({ where: { userId } })
      if (!conn) return reply.status(400).send({ error: 'Intervals.icu не підключено' })

      try {
        await deleteIntervalsEvent({ apiKey: conn.apiKey, athleteId: conn.athleteId, eventId })
        // Clear stored eventId from any workout that had it
        await fastify.prisma.watchWorkout.updateMany({
          where: { creatorId: userId, icuEventId: eventId },
          data: { icuEventId: null },
        })
        return { ok: true }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return reply.status(502).send({ error: msg })
      }
    },
  )
}
