import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
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

const server = Fastify({ logger: true })

await server.register(cors, {
  origin: process.env.FRONTEND_URL ?? true,
  credentials: true,
})
await server.register(cookie)
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

server.setErrorHandler((error, _request, reply) => {
  // Zod validation errors come through as plain Errors with JSON message
  if (error.name === 'ZodError' || (error.message?.startsWith('[') && error.message?.includes('"validation"'))) {
    return reply.status(400).send({ error: 'Validation error', details: JSON.parse(error.message) })
  }
  server.log.error(error)
  const statusCode = error.statusCode ?? 500
  reply.status(statusCode).send({
    error: error.message ?? 'Internal Server Error',
  })
})

try {
  await server.listen({ port: 3001, host: '0.0.0.0' })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
