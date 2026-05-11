/**
 * Rev 2 §01 — Bootstrap the first ES256 broker signing key.
 *
 * Runbook:
 *   bun run --cwd apps/portal-api scripts/bootstrap-signing-key.ts
 *
 * Idempotent: exits 0 with a message if an active key already exists.
 * Otherwise generates a fresh ES256 keypair, writes the private PEM to
 * Secret Manager (`portal-broker-signing-key-<kid>`), and inserts a row
 * with status='active' so dual-mode emission can immediately start
 * minting ES256 sibling tokens.
 *
 * Required env: GCP_PROJECT_ID, DATABASE_URL.
 *
 * After running this, deploy the new portal image and verify:
 *   1. /api/auth/broker/launch/<app> redirects with a `portal_token_es256` query param.
 *   2. The portal_broker_signing_keys table has exactly one row with status='active'.
 */
import { db } from '~/db'
import { portalBrokerSigningKeys, SIGNING_KEY_STATUS } from '~/db/schema/signing-keys'
import { eq } from 'drizzle-orm'
import { generateAndStoreNewKey } from '~/services/signing-keys'

async function main() {
  const existing = await db
    .select({ kid: portalBrokerSigningKeys.kid })
    .from(portalBrokerSigningKeys)
    .where(eq(portalBrokerSigningKeys.status, SIGNING_KEY_STATUS.ACTIVE))
    .limit(1)

  if (existing.length > 0) {
    console.log(`[bootstrap] Active signing key already exists (kid=${existing[0].kid}); nothing to do.`)
    return
  }

  console.log('[bootstrap] No active signing key found. Generating ES256 keypair...')
  const { kid, privateSecretName } = await generateAndStoreNewKey({ initialStatus: 'active' })
  console.log(`[bootstrap] Active key inserted: kid=${kid}, secret=${privateSecretName}`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[bootstrap] Failed:', err)
    process.exit(1)
  },
)
