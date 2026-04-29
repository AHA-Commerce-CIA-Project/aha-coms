import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { appUserConfig } from '~/db/schema/app-user-config'
import { identityUsers } from '~/db/schema/identity-users'
import { bulkEditLocks } from '~/db/schema/bulk-edit-locks'
import { eq, and, ilike, or } from 'drizzle-orm'
import { requireRole } from '~/middleware/rbac'
import { validateConfig, loadAllManifests } from '~/services/manifests'
import type { ManifestDefinition } from '~/services/manifests'
import { emitAppConfigUpdated } from '~/services/app-user-config-events'
import { logAudit } from '~/services/audit'
import { randomUUID } from 'crypto'
import { logger } from '~/logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getManifest(appId: string): Promise<ManifestDefinition | null> {
  const all = await loadAllManifests()
  const row = all.find((m) => m.appId === appId)
  if (!row) return null
  return {
    appId: row.appId,
    displayName: row.displayName,
    schemaVersion: row.schemaVersion,
    configSchema: row.configSchema as ManifestDefinition['configSchema'],
  }
}

async function acquireLock(appId: string, userId: string): Promise<{ acquired: boolean; holder?: string }> {
  const rows = await db
    .insert(bulkEditLocks)
    .values({ appId, acquiredBy: userId })
    .onConflictDoNothing()
    .returning()

  if (rows.length > 0) return { acquired: true }

  const [existing] = await db
    .select({ acquiredBy: bulkEditLocks.acquiredBy })
    .from(bulkEditLocks)
    .where(eq(bulkEditLocks.appId, appId))
    .limit(1)

  return { acquired: false, holder: existing?.acquiredBy }
}

