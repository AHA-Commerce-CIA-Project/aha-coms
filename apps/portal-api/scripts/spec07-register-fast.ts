/**
 * Spec 07 §Phase 1A + 1B — Register the FAST app + manifest + paused webhook
 * endpoint in the portal App Registry.
 *
 * Upsert semantics: if `slug=fast` does not exist, the script INSERTs all
 * three rows (app_registry, app_manifests, app_webhook_endpoints). If it
 * exists, the script UPDATEs only the drift-prone fields — `url`,
 * `healthCheckUrl`, `serviceAccountEmail`, `brokerOrigin` on `app_registry`;
 * `url` + `secret` on `app_webhook_endpoints`. Immutable fields (slug, name,
 * description, basePath, adapterType, transportMode, handoffMode, appRoles)
 * and the manifest are left alone — change those through a contract revision,
 * not a re-registration. The webhook endpoint's `status` field is NEVER
 * flipped here — that decision belongs alongside T77's consumer rollout, not
 * a registration sync. The script logs the specific fields that drifted, or
 * "no changes needed" if all values match. Mirrors `register-heroes.ts`
 * (FU-1 shape) so the next operator window that touches `app_registry`
 * doesn't need raw SQL for an existing-row update.
 *
 * Runbook (prod, via Cloud SQL Auth Proxy):
 *   # 1. Start the proxy in another terminal.
 *   cloud-sql-proxy --port 5432 fbi-dev-484410:asia-southeast2:coms-aha-heroes-db
 *
 *   # 2. Extract the connection user/password from the live secret.
 *   PROD_URL=$(gcloud secrets versions access latest \
 *     --secret=coms-portal-database-url --project=fbi-dev-484410)
 *   PROXY_URL=$(echo "$PROD_URL" | sed -E 's#@/([^?]+)\?host=/cloudsql/[^&]+#@127.0.0.1:5432/\1#')
 *
 *   # 3. Run with post-Phase-4 single-origin URLs.
 *   DATABASE_URL="$PROXY_URL" \
 *   FAST_APP_URL=https://aha-coms.web.app/fast \
 *   FAST_WEBHOOK_URL=https://aha-coms.web.app/fast/api/webhooks/portal \
 *   FAST_HEALTH_CHECK_URL=https://aha-coms.web.app/fast/api/health \
 *   FAST_APP_SA=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com \
 *   FAST_BROKER_ORIGIN=https://aha-coms.web.app \
 *   FAST_WEBHOOK_HMAC=$(gcloud secrets versions access latest \
 *     --secret=aha-fast-broker-signing-secret --project=fbi-dev-484410 \
 *     2>/dev/null || echo dev-fast-hmac-secret) \
 *   bun run --cwd apps/portal-api spec07:register-fast
 *
 *   # FAST_WEBHOOK_URL defaults to `${FAST_APP_URL}/api/webhooks/portal`;
 *   # FAST_HEALTH_CHECK_URL defaults to the api origin of FAST_WEBHOOK_URL +
 *   # `/api/health`. Override only when probing a different target.
 *
 * Note on broker signing secret: portal fetches it from Secret Manager
 * (`aha-fast-broker-signing-secret`) at handoff time. `app_registry.broker_signing_secret`
 * is left NULL — same shape as Heroes (verified 2026-05-08).
 */
import { db } from '~/db'
import { appRegistry, appManifests, appWebhookEndpoints } from '~/db/schema'
import { eq } from 'drizzle-orm'

const SLUG = 'fast'
const NAME = 'FAST'
const DESCRIPTION =
  'AHA Smart Tracker — task management H-app integrated via Spec 07. Brownfield onboarding (existing aha-fast Next.js + Prisma + Postgres).'
const BASE_PATH = '/api'
const ADAPTER_TYPE = 'server_middleware'
const TRANSPORT_MODE = 'portable_token'
const HANDOFF_MODE = 'one_time_code'

const APP_ROLES = [
  {
    key: 'employee',
    label: 'Employee',
    description: 'Standard Fast user — can view, claim, and complete tasks.',
    default: true,
  },
  {
    key: 'leader',
    label: 'Team Leader',
    description: 'Can assign tasks, manage team queues, and review completion details.',
  },
  {
    key: 'admin',
    label: 'Administrator',
    description: 'Full Fast access including settings and changelog publishing.',
  },
]

const SUBSCRIBED_EVENTS = [
  'user.provisioned',
  'user.updated',
  'employment.updated',
  'user.offboarded',
  'app_config.updated',
  'alias.updated',
  'taxonomy.upserted',
  'taxonomy.deleted',
]

const CONFIG_SCHEMA = {
  role: {
    type: 'enum',
    values: ['employee', 'leader', 'admin'],
    default: 'employee',
  },
  teamId: {
    type: 'string',
    default: '',
  },
}

const TAXONOMIES = ['teams']

