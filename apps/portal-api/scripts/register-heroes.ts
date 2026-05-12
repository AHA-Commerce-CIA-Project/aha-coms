/**
 * Register the Heroes app + manifest + webhook endpoint in the portal App Registry.
 *
 * Heroes' standalone-era registration was a one-off production action that no
 * script committed alongside it. The T15 SSO smoke (Phase 3 / Checkpoint 2)
 * needed the same rows in the local portal DB and reached them through hand-SQL
 * — a state that survives the session but does not survive a fresh laptop.
 * This script makes the registration reproducible. Companion script
 * `bootstrap-heroes-membership.ts` seeds the team + access grants the
 * bootstrap admin needs to see Heroes in the launcher.
 *
 * Mirrors the shape of `spec07-register-fast.ts` (the FAST registration that
 * was authored before the doc set v1 reset). Values are drawn from
 * `apps/heroes-api/portal.integration.json` and the integration contract at
 * `docs/integration-contract.md`.
 *
 * Runbook (dev):
 *   DATABASE_URL=postgresql://aha_sicu@localhost:5432/coms_portal \
 *   HEROES_APP_URL=http://localhost:5174 \
 *   HEROES_APP_SA=coms-aha-heroes-run-sa@coms-portal-prod.iam.gserviceaccount.com \
 *   HEROES_BROKER_ORIGIN=http://localhost:5173 \
 *   HEROES_WEBHOOK_HMAC=dev-heroes-hmac-secret \
 *   bun run --cwd apps/portal-api register:heroes
 *
 * Runbook (prod, via Cloud SQL Auth Proxy):
 *   # 1. Start the proxy in another terminal (Cloud Run uses the same instance
 *   # via Unix socket; from a laptop we go through the proxy on a TCP port).
 *   cloud-sql-proxy --port 5432 fbi-dev-484410:asia-southeast2:coms-aha-heroes-db
 *
 *   # 2. Extract the connection user/password from the live secret. The stored
 *   # DATABASE_URL points at the Cloud SQL Unix socket; swap the host segment
 *   # for the local proxy port.
 *   PROD_URL=$(gcloud secrets versions access latest \
 *     --secret=coms-portal-database-url --project=fbi-dev-484410)
 *   # PROD_URL looks like: postgresql://<user>:<pw>@/coms_portal?host=/cloudsql/...
 *   PROXY_URL=$(echo "$PROD_URL" | sed -E 's#@/#@127.0.0.1:5432/#; s#\?host=.*##')
 *
 *   # 3. Run the script — values reflect the post-T16.5 + post-Phase-5 state.
 *   # HEROES_APP_URL is the launch target (heroes-web, browser-facing).
 *   # HEROES_WEBHOOK_URL is the portal → heroes-api webhook target (server-to-
 *   # server). The two were the same host before T16.5 split the combined
 *   # service into coms-heroes-{api,web}; they live on separate hosts now.
 *   DATABASE_URL="$PROXY_URL" \
 *   HEROES_APP_URL=https://coms-heroes-web-45tyczfska-et.a.run.app \
 *   HEROES_WEBHOOK_URL=https://coms-heroes-api-45tyczfska-et.a.run.app/api/webhooks/portal \
 *   HEROES_APP_SA=coms-heroes-api-sa@fbi-dev-484410.iam.gserviceaccount.com \
 *   HEROES_BROKER_ORIGIN=https://aha-coms.web.app \
 *   HEROES_WEBHOOK_HMAC=$(gcloud secrets versions access latest \
 *     --secret=aha-heroes-broker-signing-secret --project=fbi-dev-484410 \
 *     2>/dev/null || echo dev-heroes-hmac-secret) \
 *   bun run --cwd apps/portal-api register:heroes
 *
 *   # HEROES_HEALTH_CHECK_URL defaults to the api origin of HEROES_WEBHOOK_URL
 *   # + `/api/health` (i.e. heroes-api's health endpoint, not heroes-web's
 *   # nonexistent one). Override only when probing a different target.
 *
 *   # After T24 base-paths heroes-web at /heroes/* and T26 base-paths
 *   # heroes-api at /heroes/api/*, re-run with single-origin URLs:
 *   #   HEROES_APP_URL=https://aha-coms.web.app/heroes
 *   #   HEROES_WEBHOOK_URL=https://aha-coms.web.app/heroes/api/webhooks/portal
 *   #   HEROES_HEALTH_CHECK_URL=https://aha-coms.web.app/heroes/api/health
 *   # so the launch flow stays same-origin and the __session cookie crosses.
 *
 * Upsert semantics: if `slug=heroes` does not exist, the script INSERTs all
 * three rows (app_registry, app_manifests, app_webhook_endpoints). If it
 * exists, the script UPDATEs only the drift-prone fields (url,
 * healthCheckUrl, serviceAccountEmail, brokerOrigin on app_registry; url +
 * secret on app_webhook_endpoints). Immutable fields (slug, name,
 * description, basePath, adapterType, transportMode, handoffMode, appRoles)
 * and the manifest are left alone — change those through a contract
 * revision, not a re-registration. The script logs the specific fields that
 * drifted, or "no changes needed" if all values match.
 *
 * Webhook endpoint status is set to `active` because heroes' receiver at
 * `apps/heroes-api/src/routes/portal-webhooks.ts` is live (verifies inbound
 * requests via a Google ID token signed by PORTAL_SERVICE_ACCOUNT_EMAIL — not
 * HMAC; the secret stored here is recorded for shape parity with FAST). In
 * local dev, the webhook channel only fires when portal can present a valid
 * Google ID token, which requires either a real GCP service account JSON or a
 * dev-mode bypass in heroes' webhook handler — both outside this script's
 * scope. Sign-in + launcher visibility work without it.
 */
