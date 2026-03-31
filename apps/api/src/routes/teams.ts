import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ATHLETE_SELECT } from '../utils/db.js'

const toggleActiveSchema = z.object({ isActive: z.boolean() })

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireRole(['TRAINER', 'ADMIN']))

  // GET /api/teams/athletes — list my athletes
  fastify.get('/athletes', async (request) => {
    const trainerId = request.user.sub
    return fastify.prisma.user.findMany({
      where: { trainerId },
      select: { ...ATHLETE_SELECT, role: true, isActive: true },
      orderBy: { name: 'asc' },
    })
  })

  // PUT /api/teams/athletes/:id/active — toggle athlete access
  fastify.put('/athletes/:id/active', async (request, reply) => {
    const trainerId = request.user.sub
    const { id } = request.params as { id: string }
    const { isActive } = toggleActiveSchema.parse(request.body)

    const athlete = await fastify.prisma.user.findUnique({ where: { id } })
    if (!athlete || athlete.trainerId !== trainerId) {
      return reply.status(404).send({ error: 'Athlete not found' })
    }

    await fastify.prisma.user.update({ where: { id }, data: { isActive } })
    return { ok: true }
  })

  // DELETE /api/teams/athletes/:id — remove athlete from my roster
  fastify.delete('/athletes/:id', async (request, reply) => {
    const trainerId = request.user.sub
    const { id } = request.params as { id: string }

    const athlete = await fastify.prisma.user.findUnique({ where: { id } })
    if (!athlete || athlete.trainerId !== trainerId) {
      return reply.status(404).send({ error: 'Athlete not found' })
    }

    await fastify.prisma.user.update({ where: { id }, data: { trainerId: null, isActive: true } })
    return reply.status(204).send()
  })
}
