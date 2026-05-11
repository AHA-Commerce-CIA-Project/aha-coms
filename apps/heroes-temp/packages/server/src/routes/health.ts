import { Elysia } from 'elysia'
import { db } from '@coms/shared/db'
import { sql } from 'drizzle-orm'
import type { ApiResult } from '@coms/shared/types'

type HealthData = {
  status: 'ok' | 'degraded'
  timestamp: string
  db: 'connected' | 'disconnected'
}

export const health = new Elysia().get('/health', async ({ set }) => {
  let dbStatus: HealthData['db'] = 'disconnected'

  try {
    await db.execute(sql`SELECT 1`)
    dbStatus = 'connected'
  } catch (e) {
    console.error('[health] DB connection failed:', e)
  }

  const data: HealthData = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbStatus,
  }

  if (dbStatus !== 'connected') set.status = 503

  return { success: true, data, error: null } satisfies ApiResult<HealthData>
})