import { db } from '~/db'
import { appRegistry, appManifests, appWebhookEndpoints } from '~/db/schema'
import { eq } from 'drizzle-orm'

const SLUG = 'heroes'
const NAME = 'AHA Heroes'
const DESCRIPTION =
  'AHA Heroes — points, recognition, rewards H-app. Reference implementation for the COMS integration contract.'
const BASE_PATH = '/api'
const ADAPTER_TYPE = 'server_middleware'
const TRANSPORT_MODE = 'portable_token'
const HANDOFF_MODE = 'one_time_code'

const APP_ROLES = [
  {
    key: 'employee',
    label: 'Employee',
    description: 'Standard user.',
    default: true,
  },
  {
    key: 'leader',
    label: 'Team Leader',
    description: 'Can submit points for team members.',
  },
  {
    key: 'hr',
    label: 'HR',
    description: 'Can manage users and view reports.',
  },
  {
    key: 'admin',
    label: 'Administrator',
    description: 'Full access including settings.',
  },
]

const SUBSCRIBED_EVENTS = [
  'user.provisioned',
  'user.updated',
  'user.offboarded',
  'employment.updated',
  'app_config.updated',
  'alias.updated',
  'alias.deleted',
  'alias.resolved',
  'session.revoked',
  'taxonomy.upserted',
  'taxonomy.deleted',
]

