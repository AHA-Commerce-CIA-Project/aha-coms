import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { taxonomyEditLocks } from '~/db/schema/taxonomy-edit-locks'
import { eq } from 'drizzle-orm'
import { requireRole } from '~/middleware/rbac'
import {
  listAllTaxonomyIds,
  listTaxonomyEntries,
  upsertTaxonomyEntry,
  bulkUpsertTaxonomyEntries,
  deleteTaxonomyEntries,
} from '~/services/taxonomies'
import { emitTaxonomyUpserted, emitTaxonomyDeleted } from '~/services/taxonomy-events'
import { logAudit } from '~/services/audit'
import { randomUUID } from 'crypto'
import { logger } from '~/logger'

// ---------------------------------------------------------------------------
// Per-taxonomy lock helpers (uses taxonomy_edit_locks table)
// ---------------------------------------------------------------------------

async function acquireTaxonomyLock(
  taxonomyId: string,
  userId: string,
): Promise<{ acquired: boolean; holder?: string }> {
  const rows = await db
    .insert(taxonomyEditLocks)
    .values({ taxonomyId, acquiredBy: userId })
    .onConflictDoNothing()
    .returning()

  if (rows.length > 0) return { acquired: true }

  const [existing] = await db
    .select({ acquiredBy: taxonomyEditLocks.acquiredBy })
    .from(taxonomyEditLocks)
    .where(eq(taxonomyEditLocks.taxonomyId, taxonomyId))
    .limit(1)

  return { acquired: false, holder: existing?.acquiredBy }
}

async function releaseTaxonomyLock(taxonomyId: string): Promise<void> {
  await db.delete(taxonomyEditLocks).where(eq(taxonomyEditLocks.taxonomyId, taxonomyId))
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const adminTaxonomiesRoutes = new Elysia({ prefix: '/taxonomies' })
  .use(requireRole('admin'))

  // GET /api/v1/admin/taxonomies
  // List all taxonomy IDs + entry counts (for sidebar)
  .get(
    '/',
    async () => {
      const ids = await listAllTaxonomyIds()

      const taxonomies = await Promise.all(
        ids.map(async (taxonomyId) => {
          const entries = await listTaxonomyEntries(taxonomyId)
          return { taxonomyId, entryCount: entries.length }
        }),
      )

      return { taxonomies }
    },
  )

  // GET /api/v1/admin/taxonomies/:taxonomyId
  // List all entries for a taxonomy
  .get(
    '/:taxonomyId',
    async ({ params }) => {
      const entries = await listTaxonomyEntries(params.taxonomyId)
      return {
        taxonomyId: params.taxonomyId,
        entries: entries.map((e) => ({
          id: e.id,
          key: e.key,
          value: e.value,
          metadata: e.metadata,
          updatedAt: e.updatedAt.toISOString(),
        })),
      }
    },
    {
      params: t.Object({ taxonomyId: t.String() }),
    },
  )

  // POST /api/v1/admin/taxonomies/:taxonomyId/single
  // Upsert one entry
  .post(
    '/:taxonomyId/single',
    async ({ params, body, authUser, requestId, actorIp }) => {
      const entry = await upsertTaxonomyEntry({
        taxonomyId: params.taxonomyId,
        key: body.key,
        value: body.value,
        metadata: body.metadata ?? null,
        updatedBy: authUser.id,
      })

      // Emit (gated by ENABLE_TAXONOMY_EVENTS)
      emitTaxonomyUpserted({
        taxonomyId: params.taxonomyId,
        entries: [{ key: body.key, value: body.value, metadata: body.metadata ?? null }],
      }).catch((err) => logger.error({ err }, '[admin/taxonomies] emitTaxonomyUpserted failed'))

      await logAudit({
        actorId: authUser.id,
        action: 'update_taxonomy_entry',
        targetType: 'taxonomy_entry',
        targetId: entry.id,
        details: {
          taxonomyId: params.taxonomyId,
          key: body.key,
          value: body.value,
          metadata: body.metadata ?? null,
        },
        requestId,
        actorIp,
      })

      return {
        ok: true,
        entry: {
          id: entry.id,
          key: entry.key,
          value: entry.value,
          metadata: entry.metadata,
          updatedAt: entry.updatedAt.toISOString(),
        },
      }
    },
    {
      params: t.Object({ taxonomyId: t.String() }),
      body: t.Object({
        key: t.String(),
        value: t.String(),
        metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
      }),
    },
  )

  // POST /api/v1/admin/taxonomies/:taxonomyId/bulk
  // Bulk upsert with per-taxonomy lock
  .post(
    '/:taxonomyId/bulk',
    async ({ params, body, authUser, requestId, actorIp, status }) => {
      const lock = await acquireTaxonomyLock(params.taxonomyId, authUser.id)
      if (!lock.acquired) {
        throw status(409, { message: 'Bulk edit in progress', holder: lock.holder })
      }

      try {
        const batchId = randomUUID()
        const result = await bulkUpsertTaxonomyEntries(params.taxonomyId, body.entries, authUser.id)

        // Emit single event for the whole batch (per spec §Race window)
        emitTaxonomyUpserted({
          taxonomyId: params.taxonomyId,
          entries: result.entries.map((e) => ({
            key: e.key,
            value: e.value,
            metadata: e.metadata as Record<string, unknown> | null,
          })),
        }).catch((err) => logger.error({ err }, '[admin/taxonomies] bulk emitTaxonomyUpserted failed'))

        // Audit each row
        for (const entry of result.entries) {
          await logAudit({
            actorId: authUser.id,
            action: 'update_taxonomy_entry',
            targetType: 'taxonomy_entry',
            targetId: entry.id,
            details: { taxonomyId: params.taxonomyId, batchId, key: entry.key, value: entry.value },
            requestId,
            actorIp,
          })
        }

        return { ok: true, batchId, upserted: result.upserted }
      } finally {
        await releaseTaxonomyLock(params.taxonomyId)
      }
    },
    {
      params: t.Object({ taxonomyId: t.String() }),
      body: t.Object({
        entries: t.Array(
          t.Object({
            key: t.String(),
            value: t.String(),
            metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
          }),
        ),
      }),
    },
  )

  // DELETE /api/v1/admin/taxonomies/:taxonomyId/:key
  // Delete one entry
  .delete(
    '/:taxonomyId/:key',
    async ({ params, authUser, requestId, actorIp }) => {
      const result = await deleteTaxonomyEntries(params.taxonomyId, [params.key])

      emitTaxonomyDeleted({
        taxonomyId: params.taxonomyId,
        keys: [params.key],
      }).catch((err) => logger.error({ err }, '[admin/taxonomies] emitTaxonomyDeleted failed'))

      await logAudit({
        actorId: authUser.id,
        action: 'delete_taxonomy_entry',
        targetType: 'taxonomy_entry',
        targetId: `${params.taxonomyId}/${params.key}`,
        details: { taxonomyId: params.taxonomyId, key: params.key },
        requestId,
        actorIp,
      })

      return { ok: true, deleted: result.deleted }
    },
    {
      params: t.Object({ taxonomyId: t.String(), key: t.String() }),
    },
  )
