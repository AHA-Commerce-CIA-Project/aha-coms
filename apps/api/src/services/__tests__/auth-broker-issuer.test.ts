/**
 * Dual-issuer verifier tests (Rev 2 §02).
 *
 * Asserts that the broker token verifier (both HS256 and ES256 paths) accepts:
 *   1. The new URL-form issuer  `https://coms.ahacommerce.net/broker`
 *   2. The legacy bare-string   `coms-portal-broker`
 *
 * This is the acceptance criterion for the dual-mode transition: a Heroes
 * instance running HS256 verification with the old issuer can still exchange
 * tokens, while a new Heroes instance using ES256 + URL-form issuer also works.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { SignJWT, generateKeyPair, exportJWK, importJWK } from 'jose'

// ---------------------------------------------------------------------------
// Shared ES256 test key — generated once, reused across tests
// ---------------------------------------------------------------------------

const { privateKey: testPrivKey, publicKey: testPubKey } = await generateKeyPair('ES256', { extractable: true })
const testKid = 'bk-issuer-test'
const testPublicJwk = { ...(await exportJWK(testPubKey)), kid: testKid, alg: 'ES256', use: 'sig' }

// ---------------------------------------------------------------------------
// DB mock — app registry + signing keys table
// ---------------------------------------------------------------------------

const appRegistryStore: Record<string, Record<string, unknown>> = {
  heroes: {
    slug: 'heroes',
    url: 'https://heroes.example.com',
    transportMode: 'portable_token',
    handoffMode: 'token_exchange',
    brokerOrigin: 'https://coms.example.com',
    status: 'active',
    brokerSigningSecret: null,
  },
}

// The DB mock for the ES256 verifier must be select-chainable
const signingKeyDbRows = [{ kid: testKid, publicJwk: testPublicJwk }]

const db = {
  select: (_cols: unknown) => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => Promise.resolve(signingKeyDbRows),
    }),
  }),
  update: () => ({ set: () => ({ where: async () => {} }) }),
  query: {
    appRegistry: {
      findFirst: async (opts: { where: { right?: unknown } }) =>
        appRegistryStore[opts.where.right as string] ?? null,
    },
    authHandoffs: {
      findFirst: async () => null,
    },
  },
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/apps', () => ({ appRegistry: { slug: 'app_registry.slug' } }))
mock.module('~/db/schema/auth-handoffs', () => ({ authHandoffs: {} }))
mock.module('~/db/schema/signing-keys', () => ({
  portalBrokerSigningKeys: { kid: 'kid', publicJwk: 'public_jwk', status: 'status' },
  SIGNING_KEY_STATUS: {
    CREATED: 'created',
    ACTIVE: 'active',
    RETIRING: 'retiring',
    RETIRED: 'retired',
  },
}))
mock.module('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ left: l, right: r }),
  inArray: (l: unknown, v: unknown[]) => ({ left: l, values: v }),
  and: (...c: unknown[]) => ({ c }),
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
}))

// Stub signing-keys service — not needed for verifier tests
mock.module('../signing-keys', () => ({
  loadActiveSigningKey: async () => { throw new Error('not needed in verifier tests') },
}))

const { exchangeBrokerHandoff } = await import('../auth-broker')

// ---------------------------------------------------------------------------
// Token minting helpers
// ---------------------------------------------------------------------------

const HS256_SECRET = new TextEncoder().encode('test-broker-secret')
const AUDIENCE = 'portal:app:heroes'
const NEW_ISSUER = 'https://coms.ahacommerce.net/broker'
const LEGACY_ISSUER = 'coms-portal-broker'

function basePayload() {
  const now = Math.floor(Date.now() / 1000)
  return {
    appSlug: 'heroes',
    userId: 'u1',
    gipUid: 'g1',
    email: 'a@b.com',
    name: 'Test',
    portalRole: 'employee',
    teamIds: [],
    apps: ['heroes'],
  } as const
}

async function mintHS256(issuer: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...basePayload() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(HS256_SECRET)
}

async function mintES256(issuer: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...basePayload() })
    .setProtectedHeader({ alg: 'ES256', kid: testKid, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(testPrivKey)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dual-issuer verifier (Rev 2 §02)', () => {
  beforeEach(() => {
    process.env.PORTAL_BROKER_SIGNING_SECRET = 'test-broker-secret'
  })

  // HS256 path -----------------------------------------------------------

  test('HS256 token with new URL-form issuer is accepted', async () => {
    const token = await mintHS256(NEW_ISSUER)
    const result = await exchangeBrokerHandoff({ appSlug: 'heroes', token })
    expect(result.sessionUser.email).toBe('a@b.com')
  })

  test('HS256 token with legacy bare-string issuer is accepted (dual-mode)', async () => {
    const token = await mintHS256(LEGACY_ISSUER)
    const result = await exchangeBrokerHandoff({ appSlug: 'heroes', token })
    expect(result.sessionUser.email).toBe('a@b.com')
  })

  // ES256 path -----------------------------------------------------------

  test('ES256 token with new URL-form issuer is accepted', async () => {
    const token = await mintES256(NEW_ISSUER)
    const result = await exchangeBrokerHandoff({ appSlug: 'heroes', token })
    expect(result.sessionUser.email).toBe('a@b.com')
  })

  test('ES256 token with legacy bare-string issuer is accepted (dual-mode)', async () => {
    const token = await mintES256(LEGACY_ISSUER)
    const result = await exchangeBrokerHandoff({ appSlug: 'heroes', token })
    expect(result.sessionUser.email).toBe('a@b.com')
  })

  test('ES256 token with unknown issuer is rejected', async () => {
    const token = await mintES256('https://evil.example.com/broker')
    await expect(
      exchangeBrokerHandoff({ appSlug: 'heroes', token })
    ).rejects.toThrow()
  })
})
