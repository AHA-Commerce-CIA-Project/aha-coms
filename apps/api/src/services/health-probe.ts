import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema'
import { logger } from '~/logger'

export async function probeAppHealth(app: { id: string; url: string; slug: string }): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  error?: string
}> {
  const healthUrl = new URL('/api/health', app.url).toString()

  try {
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) return { status: 'healthy' }
    if (res.status >= 500) return { status: 'unhealthy', error: `HTTP ${res.status}` }
    return { status: 'degraded', error: `HTTP ${res.status}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'unhealthy', error: message }
  }
}

export async function probeAllApps(): Promise<void> {
  const apps = await db
    .select({ id: appRegistry.id, url: appRegistry.url, slug: appRegistry.slug })
    .from(appRegistry)
    .where(eq(appRegistry.status, 'active'))

  const results = await Promise.allSettled(
    apps.map(async (app) => {
      const result = await probeAppHealth(app)
      await db.update(appRegistry).set({
        healthStatus: result.status,
        lastHealthCheckAt: new Date(),
        lastHealthError: result.error ?? null,
        lastVerifiedAt: result.status === 'healthy' ? new Date() : undefined,
      }).where(eq(appRegistry.id, app.id))
    })
  )

  const healthy = results.filter(r => r.status === 'fulfilled').length
  logger.info({ total: apps.length, healthy }, '[health-probe] app health check completed')
}

export interface HealthProbeHandle {
  stop: () => void
}

export function startHealthProbeInterval(intervalMs = 60_000): HealthProbeHandle {
  let timer: ReturnType<typeof setInterval> | null = null

  // Run once immediately, then on interval
  probeAllApps().catch(err => logger.error({ err }, '[health-probe] initial probe error'))

  timer = setInterval(() => {
    probeAllApps().catch(err => logger.error({ err }, '[health-probe] probe error'))
  }, intervalMs)

  return {
    stop: () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