async function releaseLock(appId: string): Promise<void> {
  await db.delete(bulkEditLocks).where(eq(bulkEditLocks.appId, appId))
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const adminAppConfigRoutes = new Elysia({ prefix: '/app-config' })
  .use(requireRole('admin'))

  // GET /api/v1/admin/app-config?appId=...&filter=...
  // Returns list of users + their config for a given app
  .get(
    '/',
    async ({ query, status }) => {
      const manifests = await loadAllManifests()
      const appManifestsList = manifests.map((m) => ({
        appId: m.appId,
        displayName: m.displayName,
        schemaVersion: m.schemaVersion,
        configSchema: m.configSchema,
      }))

      if (!query.appId) {
        return { manifests: appManifestsList, rows: [] }
      }

      const manifest = appManifestsList.find((m) => m.appId === query.appId)
      if (!manifest) throw status(404, { message: 'App manifest not found' })

      const filter = query.filter?.trim() ?? ''
      const whereClause = filter.length >= 2
        ? and(
            eq(appUserConfig.appId, query.appId),
            or(
              ilike(identityUsers.name, `%${filter}%`),
              ilike(identityUsers.email, `%${filter}%`),
            ),
          )
        : eq(appUserConfig.appId, query.appId)

      const rows = await db
        .select({
          portalSub: appUserConfig.portalSub,
          name: identityUsers.name,
          email: identityUsers.email,
          config: appUserConfig.config,
          schemaVersion: appUserConfig.schemaVersion,
          updatedAt: appUserConfig.updatedAt,
        })
        .from(appUserConfig)
        .innerJoin(identityUsers, eq(appUserConfig.portalSub, identityUsers.id))
        .where(whereClause)
        .orderBy(identityUsers.name)

      return {
        manifests: appManifestsList,
        rows: rows.map((r) => ({
          portalSub: r.portalSub,
          name: r.name,
          email: r.email,
          config: r.config as Record<string, unknown>,
          schemaVersion: r.schemaVersion,
          updatedAt: r.updatedAt.toISOString(),
        })),
      }
    },
    {
      query: t.Object({
        appId: t.Optional(t.String()),
        filter: t.Optional(t.String()),
      }),
    },
  )

  // GET /api/v1/admin/app-config/csv?appId=...
  // Returns current config as CSV download
  .get(
    '/csv',
    async ({ query, status, set }) => {
      if (!query.appId) throw status(400, { message: 'appId required' })

      const manifest = await getManifest(query.appId)
      if (!manifest) throw status(404, { message: 'App manifest not found' })

      const rows = await db
        .select({
          portalSub: appUserConfig.portalSub,
          name: identityUsers.name,
          config: appUserConfig.config,
        })
        .from(appUserConfig)
        .innerJoin(identityUsers, eq(appUserConfig.portalSub, identityUsers.id))
        .where(eq(appUserConfig.appId, query.appId))
        .orderBy(identityUsers.name)

      const keys = Object.keys(manifest.configSchema)
      const header = ['portalSub', 'name', ...keys].join(',')
      const csvRows = rows.map((r) => {
        const cfg = r.config as Record<string, unknown>
        const cells = [r.portalSub, `"${r.name.replace(/"/g, '""')}"`, ...keys.map((k) => String(cfg[k] ?? ''))]
        return cells.join(',')
      })
      const csv = [header, ...csvRows].join('\n')

      set.headers['content-type'] = 'text/csv'
      set.headers['content-disposition'] = `attachment; filename="app-config-${manifest.displayName.replace(/\s+/g, '-')}.csv"`
      return csv
    },
    {
      query: t.Object({ appId: t.String() }),
    },
  )

  // POST /api/v1/admin/app-config/single
  // Edit one user's config for one app
  .post(
    '/single',
    async ({ body, authUser, requestId, actorIp, status }) => {
      const manifest = await getManifest(body.appId)
      if (!manifest) throw status(404, { message: 'App manifest not found' })

      const validation = validateConfig(manifest, body.config)
      if (!validation.valid) {
        throw status(422, { message: 'Config validation failed', errors: validation.errors })
      }

      const [existing] = await db
        .select({ config: appUserConfig.config, schemaVersion: appUserConfig.schemaVersion })
        .from(appUserConfig)
        .where(and(eq(appUserConfig.portalSub, body.portalSub), eq(appUserConfig.appId, body.appId)))
        .limit(1)

      if (!existing) throw status(404, { message: 'No config row found for this user+app' })

      const previousConfig = existing.config as Record<string, unknown>

      await db
        .update(appUserConfig)
        .set({
          config: body.config,
          schemaVersion: manifest.schemaVersion,
          updatedAt: new Date(),
          updatedBy: authUser.id,
        })
        .where(and(eq(appUserConfig.portalSub, body.portalSub), eq(appUserConfig.appId, body.appId)))

      emitAppConfigUpdated({
        portalSub: body.portalSub,
        appId: body.appId,
        config: body.config,
        previousConfig,
        schemaVersion: manifest.schemaVersion,
        batchId: null,
      }).catch((err) => logger.error({ err }, '[app-config] emitAppConfigUpdated failed'))

      await logAudit({
        actorId: authUser.id,
        action: 'update_app_user_config',
        targetType: 'app_user_config',
        targetId: body.portalSub,
        details: { appId: body.appId, before: previousConfig, after: body.config },
        requestId,
        actorIp,
        targetAppId: body.appId,
      })

      return { ok: true }
    },
    {
      body: t.Object({
        appId: t.String(),
        portalSub: t.String(),
        config: t.Record(t.String(), t.Unknown()),
      }),
    },
  )

  // POST /api/v1/admin/app-config/bulk-preview
  // Dry-run: validate rows and compute diff, no writes
  .post(
    '/bulk-preview',
    async ({ body, status }) => {
      const manifest = await getManifest(body.appId)
      if (!manifest) throw status(404, { message: 'App manifest not found' })

      const results = await computeBulkDiff(body.appId, body.rows, manifest)
      if (results.errors.length > 0) {
        throw status(422, { message: 'Validation errors', errors: results.errors })
      }
      return { changes: results.changes, totalRows: body.rows.length }
    },
    {
      body: t.Object({
        appId: t.String(),
        rows: t.Array(t.Object({ portalSub: t.String(), config: t.Record(t.String(), t.Unknown()) })),
      }),
    },
  )

  // POST /api/v1/admin/app-config/bulk-commit
  // Acquires lock, validates all, writes all, emits events, releases lock
  .post(
    '/bulk-commit',
    async ({ body, authUser, requestId, actorIp, status }) => {
      const manifest = await getManifest(body.appId)
      if (!manifest) throw status(404, { message: 'App manifest not found' })

      const lock = await acquireLock(body.appId, authUser.id)
      if (!lock.acquired) {
        throw status(409, { message: 'Bulk edit in progress', holder: lock.holder })
      }

      try {
        const results = await computeBulkDiff(body.appId, body.rows, manifest)
        if (results.errors.length > 0) {
          throw status(422, { message: 'Validation errors', errors: results.errors })
        }

        const batchId = randomUUID()

        await db.transaction(async (tx) => {
          for (const change of results.changes) {
            await tx
              .update(appUserConfig)
              .set({
                config: change.newConfig,
                schemaVersion: manifest.schemaVersion,
                updatedAt: new Date(),
                updatedBy: authUser.id,
              })
              .where(and(eq(appUserConfig.portalSub, change.portalSub), eq(appUserConfig.appId, body.appId)))
          }
        })

        // Emit events and audit outside transaction (fire-and-forget for events)
        for (const change of results.changes) {
          emitAppConfigUpdated({
            portalSub: change.portalSub,
            appId: body.appId,
            config: change.newConfig,
            previousConfig: change.previousConfig,
            schemaVersion: manifest.schemaVersion,
            batchId,
          }).catch((err) => logger.error({ err }, '[app-config] bulk emitAppConfigUpdated failed'))

          await logAudit({
            actorId: authUser.id,
            action: 'update_app_user_config',
            targetType: 'app_user_config',
            targetId: change.portalSub,
            details: { appId: body.appId, batchId, before: change.previousConfig, after: change.newConfig },
            requestId,
            actorIp,
            targetAppId: body.appId,
          })
        }

        return { ok: true, batchId, updatedCount: results.changes.length }
      } finally {
        await releaseLock(body.appId)
      }
    },
    {
      body: t.Object({
        appId: t.String(),
        rows: t.Array(t.Object({ portalSub: t.String(), config: t.Record(t.String(), t.Unknown()) })),
      }),
    },
  )

// ---------------------------------------------------------------------------
// computeBulkDiff — shared by preview and commit
// ---------------------------------------------------------------------------

type BulkRow = { portalSub: string; config: Record<string, unknown> }
type BulkChange = { portalSub: string; previousConfig: Record<string, unknown>; newConfig: Record<string, unknown> }
type BulkError = { portalSub: string; reason: string }

async function computeBulkDiff(
  appId: string,
  rows: BulkRow[],
  manifest: ManifestDefinition,
): Promise<{ changes: BulkChange[]; errors: BulkError[] }> {
  const portalSubs = rows.map((r) => r.portalSub)

  // Load existing rows in one query
  const existing = await db
    .select({ portalSub: appUserConfig.portalSub, config: appUserConfig.config })
    .from(appUserConfig)
    .where(and(eq(appUserConfig.appId, appId)))

  const existingMap = new Map(existing.map((r) => [r.portalSub, r.config as Record<string, unknown>]))

  const changes: BulkChange[] = []
  const errors: BulkError[] = []

  for (const row of rows) {
    if (!existingMap.has(row.portalSub)) {
      errors.push({ portalSub: row.portalSub, reason: 'portalSub not found — no auto-create' })
      continue
    }
    const validation = validateConfig(manifest, row.config)
    if (!validation.valid) {
      errors.push({ portalSub: row.portalSub, reason: validation.errors.map((e) => `${e.key}: ${e.reason}`).join('; ') })
      continue
    }
    changes.push({
      portalSub: row.portalSub,
      previousConfig: existingMap.get(row.portalSub)!,
      newConfig: row.config,
    })
  }

  // Partial application forbidden — if any error, reject whole batch
  if (errors.length > 0) {
    return { changes: [], errors }
  }

  return { changes, errors: [] }
}
