import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  WP_BRIDGE_SIGNATURE_HEADER,
  WP_BRIDGE_TIMESTAMP_HEADER,
  verifyWpBridgeSignature,
} from '../utils/wpBridgeAuth.js'
import { applyWpRaceEvents, parseWpRaceEvents, reconcileWpRaces, wpRaceEventsBodySchema } from '../utils/wpRaceSync.js'
import { createWpRaceFetcher, getWpBridgeConfig } from '../utils/wpRaceClient.js'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
}

const reconcileSchema = z.object({ full: z.boolean().default(false) }).default({})

/**
 * Server-to-server endpoints for tsclub.com.ua (WordPress). Requests are
 * authenticated with an HMAC over the raw body (see wpBridgeAuth), not JWT.
 */
export const wpIntegrationRoutes: FastifyPluginAsync = async (fastify) => {
  // HMAC needs the exact bytes WP signed — keep the raw body (scoped to this plugin).
  fastify.removeContentTypeParser('application/json')
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const raw = body as string
    request.rawBody = raw
    if (raw === '') return done(null, undefined)
    try {
      done(null, JSON.parse(raw))
    } catch {
      done(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }), undefined)
    }
  })

  // POST /api/integrations/wp/events — registrations/results changed in WP
  fastify.post(
    '/events',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const secret = process.env.WP_BRIDGE_SECRET
      if (!secret) return reply.status(503).send({ error: 'WP bridge is not configured' })

      const signed = verifyWpBridgeSignature({
        secret,
        timestamp: request.headers[WP_BRIDGE_TIMESTAMP_HEADER] as string | undefined,
        signature: request.headers[WP_BRIDGE_SIGNATURE_HEADER] as string | undefined,
        payload: request.rawBody ?? '',
      })
      if (!signed) return reply.status(401).send({ error: 'Invalid signature' })

      const envelope = wpRaceEventsBodySchema.safeParse(request.body)
      if (!envelope.success) return reply.status(400).send({ error: 'Validation error' })

      const { valid, rejected } = parseWpRaceEvents(envelope.data.events)
      if (rejected.length) request.log.warn({ rejected }, 'WP race events: invalid events skipped')

      const result = valid.length
        ? await fastify.prisma.$transaction((tx) => applyWpRaceEvents(tx, valid))
        : { applied: 0, skipped: 0 }
      request.log.info({ ...result, rejected: rejected.length, received: envelope.data.events.length }, 'WP race events applied')
      return { success: true, data: { ...result, rejected: rejected.length } }
    },
  )

  // POST /api/integrations/wp/reconcile — admin-triggered pull from WP
  fastify.post(
    '/reconcile',
    {
      preHandler: fastify.requireRole(['ADMIN']),
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const config = getWpBridgeConfig()
      if (!config) return reply.status(503).send({ error: 'WP bridge is not configured' })

      const { full } = reconcileSchema.parse(request.body ?? {})
      try {
        const result = await reconcileWpRaces(fastify.prisma, createWpRaceFetcher(config), {
          full,
          log: (msg, extra) => request.log.warn(extra ?? {}, msg),
        })
        return { success: true, data: result }
      } catch (err) {
        request.log.error({ err }, 'WP race reconcile failed')
        return reply.status(502).send({ error: 'Не вдалося отримати дані з tsclub.com.ua' })
      }
    },
  )
}