const CONFIG_SCHEMA = {
  role: {
    type: 'enum',
    values: ['employee', 'leader', 'hr', 'admin'],
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
  const heroesUrl = requiredEnv('HEROES_APP_URL')
  const heroesSa = requiredEnv('HEROES_APP_SA')
  const brokerOrigin = requiredEnv('HEROES_BROKER_ORIGIN')
  const webhookHmac = requiredEnv('HEROES_WEBHOOK_HMAC')
  // Webhook target is independent of the launch URL after T16.5 split the
  // combined heroes Cloud Run service into coms-heroes-{api,web}. The launch
  // URL targets heroes-web (browser-facing); the webhook URL targets
  // heroes-api (server-to-server). Default derives the legacy single-service
  // shape for backwards compatibility with the original runbook; override via
  // HEROES_WEBHOOK_URL when the api lives on its own host.
  const webhookUrl = process.env.HEROES_WEBHOOK_URL?.trim() || `${heroesUrl}/api/webhooks/portal`
  // Health probe target. The portal periodically GETs this URL and stamps
  // healthStatus on the app_registry row; the dashboard reads that field for
  // the per-app indicator. The probe must land on heroes-api (which exposes
  // `/api/health`) — heroes-web has no such route, so deriving from
  // HEROES_APP_URL would yield 404s and a perpetually "Degraded" card.
  // Default derives the api origin by stripping the webhook path; override via
  // HEROES_HEALTH_CHECK_URL when a different probe target is needed (e.g.
  // post-T26 single-origin: https://aha-coms.web.app/heroes/api/health).
  const healthCheckUrl =
    process.env.HEROES_HEALTH_CHECK_URL?.trim() ||
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

    if (existing.length > 0) {
      const row = existing[0]
      const drift: string[] = []
      if (row.url !== heroesUrl) drift.push(`url: ${row.url} → ${heroesUrl}`)
      if (row.healthCheckUrl !== healthCheckUrl) {
        drift.push(`healthCheckUrl: ${row.healthCheckUrl ?? '(null)'} → ${healthCheckUrl}`)
      }
      if (row.serviceAccountEmail !== heroesSa) {
        drift.push(`serviceAccountEmail: ${row.serviceAccountEmail} → ${heroesSa}`)
      }
      if (row.brokerOrigin !== brokerOrigin) {
        drift.push(`brokerOrigin: ${row.brokerOrigin} → ${brokerOrigin}`)
      }

      if (drift.length === 0) {
        console.log(
          `[register-heroes] Heroes already registered with matching values (id=${row.id}, status=${row.status}); nothing to do.`,
        )
        return
      }

      // Update path: refresh the four drift-prone fields on app_registry, the
      // webhook URL on app_webhook_endpoints, and the secret if it changed. The
      // immutable fields (slug, name, description, basePath, adapterType,
      // transportMode, handoffMode, appRoles) are left alone — change those
      // through a manifest/contract revision, not a re-registration.
      await tx
        .update(appRegistry)
        .set({
          url: heroesUrl,
          healthCheckUrl,
          serviceAccountEmail: heroesSa,
          brokerOrigin,
        })
        .where(eq(appRegistry.id, row.id))

      console.log(
        `[register-heroes] Updated app_registry row id=${row.id}:\n  - ${drift.join('\n  - ')}`,
      )

      await tx
        .update(appWebhookEndpoints)
        .set({ url: webhookUrl, secret: webhookHmac })
        .where(eq(appWebhookEndpoints.appId, row.id))

      console.log(
        `[register-heroes] Updated app_webhook_endpoints for appId=${row.id}: url=${webhookUrl}`,
      )
      return
    }

    const [app] = await tx
      .insert(appRegistry)
      .values({
        slug: SLUG,
        name: NAME,
        description: DESCRIPTION,
        url: heroesUrl,
        healthCheckUrl,
        basePath: BASE_PATH,
        adapterType: ADAPTER_TYPE,
        transportMode: TRANSPORT_MODE,
        handoffMode: HANDOFF_MODE,
        brokerOrigin,
        serviceAccountEmail: heroesSa,
        appRoles: APP_ROLES,
        complianceStatus: 'draft',
        status: 'active',
      })
      .returning({ id: appRegistry.id })

    console.log(`[register-heroes] Inserted app_registry row: id=${app.id}, slug=${SLUG}`)

    await tx.insert(appManifests).values({
      appId: app.id,
      displayName: NAME,
      configSchema: CONFIG_SCHEMA,
      schemaVersion: 2,
      taxonomies: TAXONOMIES,
    })

    console.log(
      `[register-heroes] Inserted app_manifests row: appId=${app.id}, taxonomies=${JSON.stringify(TAXONOMIES)}`,
    )

    const [endpoint] = await tx
      .insert(appWebhookEndpoints)
      .values({
        appId: app.id,
        url: webhookUrl,
        secret: webhookHmac,
        subscribedEvents: SUBSCRIBED_EVENTS,
        status: 'active',
      })
      .returning({ id: appWebhookEndpoints.id })

    console.log(
      `[register-heroes] Inserted app_webhook_endpoints row: id=${endpoint.id}, url=${webhookUrl}, status=active`,
    )
  })
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[register-heroes] Failed:', err)
    process.exit(1)
  },
)
