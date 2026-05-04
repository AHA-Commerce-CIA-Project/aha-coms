import { Elysia } from 'elysia'
import { eq, sql } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import {
  deactivatedUserIngestAudit,
  pendingAliasResolution,
} from '@coms/shared/db/schema'
import { resolveAliasesBatch } from '../lib/portal-api-client'
import { verifyGoogleIdToken } from '../lib/oidc'

interface SweepReport {
  scanned: number
  uniqueNames: number
  resolvedActive: number
  resolvedTombstoned: number
  unresolved: number
  errors: string[]
}

export const adminPendingAliasesRoute = new Elysia().post(
  '/admin/pending-aliases/sweep',
  async ({ request, set }) => {
    const portalSAEmail = process.env.PORTAL_SERVICE_ACCOUNT_EMAIL
    const selfAudience = process.env.SELF_PUBLIC_URL
    if (!portalSAEmail || !selfAudience) {
      console.error('[admin-pending-aliases] auth not configured')
      set.status = 500
      return { message: 'auth not configured' }
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      set.status = 401
      return { message: 'missing bearer token' }
    }

    try {
      await verifyGoogleIdToken({
        idToken: authHeader.slice('Bearer '.length),
        expectedAudience: selfAudience,
        expectedSAEmail: portalSAEmail,
      })
    } catch (err) {
      console.warn(`[admin-pending-aliases] OIDC verification failed: ${(err as Error).message}`)
      set.status = 401
      return { message: 'invalid bearer token' }
    }

    return await sweepPendingAliases()
  },
)

export async function sweepPendingAliases(): Promise<SweepReport> {
  const pending = await db
    .select({
      id: pendingAliasResolution.id,
      sheetId: pendingAliasResolution.sheetId,
      sheetRowNumber: pendingAliasResolution.sheetRowNumber,
      rawNameNormalized: pendingAliasResolution.rawNameNormalized,
      rawPayload: pendingAliasResolution.rawPayload,
    })
    .from(pendingAliasResolution)
    .where(eq(pendingAliasResolution.status, 'pending'))

  const report: SweepReport = {
    scanned: pending.length,
    uniqueNames: 0,
    resolvedActive: 0,
    resolvedTombstoned: 0,
    unresolved: 0,
    errors: [],
  }

  if (pending.length === 0) return report

  const uniqueNames = Array.from(new Set(pending.map((p) => p.rawNameNormalized)))
  report.uniqueNames = uniqueNames.length

  const BATCH_SIZE = 1000
  const resolvedMap = new Map<
    string,
    { portalSub: string; tombstoned: boolean }
  >()
  const unresolvedSet = new Set<string>()

  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE)
    try {
      const result = await resolveAliasesBatch({ rawNames: batch })
      for (const r of result.resolved) {
        resolvedMap.set(r.rawNameNormalized, {
          portalSub: r.portalSub,
          tombstoned: r.tombstoned,
        })
      }
      for (const u of result.unresolved) unresolvedSet.add(u)
    } catch (err) {
      report.errors.push(`batch ${i}-${i + batch.length}: ${(err as Error).message}`)
    }
  }

  for (const row of pending) {
    const resolution = resolvedMap.get(row.rawNameNormalized)
    if (resolution?.tombstoned) {
      await db.insert(deactivatedUserIngestAudit).values({
        sheetId: row.sheetId,
        sheetRowNumber: row.sheetRowNumber,
        portalSub: resolution.portalSub,
        rawPayload: row.rawPayload,
      })
      await db
        .update(pendingAliasResolution)
        .set({
          status: 'tombstoned',
          lastRetryAt: new Date(),
          retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
        })
        .where(eq(pendingAliasResolution.id, row.id))
      report.resolvedTombstoned += 1
    } else if (resolution) {
      await db
        .update(pendingAliasResolution)
        .set({
          status: 'resolved',
          lastRetryAt: new Date(),
          retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
        })
        .where(eq(pendingAliasResolution.id, row.id))
      report.resolvedActive += 1
    } else if (unresolvedSet.has(row.rawNameNormalized)) {
      await db
        .update(pendingAliasResolution)
        .set({
          lastRetryAt: new Date(),
          retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
        })
        .where(eq(pendingAliasResolution.id, row.id))
      report.unresolved += 1
    }
  }

  return report
}
