import type { TaxonomyUpsertedPayload } from '@coms-portal/shared'
import { sql } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { taxonomyCache } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'

export const handleTaxonomyUpserted: PortalEventHandler = async (body) => {
  const payload = body as TaxonomyUpsertedPayload
  if (!payload.taxonomyId || !Array.isArray(payload.entries) || payload.entries.length === 0) {
    return
  }

  const rows = payload.entries.map((entry) => ({
    taxonomyId: payload.taxonomyId,
    key: entry.key,
    value: entry.value,
    metadata: entry.metadata ?? null,
  }))

  await db
    .insert(taxonomyCache)
    .values(rows)
    .onConflictDoUpdate({
      target: [taxonomyCache.taxonomyId, taxonomyCache.key],
      set: {
        value: sql`excluded.value`,
        metadata: sql`excluded.metadata`,
        cachedAt: new Date(),
      },
    })
}
