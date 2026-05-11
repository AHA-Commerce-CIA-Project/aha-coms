import { eq } from 'drizzle-orm'
import { systemSettings } from '@coms/shared/db/schema'
import { getDb } from '../repositories/base'

type PointImpactSettings = {
  bintangPointImpact: number
  penaltiPointImpact: number
}

let cached: PointImpactSettings | null = null
let cachedAt = 0
const TTL_MS = 60_000 // 60 seconds

/**
 * Returns bintang/penalti point impact settings from an in-memory cache.
 * Cache is shared across all requests within the same Cloud Run instance
 * and refreshes every 60 seconds. Eliminates 2 DB queries per dashboard
 * and leaderboard request.
 *
 * Uses the default pool (no RLS) since system_settings is not branch-scoped.
 */
export async function getPointImpactSettings(): Promise<PointImpactSettings> {
  const now = Date.now()
  if (cached && now - cachedAt < TTL_MS) return cached

  const db = getDb()
  const [bintangRow, penaltiRow] = await Promise.all([
    db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, 'bintang_point_impact')).limit(1),
    db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, 'penalti_point_impact')).limit(1),
  ])

  cached = {
    bintangPointImpact: (bintangRow[0]?.value as number) ?? 10,
    penaltiPointImpact: (penaltiRow[0]?.value as number) ?? 5,
  }
  cachedAt = now
  return cached
}

/** Force-invalidate after an admin updates settings. */
export function invalidatePointImpactCache(): void {
  cached = null
  cachedAt = 0
}
