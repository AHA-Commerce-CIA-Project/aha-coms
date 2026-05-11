/**
 * Spec 07 §Phase 1A + 1B — Register the FAST app + manifest + paused webhook
 * endpoint in the portal App Registry.
 *
 * Runbook:
 *   DATABASE_URL=<portal-db-url> \
 *   FAST_APP_URL=https://aha-fast-app-45tyczfska-et.a.run.app \
 *   FAST_APP_SA=aha-fast-run-sa@fbi-dev-484410.iam.gserviceaccount.com \
 *   FAST_BROKER_ORIGIN=https://coms-portal-app-45tyczfska-et.a.run.app \
 *   FAST_WEBHOOK_HMAC=<hex-from-secret-manager> \
 *   bun run --cwd apps/portal-api spec07:register-fast
 *
 * Idempotent: if slug=fast already exists, the script logs the existing app id
 * and exits 0 without modifying state. Phase 1B's webhook endpoint is registered
 * here in the same transaction as the app + manifest, in `disabled` status; it
 * gets flipped to `active` in Phase 3D once Fast's `/api/webhooks/portal` route
 * is live.
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
  const webhookUrl = `${fastUrl}/api/webhooks/portal`

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: appRegistry.id, status: appRegistry.status })
      .from(appRegistry)
      .where(eq(appRegistry.slug, SLUG))
      .limit(1)

    if (existing.length > 0 && existing[0].status !== 'deprecated') {
      console.log(
        `[spec07-register-fast] FAST already registered (id=${existing[0].id}, status=${existing[0].status}); nothing to do.`,
      )
      return
    }

    const [app] = await tx
      .insert(appRegistry)
      .values({
        slug: SLUG,
        name: NAME,
        description: DESCRIPTION,
        url: fastUrl,
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
