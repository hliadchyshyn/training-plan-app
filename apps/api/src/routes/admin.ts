import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { BCRYPT_ROUNDS } from '../utils/constants.js'
import { generateUniqueInviteCode } from '../utils/invite-codes.js'

const updateRoleSchema = z.object({
  role: z.enum(['ATHLETE', 'TRAINER', 'ADMIN']),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8),
})

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireRole(['ADMIN']))

  fastify.get('/users', async () => {
    return fastify.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.put('/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateRoleSchema.parse(request.body)

    const user = await fastify.prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    let inviteCodeUpdate: string | null | undefined
    let trainerIdUpdate: string | null | undefined

    if (body.role === 'TRAINER' && !user.inviteCode) {
      inviteCodeUpdate = await generateUniqueInviteCode(fastify)
    }

    if (body.role === 'TRAINER' && user.trainerId) {
      trainerIdUpdate = null
    }

    const updated = await fastify.prisma.user.update({
      where: { id },
      data: {
        role: body.role,
        ...(inviteCodeUpdate !== undefined ? { inviteCode: inviteCodeUpdate } : {}),
        ...(trainerIdUpdate !== undefined ? { trainerId: trainerIdUpdate } : {}),
      },
      select: { id: true, email: true, name: true, role: true, inviteCode: true },
    })

    return updated
  })

  fastify.put('/users/:id/password', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = resetPasswordSchema.parse(request.body)

    const user = await fastify.prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
    await fastify.prisma.user.update({
      where: { id },
      data: { passwordHash },
    })

    return { ok: true }
  })
}
