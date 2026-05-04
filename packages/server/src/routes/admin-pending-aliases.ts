import { Elysia } from 'elysia'
import { eq, sql } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import {
  deactivatedUserIngestAudit,
  pendingAliasResolution,
} from '@coms/shared/db/schema'
import { resolveAliasesBatch } from '../lib/portal-api-client'
import { verifyGoogleIdToken } from '../lib/oidc'
import { drainPendingAliasQueue } from '../services/sheet-sync-pending'

export interface SweepReport {
  scanned: number
  uniqueNames: number
  resolvedActive: number
  resolvedTombstoned: number
  unresolved: number
  errors: string[]
}

// ── Dependency injection seam (for tests) ────────────────────────────────────

export type ResolvedEntry = {
  rawNameNormalized: string
  aliasId: string
  portalSub: string
  isPrimary: boolean
  tombstoned: boolean
  deactivatedAt: string | null
}

export type SweepDeps = {
  fetchAllPending: () => Promise<
    Array<{
      id: string
      sheetId: string
      sheetRowNumber: number
      rawNameNormalized: string
      rawPayload: unknown
    }>
  >
  resolveNames: (input: { rawNames: string[] }) => Promise<{
    resolved: ResolvedEntry[]
    unresolved: string[]
  }>
  drainQueue: (rawNameNormalized: string, portalSub: string) => Promise<{ replayed: number }>
  insertTombstoned: (opts: {
    id: string
    sheetId: string
    sheetRowNumber: number
    portalSub: string
    rawPayload: unknown
  }) => Promise<void>
  markUnresolved: (id: string) => Promise<void>
  markTombstoned: (id: string) => Promise<void>
}

// ── Default DB implementations ───────────────────────────────────────────────

function defaultFetchAllPending() {
  return db
    .select({
      id: pendingAliasResolution.id,
      sheetId: pendingAliasResolution.sheetId,
      sheetRowNumber: pendingAliasResolution.sheetRowNumber,
      rawNameNormalized: pendingAliasResolution.rawNameNormalized,
      rawPayload: pendingAliasResolution.rawPayload,
    })
    .from(pendingAliasResolution)
    .where(eq(pendingAliasResolution.status, 'pending'))
}

async function defaultInsertTombstoned(opts: {
  id: string
  sheetId: string
  sheetRowNumber: number
  portalSub: string
  rawPayload: unknown
}) {
  await db.insert(deactivatedUserIngestAudit).values({
    sheetId: opts.sheetId,
    sheetRowNumber: opts.sheetRowNumber,
    portalSub: opts.portalSub,
    rawPayload: opts.rawPayload,
  })
}

async function defaultMarkUnresolved(id: string) {
  await db
    .update(pendingAliasResolution)
    .set({
      lastRetryAt: new Date(),
      retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
    })
    .where(eq(pendingAliasResolution.id, id))
}

async function defaultMarkTombstoned(id: string) {
  await db
    .update(pendingAliasResolution)
    .set({
      status: 'tombstoned',
      lastRetryAt: new Date(),
      retryCount: sql`${pendingAliasResolution.retryCount} + 1`,
    })
    .where(eq(pendingAliasResolution.id, id))
}

// ── sweepPendingAliasesWithDeps (injectable — for tests) ─────────────────────

export async function sweepPendingAliasesWithDeps(deps: SweepDeps): Promise<SweepReport> {
  const pending = await deps.fetchAllPending()

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

  const ALIAS_BATCH_SIZE = 1000
  const resolvedMap = new Map<string, { portalSub: string; tombstoned: boolean }>()
  const unresolvedSet = new Set<string>()

  // Resolve names in batches
  for (let i = 0; i < uniqueNames.length; i += ALIAS_BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + ALIAS_BATCH_SIZE)
    try {
      const result = await deps.resolveNames({ rawNames: batch })
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

  // Route each pending row
  for (const row of pending) {
    const resolution = resolvedMap.get(row.rawNameNormalized)

    if (resolution?.tombstoned) {
      // Outcome 2: tombstoned — write audit, mark tombstoned
      await deps.insertTombstoned({
        id: row.id,
        sheetId: row.sheetId,
        sheetRowNumber: row.sheetRowNumber,
        portalSub: resolution.portalSub,
        rawPayload: row.rawPayload,
      })
      await deps.markTombstoned(row.id)
      report.resolvedTombstoned += 1
    } else if (resolution) {
      // Outcome 1: active resolved — replay domain rows via drain
      try {
        await deps.drainQueue(row.rawNameNormalized, resolution.portalSub)
        report.resolvedActive += 1
      } catch (err) {
        report.errors.push(
          `drain ${row.rawNameNormalized}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else if (unresolvedSet.has(row.rawNameNormalized)) {
      // Outcome 3: still unresolved — increment retry, leave as pending
      await deps.markUnresolved(row.id)
      report.unresolved += 1
    }
    // If the name wasn't in resolved or unresolved (batch error), skip silently
  }

  return report
}

// ── sweepPendingAliases (public entry point) ─────────────────────────────────

export async function sweepPendingAliases(): Promise<SweepReport> {
  return sweepPendingAliasesWithDeps({
    fetchAllPending: defaultFetchAllPending,
    resolveNames: resolveAliasesBatch,
    drainQueue: drainPendingAliasQueue,
    insertTombstoned: defaultInsertTombstoned,
    markUnresolved: defaultMarkUnresolved,
    markTombstoned: defaultMarkTombstoned,
  })
}

// ── HTTP route ───────────────────────────────────────────────────────────────

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
