import type { FastifyInstance } from 'fastify'
import { stravaOAuthRoutes } from './strava-oauth.js'
import { stravaDataRoutes } from './strava-data.js'

export async function stravaRoutes(fastify: FastifyInstance) {
  await fastify.register(stravaOAuthRoutes)
  await fastify.register(stravaDataRoutes)
}
