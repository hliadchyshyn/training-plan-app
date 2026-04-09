import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { parseWorkout } from '../parsers/workout.js'

const trainingWebhookSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endurance: z.object({
    tasks: z.array(z.string()),
    comments: z.array(z.string()),
  }),
  sprint: z.object({
    tasks: z.array(z.string()),
    comments: z.array(z.string()),
  }),
  commentAthletes: z.string().optional(),
  commentCoaches: z.string().optional(),
})

function buildGroups(
  endurance: { tasks: string[]; comments: string[] },
  sprint: { tasks: string[]; comments: string[] },
) {
  const groups: Array<{ name: string; rawText: string; order: number }> = []
  let order = 0

  endurance.tasks.forEach((task, i) => {
    if (task.trim()) {
      groups.push({ name: `Витривалість ${i + 1}`, rawText: task.trim(), order: order++ })
    }
  })

  sprint.tasks.forEach((task, i) => {
    if (task.trim()) {
      groups.push({ name: `Спринт ${i + 1}`, rawText: task.trim(), order: order++ })
    }
  })

  return groups
}

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/training', async (request, reply) => {
    const apiKey = process.env.WEBHOOK_API_KEY
    if (!apiKey || request.headers['x-api-key'] !== apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const trainerId = process.env.WEBHOOK_TRAINER_ID
    if (!trainerId) {
      return reply.status(500).send({ error: 'Webhook trainer not configured' })
    }

    const body = trainingWebhookSchema.parse(request.body)
    const groups = buildGroups(body.endurance, body.sprint)

    if (groups.length === 0) {
      return reply.status(400).send({ error: 'No training groups provided' })
    }

    const plan = await fastify.prisma.trainingPlan.create({
      data: {
        trainerId,
        date: new Date(body.date),
        type: 'GROUP',
        notes: body.commentAthletes || undefined,
        exerciseGroups: {
          create: groups.map((g) => ({
            name: g.name,
            order: g.order,
            rawText: g.rawText,
            parsedData: (parseWorkout(g.rawText) ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      include: { exerciseGroups: true },
    })

    return reply.status(201).send({ success: true, plan_id: plan.id })
  })
}
