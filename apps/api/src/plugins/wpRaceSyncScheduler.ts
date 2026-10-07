import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { createWpRaceFetcher, getWpBridgeConfig } from '../utils/wpRaceClient.js'
import { reconcileWpRaces } from '../utils/wpRaceSync.js'

const HOUR_MS = 60 * 60 * 1000
/** Every Nth hourly run is a full sweep that also removes rows deleted in WP. */
const FULL_SWEEP_EVERY = 24

/**
 * Safety net for the WP push bridge: hourly incremental pull, daily full sweep.
 * Disabled when WP_BASE_URL / WP_BRIDGE_SECRET aren't set.
 */
const plugin: FastifyPluginAsync = async (fastify) => {
  const config = getWpBridgeConfig()
  if (!config) {
    fastify.log.info('WP race sync disabled (WP_BASE_URL / WP_BRIDGE_SECRET not set)')
    return
  }

  const fetchPage = createWpRaceFetcher(config)
  let run = 0
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    const full = run % FULL_SWEEP_EVERY === 0
    run++
    try {
      const result = await reconcileWpRaces(fastify.prisma, fetchPage, {
        full,
        log: (msg, extra) => fastify.log.warn(extra ?? {}, msg),
      })
      fastify.log.info({ ...result, full }, 'WP race sync finished')
    } catch (err) {
      fastify.log.error({ err, full }, 'WP race sync failed')
    } finally {
      running = false
    }
  }

  let timer: NodeJS.Timeout | undefined
  fastify.addHook('onReady', async () => {
    // First run is a full sweep shortly after boot, then hourly.
    setTimeout(() => void tick(), 30_000).unref()
    timer = setInterval(() => void tick(), HOUR_MS)
    timer.unref()
  })
  fastify.addHook('onClose', async () => {
    if (timer) clearInterval(timer)
  })
}

export const wpRaceSyncScheduler = fp(plugin, { name: 'wp-race-sync-scheduler', dependencies: ['db'] })
