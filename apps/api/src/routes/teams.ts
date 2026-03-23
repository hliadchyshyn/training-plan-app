import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ATHLETE_SELECT } from '../utils/db.js'

const createTeamSchema = z.object({ name: z.string().min(1) })
const addMemberSchema = z.object({ athleteId: z.string().uuid() })

async function verifyTeamOwner(
  fastify: Parameters<FastifyPluginAsync>[0],
  teamId: string,
  trainerId: string,
) {
  const team = await fastify.prisma.trainerTeam.findUnique({ where: { id: teamId } })
  if (!team || team.trainerId !== trainerId) return null
  return team
}

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireRole(['TRAINER', 'ADMIN']))

  fastify.get('/athletes', async () => {
    return fastify.prisma.user.findMany({
      where: { role: { in: ['ATHLETE', 'TRAINER'] } },
      select: { ...ATHLETE_SELECT, role: true },
      orderBy: { name: 'asc' },
    })
  })

  fastify.post('/', async (request, reply) => {
    const body = createTeamSchema.parse(request.body)
    const team = await fastify.prisma.trainerTeam.create({
      data: { trainerId: request.user.sub, name: body.name },
    })
    return reply.status(201).send(team)
  })

  fastify.get('/', async (request) => {
    return fastify.prisma.trainerTeam.findMany({
      where: { trainerId: request.user.sub },
      include: {
        members: { include: { athlete: { select: ATHLETE_SELECT } } },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.get('/:id/athletes', async (request, reply) => {
    const { id } = request.params as { id: string }

    const [team, currentMemberIds] = await Promise.all([
      fastify.prisma.trainerTeam.findUnique({ where: { id } }),
      fastify.prisma.teamMember.findMany({ where: { teamId: id }, select: { athleteId: true } }),
    ])

    if (!team || team.trainerId !== request.user.sub) {
      return reply.status(404).send({ error: 'Team not found' })
    }

    return fastify.prisma.user.findMany({
      where: { id: { notIn: currentMemberIds.map((m) => m.athleteId) }, role: { not: 'ADMIN' } },
      select: { ...ATHLETE_SELECT, role: true },
      orderBy: { name: 'asc' },
    })
  })

  fastify.post('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = addMemberSchema.parse(request.body)

    const team = await verifyTeamOwner(fastify, id, request.user.sub)
    if (!team) return reply.status(404).send({ error: 'Team not found' })

    const member = await fastify.prisma.teamMember.upsert({
      where: { teamId_athleteId: { teamId: id, athleteId: body.athleteId } },
      create: { teamId: id, athleteId: body.athleteId },
      update: {},
    })
    return reply.status(201).send(member)
  })

  fastify.delete('/:id/members/:athleteId', async (request, reply) => {
    const { id, athleteId } = request.params as { id: string; athleteId: string }

    const team = await verifyTeamOwner(fastify, id, request.user.sub)
    if (!team) return reply.status(404).send({ error: 'Team not found' })

    await fastify.prisma.teamMember.delete({
      where: { teamId_athleteId: { teamId: id, athleteId } },
    })
    return reply.status(204).send()
  })
}
