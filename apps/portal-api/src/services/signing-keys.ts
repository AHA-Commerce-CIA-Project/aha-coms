/**
 * Portal broker signing keys service (Rev 2 §01).
 *
 * Generates ES256 keypairs, persists the private half in Secret Manager
 * (via the REST API — we deliberately avoid `@google-cloud/secret-manager`
 * because its gRPC SDK is heavy under Bun, mirroring the Cloud Tasks
 * decision in `cloud-tasks-client.ts`), and the public half as a JWK row
 * in `portal_broker_signing_keys`.
 *
 * The hot signing path (`loadActiveSigningKey`) caches the imported
 * CryptoKey for 5 minutes so normal traffic does not hit Secret Manager.
 * After the cache expires the active row is re-queried (in case rotation
 * has happened) and the private PEM is re-fetched.
 */
import { randomBytes } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { generateKeyPair, exportJWK, exportPKCS8, importPKCS8 } from 'jose'
import type { CryptoKey, JWK } from 'jose'
import { GoogleAuth } from 'google-auth-library'
import { db } from '~/db'
import {
  portalBrokerSigningKeys,
  SIGNING_KEY_STATUS,
} from '~/db/schema/signing-keys'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ES256_ALG = 'ES256' as const
const PRIVATE_KEY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 min — matches broker token TTL.
const SECRET_NAME_PREFIX = 'portal-broker-signing-key-'
const SECRET_MANAGER_HOST = 'https://secretmanager.googleapis.com'

function requireProjectId(override?: string): string {
  const value = override ?? process.env.GCP_PROJECT_ID
  if (!value) {
    throw new Error('signing-keys: GCP_PROJECT_ID is not set')
  }
  return value
}

// ---------------------------------------------------------------------------
// Secret Manager REST helpers
//
// Rationale: google-auth-library is already a dependency for Cloud Tasks; we
// reuse its access-token minting and call the Secret Manager REST API
// directly instead of pulling in @google-cloud/secret-manager (which carries
// the gRPC SDK + ~20MB of native deps that Bun handles awkwardly — same call
// the team made for cloud-tasks-client.ts).
// ---------------------------------------------------------------------------

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

interface SecretManagerCallOptions {
  /** Override fetch (testing). */
  fetchImpl?: typeof fetch
  /** Override the access-token getter (testing). */
  getAccessToken?: () => Promise<string>
  /** GCP project id (defaults to GCP_PROJECT_ID env). */
  projectId?: string
}

async function getAccessToken(opts: SecretManagerCallOptions): Promise<string> {
  if (opts.getAccessToken) return opts.getAccessToken()
  const token = await auth.getAccessToken()
  if (!token) throw new Error('signing-keys: failed to obtain GCP access token')
  return token
}

async function smCreateSecret(
  secretName: string,
  opts: SecretManagerCallOptions,
): Promise<void> {
  const projectId = requireProjectId(opts.projectId)
  const fetchImpl = opts.fetchImpl ?? fetch
  const accessToken = await getAccessToken(opts)

  const url = `${SECRET_MANAGER_HOST}/v1/projects/${projectId}/secrets?secretId=${encodeURIComponent(secretName)}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replication: { automatic: {} } }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`secretmanager.create(${secretName}) failed (${res.status}): ${text.slice(0, 300)}`)
  }
}

async function smAddSecretVersion(
  secretName: string,
  payload: string,
  opts: SecretManagerCallOptions,
): Promise<void> {
  const projectId = requireProjectId(opts.projectId)
  const fetchImpl = opts.fetchImpl ?? fetch
  const accessToken = await getAccessToken(opts)

  const url = `${SECRET_MANAGER_HOST}/v1/projects/${projectId}/secrets/${encodeURIComponent(secretName)}:addVersion`
  const data = Buffer.from(payload, 'utf8').toString('base64')
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload: { data } }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`secretmanager.addVersion(${secretName}) failed (${res.status}): ${text.slice(0, 300)}`)
  }
}

async function smAccessLatestVersion(
  secretName: string,
  opts: SecretManagerCallOptions,
): Promise<string> {
  const projectId = requireProjectId(opts.projectId)
  const fetchImpl = opts.fetchImpl ?? fetch
  const accessToken = await getAccessToken(opts)

  const url = `${SECRET_MANAGER_HOST}/v1/projects/${projectId}/secrets/${encodeURIComponent(secretName)}/versions/latest:access`
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`secretmanager.access(${secretName}) failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const body = (await res.json()) as { payload?: { data?: string } }
  const data = body.payload?.data
  if (!data) throw new Error(`secretmanager.access(${secretName}) returned empty payload`)
  return Buffer.from(data, 'base64').toString('utf8')
}

// ---------------------------------------------------------------------------
// Cache for the active key's CryptoKey
// ---------------------------------------------------------------------------

interface CachedActiveKey {
  kid: string
  privateKey: CryptoKey
  expiresAt: number
}

let activeKeyCache: CachedActiveKey | null = null

