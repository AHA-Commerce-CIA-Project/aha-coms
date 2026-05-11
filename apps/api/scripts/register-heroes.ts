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
 *   bun run --cwd apps/api register:heroes
 *
 * Runbook (prod): swap dev values for the live Cloud Run URLs and a secret
 * fetched from Secret Manager (`aha-heroes-broker-signing-secret` per the FAST
 * naming convention).
 *
 * Idempotent: if `slug=heroes` already exists with non-deprecated status, the
 * script logs the existing app id and exits 0 without touching any row.
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
  const webhookUrl = `${heroesUrl}/api/webhooks/portal`

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: appRegistry.id, status: appRegistry.status })
      .from(appRegistry)
      .where(eq(appRegistry.slug, SLUG))
      .limit(1)

    if (existing.length > 0 && existing[0].status !== 'deprecated') {
      console.log(
        `[register-heroes] Heroes already registered (id=${existing[0].id}, status=${existing[0].status}); nothing to do.`,
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
