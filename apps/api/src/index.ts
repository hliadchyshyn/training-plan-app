import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { Prisma } from '@prisma/client'
import { dbPlugin } from './plugins/db.js'
import { authPlugin } from './plugins/auth.js'
import { authRoutes } from './routes/auth.js'
import { adminRoutes } from './routes/admin.js'
import { teamRoutes } from './routes/teams.js'
import { planRoutes } from './routes/plans.js'
import { athleteRoutes } from './routes/athlete.js'
import { stravaRoutes } from './routes/strava.js'
import { watchWorkoutsRoutes } from './routes/watchWorkouts.js'
import { intervalsRoutes } from './routes/intervals.js'
import { templatesRoutes } from './routes/templates.js'

const server = Fastify({ logger: true })

const frontendUrl = process.env.FRONTEND_URL
if (!frontendUrl && process.env.NODE_ENV === 'production') {
  throw new Error('FRONTEND_URL environment variable is required in production')
}
await server.register(cors, {
  origin: frontendUrl ?? true,
  credentials: true,
})
await server.register(cookie)
await server.register(rateLimit, { global: false })
await server.register(dbPlugin)
await server.register(authPlugin)

await server.register(authRoutes, { prefix: '/api/auth' })
await server.register(adminRoutes, { prefix: '/api/admin' })
await server.register(teamRoutes, { prefix: '/api/teams' })
await server.register(planRoutes, { prefix: '/api/plans' })
await server.register(athleteRoutes, { prefix: '/api/my' })
await server.register(stravaRoutes, { prefix: '/api/strava' })
await server.register(watchWorkoutsRoutes, { prefix: '/api/watch-workouts' })
await server.register(intervalsRoutes, { prefix: '/api/intervals' })
await server.register(templatesRoutes, { prefix: '/api/templates' })

server.setErrorHandler((error, _request, reply) => {
  // Zod validation errors come through as plain Errors with JSON message
  if (error.name === 'ZodError' || (error.message?.startsWith('[') && error.message?.includes('"validation"'))) {
    try {
      return reply.status(400).send({ error: 'Validation error', details: JSON.parse(error.message) })
    } catch {
      return reply.status(400).send({ error: 'Validation error' })
    }
  }
  server.log.error(error)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return reply.status(409).send({ error: 'Conflict' })
    return reply.status(500).send({ error: 'Database error' })
  }
  const statusCode = error.statusCode ?? 500
  reply.status(statusCode).send({
    error: statusCode >= 500 ? 'Internal Server Error' : (error.message ?? 'Internal Server Error'),
  })
})

try {
  await server.listen({ port: 3001, host: '0.0.0.0' })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
