import { eq, sql } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { pendingAliasResolution } from '@coms/shared/db/schema'

export interface PendingAliasRow {
  id: string
  sheetId: string
  sheetRowNumber: number
  rawName: string
  rawNameNormalized: string
  rawPayload: unknown
}

export async function drainPendingAliasQueue(
  rawNameNormalized: string,
  _portalSub: string,
): Promise<{ replayed: number }> {
  const rows = await db
    .select({
      id: pendingAliasResolution.id,
      sheetId: pendingAliasResolution.sheetId,
      sheetRowNumber: pendingAliasResolution.sheetRowNumber,
      rawName: pendingAliasResolution.rawName,
      rawNameNormalized: pendingAliasResolution.rawNameNormalized,
      rawPayload: pendingAliasResolution.rawPayload,
    })
    .from(pendingAliasResolution)
    .where(eq(pendingAliasResolution.rawNameNormalized, rawNameNormalized))

  if (rows.length === 0) return { replayed: 0 }

  await db
    .update(pendingAliasResolution)
    .set({
      status: 'resolved',
      lastRetryAt: new Date(),
      retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
    })
    .where(eq(pendingAliasResolution.rawNameNormalized, rawNameNormalized))

  return { replayed: rows.length }
}
