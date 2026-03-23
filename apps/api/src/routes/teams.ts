import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const createTeamSchema = z.object({
  name: z.string().min(1),
})

const addMemberSchema = z.object({
  athleteId: z.string().uuid(),
})

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireRole(['TRAINER', 'ADMIN']))

  // All athletes accessible to a trainer (for individual plan assignment)
  fastify.get('/athletes', async () => {
    return fastify.prisma.user.findMany({
      where: { role: { in: ['ATHLETE', 'TRAINER'] } },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })
  })

  fastify.post('/', async (request, reply) => {
    const body = createTeamSchema.parse(request.body)
    const trainerId = request.user.sub

    const team = await fastify.prisma.trainerTeam.create({
      data: { trainerId, name: body.name },
    })
    return reply.status(201).send(team)
  })

  fastify.get('/', async (request) => {
    const trainerId = request.user.sub
    return fastify.prisma.trainerTeam.findMany({
      where: { trainerId },
      include: {
        members: {
          include: { athlete: { select: { id: true, email: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  // All registered users NOT yet in this team
  fastify.get('/:id/athletes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const trainerId = request.user.sub

    const team = await fastify.prisma.trainerTeam.findUnique({ where: { id } })
    if (!team || team.trainerId !== trainerId) {
      return reply.status(404).send({ error: 'Team not found' })
    }

    const currentMemberIds = (
      await fastify.prisma.teamMember.findMany({
        where: { teamId: id },
        select: { athleteId: true },
      })
    ).map((m) => m.athleteId)

    return fastify.prisma.user.findMany({
      where: {
        id: { notIn: currentMemberIds },
        role: { not: 'ADMIN' },
      },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })
  })

  fastify.post('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = addMemberSchema.parse(request.body)
    const trainerId = request.user.sub

    const team = await fastify.prisma.trainerTeam.findUnique({ where: { id } })
    if (!team || team.trainerId !== trainerId) {
      return reply.status(404).send({ error: 'Team not found' })
    }

    const member = await fastify.prisma.teamMember.upsert({
      where: { teamId_athleteId: { teamId: id, athleteId: body.athleteId } },
      create: { teamId: id, athleteId: body.athleteId },
      update: {},
    })
    return reply.status(201).send(member)
  })

  fastify.delete('/:id/members/:athleteId', async (request, reply) => {
    const { id, athleteId } = request.params as { id: string; athleteId: string }
    const trainerId = request.user.sub

    const team = await fastify.prisma.trainerTeam.findUnique({ where: { id } })
    if (!team || team.trainerId !== trainerId) {
      return reply.status(404).send({ error: 'Team not found' })
    }

    await fastify.prisma.teamMember.delete({
      where: { teamId_athleteId: { teamId: id, athleteId } },
    })
    return reply.status(204).send()
  })
}