function requiredEnv(key: string): string {
  const v = process.env[key]
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env: ${key}`)
  }
  return v.trim()
}

async function main() {
  const fastUrl = requiredEnv('FAST_APP_URL')
  const fastSa = requiredEnv('FAST_APP_SA')
  const brokerOrigin = requiredEnv('FAST_BROKER_ORIGIN')
  const webhookHmac = requiredEnv('FAST_WEBHOOK_HMAC')
  // Webhook target defaults to the legacy `${appUrl}/api/webhooks/portal`
  // shape; override via FAST_WEBHOOK_URL when the api lives on its own host.
  const webhookUrl = process.env.FAST_WEBHOOK_URL?.trim() || `${fastUrl}/api/webhooks/portal`
  // Health probe target. Default derives the api origin by stripping the
  // webhook path; override via FAST_HEALTH_CHECK_URL when a different target
  // is needed (post-Phase-4 single-origin: `${fastUrl}/api/health`).
  const healthCheckUrl =
    process.env.FAST_HEALTH_CHECK_URL?.trim() ||
    new URL('/api/health', webhookUrl).toString()

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: appRegistry.id,
        status: appRegistry.status,
        url: appRegistry.url,
        healthCheckUrl: appRegistry.healthCheckUrl,
        serviceAccountEmail: appRegistry.serviceAccountEmail,
        brokerOrigin: appRegistry.brokerOrigin,
      })
      .from(appRegistry)
      .where(eq(appRegistry.slug, SLUG))
      .limit(1)

    if (existing.length > 0 && existing[0].status === 'deprecated') {
      console.log(
        `[spec07-register-fast] FAST exists but is deprecated (id=${existing[0].id}); refusing to touch a deprecated row.`,
      )
      return
    }

    if (existing.length > 0) {
      const row = existing[0]
      const drift: string[] = []
      if (row.url !== fastUrl) drift.push(`url: ${row.url} → ${fastUrl}`)
      if (row.healthCheckUrl !== healthCheckUrl) {
        drift.push(`healthCheckUrl: ${row.healthCheckUrl ?? '(null)'} → ${healthCheckUrl}`)
      }
      if (row.serviceAccountEmail !== fastSa) {
        drift.push(`serviceAccountEmail: ${row.serviceAccountEmail} → ${fastSa}`)
      }
      if (row.brokerOrigin !== brokerOrigin) {
        drift.push(`brokerOrigin: ${row.brokerOrigin} → ${brokerOrigin}`)
      }

      // Webhook endpoint drift — separate query so a webhook-only drift still
      // produces a non-empty drift list and triggers the UPDATE branch.
      const [existingEndpoint] = await tx
        .select({ id: appWebhookEndpoints.id, url: appWebhookEndpoints.url })
        .from(appWebhookEndpoints)
        .where(eq(appWebhookEndpoints.appId, row.id))
        .limit(1)

      if (existingEndpoint && existingEndpoint.url !== webhookUrl) {
        drift.push(`webhookEndpoint.url: ${existingEndpoint.url} → ${webhookUrl}`)
      }

      if (drift.length === 0) {
        console.log(
          `[spec07-register-fast] FAST already registered with matching values (id=${row.id}, status=${row.status}); nothing to do.`,
        )
        return
      }

      // Update path: refresh the four drift-prone fields on app_registry, the
      // webhook URL on app_webhook_endpoints, and the secret. Immutable fields
      // (slug, name, description, basePath, adapterType, transportMode,
      // handoffMode, appRoles) are left alone. The webhook endpoint's `status`
      // is ALSO left alone — flipping `disabled` → `active` (or back) belongs
      // alongside T77's consumer rollout, not a re-registration sync.
      await tx
        .update(appRegistry)
        .set({
          url: fastUrl,
          healthCheckUrl,
          serviceAccountEmail: fastSa,
          brokerOrigin,
        })
        .where(eq(appRegistry.id, row.id))

      console.log(
        `[spec07-register-fast] Updated app_registry row id=${row.id}:\n  - ${drift.join('\n  - ')}`,
      )

      if (existingEndpoint) {
        await tx
          .update(appWebhookEndpoints)
          .set({ url: webhookUrl, secret: webhookHmac })
          .where(eq(appWebhookEndpoints.id, existingEndpoint.id))

        console.log(
          `[spec07-register-fast] Updated app_webhook_endpoints id=${existingEndpoint.id}: url=${webhookUrl} (status preserved)`,
        )
      }
      return
    }

    const [app] = await tx
      .insert(appRegistry)
      .values({
        slug: SLUG,
        name: NAME,
        description: DESCRIPTION,
        url: fastUrl,
        healthCheckUrl,
        basePath: BASE_PATH,
        adapterType: ADAPTER_TYPE,
        transportMode: TRANSPORT_MODE,
        handoffMode: HANDOFF_MODE,
        brokerOrigin,
        serviceAccountEmail: fastSa,
        appRoles: APP_ROLES,
        complianceStatus: 'draft',
        status: 'active',
      })
      .returning({ id: appRegistry.id })

    console.log(`[spec07-register-fast] Inserted app_registry row: id=${app.id}, slug=${SLUG}`)

    await tx.insert(appManifests).values({
      appId: app.id,
      displayName: NAME,
      configSchema: CONFIG_SCHEMA,
      schemaVersion: 2,
      taxonomies: TAXONOMIES,
    })

    console.log(
      `[spec07-register-fast] Inserted app_manifests row: appId=${app.id}, taxonomies=${JSON.stringify(TAXONOMIES)}`,
    )

    const [endpoint] = await tx
      .insert(appWebhookEndpoints)
      .values({
        appId: app.id,
        url: webhookUrl,
        secret: webhookHmac,
        subscribedEvents: SUBSCRIBED_EVENTS,
        status: 'disabled',
      })
      .returning({ id: appWebhookEndpoints.id })

    console.log(
      `[spec07-register-fast] Inserted app_webhook_endpoints row: id=${endpoint.id}, url=${webhookUrl}, status=disabled (will flip to active in Phase 3D)`,
    )
  })
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[spec07-register-fast] Failed:', err)
    process.exit(1)
  },
)