/** Test-only — drop the in-process cache between tests. */
export function __resetSigningKeyCacheForTests(): void {
  activeKeyCache = null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateAndStoreNewKeyResult {
  kid: string
  publicJwk: JWK
  privateSecretName: string
}

export interface GenerateAndStoreNewKeyOptions extends SecretManagerCallOptions {
  /** Status to insert with. Defaults to 'created' — promote separately. */
  initialStatus?: 'created' | 'active'
  /** Override the kid (testing). */
  kid?: string
}

/**
 * Generate a fresh ES256 keypair, store the private PEM in Secret Manager,
 * and insert a row in `portal_broker_signing_keys` with the public JWK.
 *
 * The default status is `'created'` — callers (e.g. rotation) decide when
 * to promote a key to `'active'`. The bootstrap path can pass
 * `initialStatus: 'active'` to skip the two-step promotion when the table
 * is empty.
 */
export async function generateAndStoreNewKey(
  opts: GenerateAndStoreNewKeyOptions = {},
): Promise<GenerateAndStoreNewKeyResult> {
  const { publicKey, privateKey } = await generateKeyPair(ES256_ALG, { extractable: true })

  const kid = opts.kid ?? `bk-${Date.now()}-${randomBytes(4).toString('hex')}`

  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = kid
  publicJwk.alg = ES256_ALG
  publicJwk.use = 'sig'

  const privatePem = await exportPKCS8(privateKey)
  const privateSecretName = `${SECRET_NAME_PREFIX}${kid}`

  // 1. Persist the private half in Secret Manager (create + first version).
  //    If the secret already exists (idempotent retry), createSecret will
  //    409 — surface that as a clear error rather than silently swallowing.
  await smCreateSecret(privateSecretName, opts)
  await smAddSecretVersion(privateSecretName, privatePem, opts)

  // 2. Persist the public half + secret-name pointer in the DB.
  await db.insert(portalBrokerSigningKeys).values({
    kid,
    alg: ES256_ALG,
    publicJwk,
    privateSecretName,
    status: opts.initialStatus ?? SIGNING_KEY_STATUS.CREATED,
  })

  return { kid, publicJwk, privateSecretName }
}

/**
 * Load the currently active signing key and its imported CryptoKey,
 * suitable for `new SignJWT(...).sign(privateKey)`.
 *
 * Caches the imported CryptoKey for 5 minutes in-process. After the TTL
 * expires we re-query the DB (rotation may have happened) and re-fetch
 * the private PEM from Secret Manager.
 *
 * Throws if there is no active key — the partial unique index guarantees
 * there is at most one, so a fail-fast on zero is the correct behavior.
 * No silent fallback to a stale cache; that masks rotation bugs.
 */
export async function loadActiveSigningKey(
  opts: SecretManagerCallOptions = {},
): Promise<{ kid: string; privateKey: CryptoKey }> {
  const now = Date.now()
  if (activeKeyCache && activeKeyCache.expiresAt > now) {
    return { kid: activeKeyCache.kid, privateKey: activeKeyCache.privateKey }
  }

  const rows = await db
    .select({
      kid: portalBrokerSigningKeys.kid,
      privateSecretName: portalBrokerSigningKeys.privateSecretName,
    })
    .from(portalBrokerSigningKeys)
    .where(eq(portalBrokerSigningKeys.status, SIGNING_KEY_STATUS.ACTIVE))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new Error(
      'signing-keys: no active signing key found. Run the bootstrap script ' +
        '(scripts/bootstrap-signing-key.ts) before enabling ES256 emission.',
    )
  }

  const privatePem = await smAccessLatestVersion(row.privateSecretName, opts)
  const privateKey = await importPKCS8(privatePem, ES256_ALG)

  activeKeyCache = {
    kid: row.kid,
    privateKey,
    expiresAt: now + PRIVATE_KEY_CACHE_TTL_MS,
  }

  return { kid: row.kid, privateKey }
}

/**
 * Rotate: generate a new key, atomically flip the current active row to
 * `retiring` and the new row to `active`. Returns the new kid.
 *
 * The cleanup of `retiring` rows (move to `retired`, disable Secret
 * Manager version) is scheduled separately by the admin route in T2 —
 * keeping that here would couple this service to Cloud Tasks scheduling.
 */
export async function rotateActiveKey(
  opts: GenerateAndStoreNewKeyOptions = {},
): Promise<{ newKid: string; previousKid: string | null }> {
  // Generate + persist the new key OUTSIDE the DB transaction. The Secret
  // Manager calls are network I/O and cannot be rolled back by the DB
  // transaction anyway; on failure here, no DB state has changed yet.
  const generated = await generateAndStoreNewKey({ ...opts, initialStatus: 'created' })

  // Now in a single transaction, flip statuses atomically. The partial
  // unique index `one_active_signing_key` guarantees at most one active
  // row at any moment — if a concurrent rotation has already promoted
  // a different key, our promote will fail and the transaction aborts.
  let previousKid: string | null = null
  await db.transaction(async (tx) => {
    const previous = await tx
      .select({ kid: portalBrokerSigningKeys.kid })
      .from(portalBrokerSigningKeys)
      .where(eq(portalBrokerSigningKeys.status, SIGNING_KEY_STATUS.ACTIVE))
      .limit(1)

    if (previous[0]) {
      previousKid = previous[0].kid
      await tx
        .update(portalBrokerSigningKeys)
        .set({ status: SIGNING_KEY_STATUS.RETIRING })
        .where(
          and(
            eq(portalBrokerSigningKeys.kid, previous[0].kid),
            eq(portalBrokerSigningKeys.status, SIGNING_KEY_STATUS.ACTIVE),
          ),
        )
    }

    await tx
      .update(portalBrokerSigningKeys)
      .set({ status: SIGNING_KEY_STATUS.ACTIVE })
      .where(eq(portalBrokerSigningKeys.kid, generated.kid))
  })

  // Invalidate the cache so the next sign picks up the new key immediately.
  activeKeyCache = null

  return { newKid: generated.kid, previousKid }
}
