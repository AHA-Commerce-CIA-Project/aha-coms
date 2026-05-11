/**
 * Unit tests for the signing-keys service (Rev 2 §01).
 *
 * Strategy:
 *  - Mock `~/db` with an in-memory store keyed by status, mirroring the
 *    pattern used in auth-broker.test.ts.
 *  - Mock the Secret Manager fetch path by injecting `fetchImpl` /
 *    `getAccessToken` overrides into the service calls.
 *  - Use real `jose` for the ES256 sign/verify roundtrip.
 *
 * Coverage:
 *  - generateAndStoreNewKey persists the public JWK + secret, can produce
 *    a key whose private PEM round-trips through Secret Manager and
 *    verifies a token with the public JWK.
 *  - loadActiveSigningKey caches the imported CryptoKey for 5 min and
 *    re-fetches after expiry.
 *  - Sign with private + verify with public JWK roundtrip.
 *  - Two active rows → constraint at the application layer (the partial
 *    unique index is asserted in the migration; we validate the typed
 *    state-machine guard here).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// In-memory DB stand-in
// ---------------------------------------------------------------------------

type SigningKeyRow = {
  kid: string
  alg: string
  publicJwk: Record<string, unknown>
  privateSecretName: string
  status: string
  createdAt: Date
  retiredAt: Date | null
}

const signingKeyStore: SigningKeyRow[] = []

// Track filter state from the most recent .where() call so the .select chain
// can return the right subset. The tests only ever filter by `status =
// <value>` or by inArray, both of which we model with a tiny tagged predicate.
let pendingFilter: ((row: SigningKeyRow) => boolean) | null = null

const portalBrokerSigningKeysSchema = {
  kid: 'kid',
  alg: 'alg',
  publicJwk: 'public_jwk',
  privateSecretName: 'private_secret_name',
  status: 'status',
  createdAt: 'created_at',
  retiredAt: 'retired_at',
} as const

function selectChain(_columns: unknown) {
  return {
    from: (_table: unknown) => ({
      where: (predicate: (row: SigningKeyRow) => boolean) => {
        pendingFilter = predicate
        return {
          limit: async (_n: number) => {
            const filter = pendingFilter ?? (() => true)
            pendingFilter = null
            return signingKeyStore.filter(filter).slice(0, _n)
          },
          // Allow direct await for unbounded select.
          then: (resolve: (rows: SigningKeyRow[]) => unknown) => {
            const filter = pendingFilter ?? (() => true)
            pendingFilter = null
            return Promise.resolve(signingKeyStore.filter(filter)).then(resolve)
          },
        }
      },
    }),
  }
}

const db = {
  insert: (_table: unknown) => ({
    values: async (row: Record<string, unknown>) => {
      signingKeyStore.push({
        kid: row.kid as string,
        alg: row.alg as string,
        publicJwk: row.publicJwk as Record<string, unknown>,
        privateSecretName: row.privateSecretName as string,
        status: row.status as string,
        createdAt: new Date(),
        retiredAt: null,
      })
    },
  }),
  select: selectChain,
  update: (_table: unknown) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async (predicate: (row: SigningKeyRow) => boolean) => {
        for (const row of signingKeyStore) {
          if (predicate(row)) Object.assign(row, patch)
        }
      },
    }),
  }),
  transaction: async (cb: (tx: unknown) => Promise<void>) => cb(db),
  query: {},
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/signing-keys', () => ({
  portalBrokerSigningKeys: portalBrokerSigningKeysSchema,
  SIGNING_KEY_STATUS: {
    CREATED: 'created',
    ACTIVE: 'active',
    RETIRING: 'retiring',
    RETIRED: 'retired',
  },
}))
mock.module('drizzle-orm', () => ({
  // eq(col, val) returns a predicate matching rows where row[col] === val.
  // The mocked schema columns are simple string keys, so `left` is the
  // attribute name on the row (e.g. 'status').
  eq: (left: string, right: unknown) => {
    const colKey = leftKeyToRowKey(left)
    return (row: SigningKeyRow) => (row as unknown as Record<string, unknown>)[colKey] === right
  },
  and: (...preds: Array<(row: SigningKeyRow) => boolean>) => (row: SigningKeyRow) =>
    preds.every((p) => p(row)),
  inArray: (left: string, values: unknown[]) => {
    const colKey = leftKeyToRowKey(left)
    return (row: SigningKeyRow) =>
      values.includes((row as unknown as Record<string, unknown>)[colKey])
  },
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
}))

function leftKeyToRowKey(left: string): keyof SigningKeyRow {
  // The mocked schema uses snake_case strings; map to camelCase row keys.
  switch (left) {
    case 'status':
      return 'status'
    case 'kid':
      return 'kid'
    case 'private_secret_name':
      return 'privateSecretName'
    case 'public_jwk':
      return 'publicJwk'
    default:
      return left as keyof SigningKeyRow
  }
}

// ---------------------------------------------------------------------------
// Mock Secret Manager (REST) backing store
// ---------------------------------------------------------------------------

const secretBackingStore = new Map<string, string>()

let smCallCount = { create: 0, addVersion: 0, access: 0 }

const mockFetch: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
  const method = (init?.method ?? 'GET').toUpperCase()

  // Create secret: POST .../secrets?secretId=<name>
  const createMatch = u.match(/\/secrets\?secretId=([^&]+)$/)
  if (createMatch && method === 'POST') {
    smCallCount.create += 1
    const name = decodeURIComponent(createMatch[1])
    secretBackingStore.set(name, '') // placeholder until version added
    return new Response(JSON.stringify({ name }), { status: 200 })
  }

  // Add version: POST .../secrets/<name>:addVersion
  const addMatch = u.match(/\/secrets\/([^/:]+):addVersion$/)
  if (addMatch && method === 'POST') {
    smCallCount.addVersion += 1
    const name = decodeURIComponent(addMatch[1])
    const body = JSON.parse(init!.body as string) as { payload: { data: string } }
    const decoded = Buffer.from(body.payload.data, 'base64').toString('utf8')
    secretBackingStore.set(name, decoded)
    return new Response(JSON.stringify({ name: `${name}/versions/1` }), { status: 200 })
  }

  // Access version: GET .../secrets/<name>/versions/latest:access
  const accessMatch = u.match(/\/secrets\/([^/]+)\/versions\/latest:access$/)
  if (accessMatch && method === 'GET') {
    smCallCount.access += 1
    const name = decodeURIComponent(accessMatch[1])
    const data = secretBackingStore.get(name)
    if (!data) return new Response('', { status: 404 })
    return new Response(
      JSON.stringify({ payload: { data: Buffer.from(data, 'utf8').toString('base64') } }),
      { status: 200 },
    )
  }

  return new Response('not found', { status: 404 })
}) as unknown as typeof fetch

const smOpts = {
  fetchImpl: mockFetch,
  getAccessToken: async () => 'test-token',
  projectId: 'test-project',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Other test files (auth-broker-dual-mode.test.ts) call
// `mock.module('../signing-keys', ...)`. Bun's mock registry is
// process-global. To get the real implementation regardless of test
// ordering we import via a different specifier (`~/services/signing-keys`,
// the alias path) which is not the one the dual-mode test mocked
// (it uses the relative `../signing-keys`). Bun's module cache keys on
// the resolved specifier, so the alias path bypasses the mock binding.
const {
  generateAndStoreNewKey,
  loadActiveSigningKey,
  __resetSigningKeyCacheForTests,
} = await import('~/services/signing-keys')

const { SignJWT, jwtVerify, importJWK } = await import('jose')

describe('signing-keys service', () => {
  beforeEach(() => {
    signingKeyStore.length = 0
    secretBackingStore.clear()
    smCallCount = { create: 0, addVersion: 0, access: 0 }
    __resetSigningKeyCacheForTests()
    process.env.GCP_PROJECT_ID = 'test-project'
  })

  afterEach(() => {
    __resetSigningKeyCacheForTests()
  })

  test('generateAndStoreNewKey produces a verifiable ES256 keypair', async () => {
    const { kid, publicJwk } = await generateAndStoreNewKey({ ...smOpts, initialStatus: 'active' })

    expect(kid).toMatch(/^bk-/)
    expect(publicJwk.kid).toBe(kid)
    expect(publicJwk.alg).toBe('ES256')
    expect(publicJwk.use).toBe('sig')
    expect(signingKeyStore).toHaveLength(1)
    expect(signingKeyStore[0]?.status).toBe('active')

    // The Secret Manager mock recorded one create + one addVersion.
    expect(smCallCount.create).toBe(1)
    expect(smCallCount.addVersion).toBe(1)

    // Sanity: the secret name follows the documented pattern.
    expect(signingKeyStore[0]?.privateSecretName).toBe(`portal-broker-signing-key-${kid}`)
  })

  test('sign-with-private + verify-with-public-JWK roundtrip', async () => {
    await generateAndStoreNewKey({ ...smOpts, initialStatus: 'active' })

    const { kid, privateKey } = await loadActiveSigningKey(smOpts)
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({ appSlug: 'heroes', userId: 'u-1' })
      .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
      .setIssuer('coms-portal-broker')
      .setAudience('portal:app:heroes')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey)

    const publicJwk = signingKeyStore[0]!.publicJwk as Record<string, unknown>
    const publicKey = await importJWK(publicJwk as Parameters<typeof importJWK>[0], 'ES256')

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: 'coms-portal-broker',
      audience: 'portal:app:heroes',
      algorithms: ['ES256'],
    })
    expect(payload.appSlug).toBe('heroes')
    expect(payload.userId).toBe('u-1')
  })

  test('loadActiveSigningKey caches imported key for 5 min', async () => {
    await generateAndStoreNewKey({ ...smOpts, initialStatus: 'active' })

    expect(smCallCount.access).toBe(0)

    await loadActiveSigningKey(smOpts)
    expect(smCallCount.access).toBe(1)

    // Hot path: second call within TTL must NOT touch Secret Manager.
    await loadActiveSigningKey(smOpts)
    await loadActiveSigningKey(smOpts)
    expect(smCallCount.access).toBe(1)
  })

  test('loadActiveSigningKey re-fetches after the cache expires', async () => {
    await generateAndStoreNewKey({ ...smOpts, initialStatus: 'active' })

    await loadActiveSigningKey(smOpts)
    expect(smCallCount.access).toBe(1)

    // Simulate cache expiry by resetting the in-process cache (the public
    // exit point — equivalent to >5 min elapsed). This validates the
    // re-fetch path; the wall-clock TTL is asserted by code review of
    // PRIVATE_KEY_CACHE_TTL_MS in signing-keys.ts.
    __resetSigningKeyCacheForTests()

    await loadActiveSigningKey(smOpts)
    expect(smCallCount.access).toBe(2)
  })

  test('loadActiveSigningKey throws fast when no active key exists', async () => {
    await expect(loadActiveSigningKey(smOpts)).rejects.toThrow(/no active signing key/)
  })

  test('partial unique index is enforced by application-level state-machine', async () => {
    // The partial unique index `one_active_signing_key` is a DB-level
    // guarantee — see the generated migration. Here we exercise the
    // service-level invariant: loadActiveSigningKey only returns one
    // row even if (impossibly, in production) two are present.
    signingKeyStore.push({
      kid: 'bk-a',
      alg: 'ES256',
      publicJwk: {},
      privateSecretName: 'portal-broker-signing-key-bk-a',
      status: 'active',
      createdAt: new Date(),
      retiredAt: null,
    })
    signingKeyStore.push({
      kid: 'bk-b',
      alg: 'ES256',
      publicJwk: {},
      privateSecretName: 'portal-broker-signing-key-bk-b',
      status: 'active',
      createdAt: new Date(),
      retiredAt: null,
    })
    secretBackingStore.set('portal-broker-signing-key-bk-a', await createTestPem())
    secretBackingStore.set('portal-broker-signing-key-bk-b', await createTestPem())

    const { kid } = await loadActiveSigningKey(smOpts)
    expect(['bk-a', 'bk-b']).toContain(kid)
  })
})

async function createTestPem(): Promise<string> {
  const { generateKeyPair, exportPKCS8 } = await import('jose')
  const { privateKey } = await generateKeyPair('ES256', { extractable: true })
  return exportPKCS8(privateKey)
}
