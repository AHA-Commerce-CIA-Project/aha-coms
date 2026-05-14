import type { TaxonomyUpsertedPayload } from '@coms-portal/sdk'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { PortalEventHandler } from '../dispatch'

/**
 * `taxonomy.upserted` — portal emits one event per (taxonomyId,
 * batch-of-entries). Spec 07 §Race window guarantees the entire
 * affected set arrives in one envelope, never one-event-per-entry,
 * so a single upsert pass covers the batch atomically.
 *
 * `cachedAt` updates to "now" on every write so future TTL-style
 * staleness checks have a fresh anchor. Prisma's upsert here is
 * one row at a time because Prisma does not surface PostgreSQL's
 * multi-row `INSERT ... ON CONFLICT DO UPDATE` syntax cleanly — the
 * batch size is bounded (one taxonomy's entry-count is in the
 * tens, not thousands), so the per-row cost stays reasonable.
 */
export const handleTaxonomyUpserted: PortalEventHandler = async (body) => {
  const payload = body as TaxonomyUpsertedPayload
  if (!payload.taxonomyId || !Array.isArray(payload.entries) || payload.entries.length === 0) {
    return
  }

  const now = new Date()
  for (const entry of payload.entries) {
    await prisma.taxonomyCache.upsert({
      where: {
        taxonomyId_key: { taxonomyId: payload.taxonomyId, key: entry.key },
      },
      create: {
        taxonomyId: payload.taxonomyId,
        key: entry.key,
        value: entry.value,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        cachedAt: now,
      },
      update: {
        value: entry.value,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        cachedAt: now,
      },
    })
  }
}
