import type { TaxonomyDeletedPayload } from '@coms-portal/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { taxonomyCache } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'

export const handleTaxonomyDeleted: PortalEventHandler = async (body) => {
  const payload = body as TaxonomyDeletedPayload
  if (!payload.taxonomyId || !Array.isArray(payload.keys) || payload.keys.length === 0) {
    return
  }

  await db
    .delete(taxonomyCache)
    .where(
      and(
        eq(taxonomyCache.taxonomyId, payload.taxonomyId),
        inArray(taxonomyCache.key, payload.keys),
      ),
    )
}
