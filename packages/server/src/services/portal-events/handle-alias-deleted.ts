import type { AliasDeletedPayload } from '@coms-portal/shared'
import { eq } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { aliasCache } from '@coms/shared/db/schema'
import type { PortalEventHandler } from './dispatch'

export const handleAliasDeleted: PortalEventHandler = async (body) => {
  const payload = body as AliasDeletedPayload
  if (!payload.aliasNormalized) {
    console.warn('[handle-alias-deleted] payload missing aliasNormalized, skipping')
    return
  }

  await db.delete(aliasCache).where(eq(aliasCache.aliasNormalized, payload.aliasNormalized))
}
