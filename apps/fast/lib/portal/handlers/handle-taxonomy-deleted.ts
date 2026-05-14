import type { TaxonomyDeletedPayload } from '@coms-portal/sdk'
import { prisma } from '@/lib/db'
import type { PortalEventHandler } from '../dispatch'

/**
 * `taxonomy.deleted` — portal emits the keys removed under a
 * taxonomy. `deleteMany` with an `in` filter drops the rows in one
 * round-trip; rows that no longer exist are silently no-op'd by
 * the SQL semantics.
 */
export const handleTaxonomyDeleted: PortalEventHandler = async (body) => {
  const payload = body as TaxonomyDeletedPayload
  if (!payload.taxonomyId || !Array.isArray(payload.keys) || payload.keys.length === 0) {
    return
  }

  await prisma.taxonomyCache.deleteMany({
    where: {
      taxonomyId: payload.taxonomyId,
      key: { in: payload.keys },
    },
  })
}
