import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@training-plan/shared'

export interface JwtPayload {
  sub: string
  email: string
  role: Role
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret',
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate(
    'requireRole',
    (roles: Role[]) => async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
      if (!roles.includes(request.user.role)) {
        return reply.status(403).send({ error: 'Forbidden' })
      }
    },
  )
}

export const authPlugin = fp(plugin, { name: 'auth' })
