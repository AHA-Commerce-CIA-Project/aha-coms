import type { AliasUpdatedPayload } from '@coms-portal/sdk'
import { eq } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { aliasCache } from '@coms/shared/db/schema'
import { drainPendingAliasQueue } from '../sheet-sync-pending'
import type { PortalEventHandler } from './dispatch'

export const handleAliasUpdated: PortalEventHandler = async (body) => {
  const payload = body as AliasUpdatedPayload
  if (!payload.aliasNormalized || !payload.portalSub) {
    console.warn('[handle-alias-updated] payload missing required fields, skipping')
    return
  }

  await db.delete(aliasCache).where(eq(aliasCache.aliasNormalized, payload.aliasNormalized))

  await drainPendingAliasQueue(payload.aliasNormalized, payload.portalSub)
}
