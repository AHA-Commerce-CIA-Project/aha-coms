import type { AliasResolvedPayload } from '@coms-portal/shared'
import { db } from '@coms/shared/db'
import { aliasCache } from '@coms/shared/db/schema'
import { drainPendingAliasQueue } from '../sheet-sync-pending'
import type { PortalEventHandler } from './dispatch'

export const handleAliasResolved: PortalEventHandler = async (body) => {
  const payload = body as AliasResolvedPayload
  if (!payload.aliasNormalized || !payload.portalSub) {
    console.warn('[handle-alias-resolved] payload missing required fields, skipping')
    return
  }

  await db
    .insert(aliasCache)
    .values({
      aliasNormalized: payload.aliasNormalized,
      aliasId: payload.aliasId,
      portalSub: payload.portalSub,
      isPrimary: payload.isPrimary,
      tombstoned: false,
    })
    .onConflictDoUpdate({
      target: aliasCache.aliasNormalized,
      set: {
        aliasId: payload.aliasId,
        portalSub: payload.portalSub,
        isPrimary: payload.isPrimary,
        tombstoned: false,
        deactivatedAt: null,
        cachedAt: new Date(),
      },
    })

  await drainPendingAliasQueue(payload.aliasNormalized, payload.portalSub)
}
