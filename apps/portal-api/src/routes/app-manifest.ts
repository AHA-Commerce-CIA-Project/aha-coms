import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { appManifests } from '~/db/schema/app-manifests'
import { requireAppToken } from '~/middleware/app-token'
import { registerManifest, validateConfigSchemaShape } from '~/services/manifests'
import { MIN_MANIFEST_SCHEMA_VERSION } from '~/services/apps'

/**
 * Spec 01 (Rev 4) PR D — manifest-as-code registration endpoint.
 *
 * The H-app's CD pipeline POSTs its `portal-manifest.ts` (already
 * type-checked at H-app build time via `defineManifest`) to the portal.
 * Auth is the H-app's GCP service-account ID token (same as
 * `requireAppToken`); the route asserts caller-slug ↔ params-slug ↔
 * body.appId all match before delegating to the existing idempotent
 * `services/manifests.ts:registerManifest` upsert (already enforces
 * `GREATEST(schemaVersion)` non-regression at the SQL layer).
 */
// Prefix uses ':id' (not ':slug') because Elysia's underlying memoirist
// router does not allow two different parameter names at the same path
// position. apps.ts and app-webhooks.ts both register '/apps/:id/...' —
// the param NAME must match across siblings at the same trie position
// even when each route's handler interprets the captured value
// differently. The SDK CLI sends the app slug ('heroes') in this slot, so
// the value here is semantically a slug. The handler resolves it via
// `requireAppToken` (which provides `app.slug`) and validates path ↔ token
// ↔ body match before delegating to the upsert.
export const appManifestRoutes = new Elysia({ prefix: '/apps/:id/manifest' })
  .use(requireAppToken())
  .post(
    '/',
    async ({ params, body, status, app }) => {
      // params.id holds the slug captured from the URL — see prefix comment.
      const slugFromPath = params.id

      if (app.slug !== slugFromPath) {
        throw status(403, { error: 'forbidden', reason: 'app_mismatch' })
      }

      if (body.appId !== slugFromPath) {
        throw status(409, {
          error: 'app_slug_mismatch',
          reason: 'body.appId must equal :id (the app slug in the URL)',
        })
      }

      if (body.schemaVersion < MIN_MANIFEST_SCHEMA_VERSION) {
        throw status(422, {
          error: 'validation_failed',
          details: [
            {
              key: 'schemaVersion',
              reason: `must be at least ${MIN_MANIFEST_SCHEMA_VERSION}`,
            },
          ],
        })
      }

      const shapeErrors = validateConfigSchemaShape(body.configSchema)
      if (shapeErrors.length > 0) {
        throw status(422, { error: 'validation_failed', details: shapeErrors })
      }

      await registerManifest({
        appId: body.appId,
        displayName: body.displayName,
        schemaVersion: body.schemaVersion,
        configSchema: body.configSchema as never,
        taxonomies: body.taxonomies ?? [],
      })

      const row = await db.query.appManifests.findFirst({
        where: eq(appManifests.appId, app.id),
        columns: { schemaVersion: true, updatedAt: true },
      })

      if (!row) {
        return {
          schemaVersion: body.schemaVersion,
          registeredAt: new Date().toISOString(),
        }
      }

      return {
        schemaVersion: row.schemaVersion,
        registeredAt: row.updatedAt.toISOString(),
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        appId: t.String({ minLength: 1 }),
        displayName: t.String({ minLength: 1 }),
        schemaVersion: t.Integer({ minimum: 1 }),
        configSchema: t.Record(t.String(), t.Any()),
        taxonomies: t.Optional(t.Array(t.String())),
      }),
    },
  )
