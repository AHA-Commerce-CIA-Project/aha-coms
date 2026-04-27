/**
 * Rev 2 §01 — dual-mode broker minting tests.
 *
 * Asserts that createBrokerHandoff for a `token_exchange` app emits BOTH
 * an HS256 sibling (legacy `portal_token` query param, unchanged) AND an
 * ES256 sibling (`portal_token_es256` query param, new). Both must be
 * verifiable with their respective keys.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const handoffStore: Array<Record<string, unknown>> = []
const appRegistryStore: Record<string, Record<string, unknown>> = {}

const db = {
  insert: () => ({
    values(value: Record<string, unknown>) {
      handoffStore.push({
        id: `handoff-${handoffStore.length + 1}`,
        consumedAt: null,
        ...value,
      })
      return Promise.resolve()
    },
  }),
  update: () => ({
    set() {
      return { where: async () => {} }
    },
  }),
  query: {
    authHandoffs: { findFirst: async () => null },
    appRegistry: {
      findFirst: async (opts: { where: { right?: unknown } }) =>
        appRegistryStore[opts.where.right as string] ?? null,
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
  eq: (left: unknown, right: unknown) => ({ left, right }),
  inArray: (left: unknown, values: unknown[]) => ({ left, values }),
  and: (...conditions: unknown[]) => ({ conditions }),
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
}))

// Mock the signing-keys service to return a deterministic ES256 keypair.
// Capturing the public counterpart lets the test verify the emitted token
// without going through Secret Manager.
const { generateKeyPair, exportJWK, jwtVerify, importJWK, decodeProtectedHeader } = await import('jose')
const { privateKey: testPrivateKey, publicKey: testPublicKey } = await generateKeyPair('ES256', { extractable: true })
const testKid = 'bk-test-1'
const testPublicJwk = await exportJWK(testPublicKey)

mock.module('../signing-keys', () => ({
  loadActiveSigningKey: async () => ({ kid: testKid, privateKey: testPrivateKey }),
  generateAndStoreNewKey: async () => {
    throw new Error('generateAndStoreNewKey is stubbed in dual-mode tests')
  },
  rotateActiveKey: async () => {
    throw new Error('rotateActiveKey is stubbed in dual-mode tests')
  },
  __resetSigningKeyCacheForTests: () => {},
}))

const { createBrokerHandoff } = await import('../auth-broker')

describe('auth-broker dual-mode (Rev 2 §01)', () => {
  beforeEach(() => {
    handoffStore.length = 0
    for (const k of Object.keys(appRegistryStore)) delete appRegistryStore[k]
    appRegistryStore.orbit = {
      slug: 'orbit',
      url: 'https://orbit.example.com',
      transportMode: 'portable_token',
      handoffMode: 'token_exchange',
      brokerOrigin: 'https://coms.example.com',
      status: 'active',
      brokerSigningSecret: null,
    }
    process.env.PORTAL_BROKER_SIGNING_SECRET = 'test-broker-secret'
  })

  test('token_exchange handoff emits BOTH portal_token (HS256) and portal_token_es256 query params', async () => {
    const response = await createBrokerHandoff(
      {
        slug: 'orbit',
        url: 'https://orbit.example.com',
        transportMode: 'portable_token',
        handoffMode: 'token_exchange',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'admin',
        teamIds: ['team-1'],
        apps: ['orbit'],
      },
    )

    expect(response.handoffMode).toBe('token_exchange')

    // Rev 2 §02: new canonical fields on the response payload.
    expect(response.tokenHs256).toBeString()
    expect(response.tokenEs256).toBeString()
    // Back-compat alias: `token` must equal `tokenHs256`.
    expect(response.token).toBe(response.tokenHs256!)

    const url = new URL(response.redirectUrl)
    const hs256 = url.searchParams.get('portal_token')
    const es256 = url.searchParams.get('portal_token_es256')

    expect(hs256).toBeTruthy()
    expect(es256).toBeTruthy()
    expect(hs256).not.toBe(es256)

    // Redirect-URL params mirror the response payload fields.
    expect(hs256).toBe(response.tokenHs256!)
    expect(es256).toBe(response.tokenEs256!)

    // Rev 2 §02 + red-cell C2: HS256 and ES256 carry DIFFERENT issuers
    // during the dual-mode window. HS256 keeps the legacy bare-string so
    // today's Heroes (which verifies HS256 with `issuer: 'coms-portal-broker'`,
    // single string) keeps working. ES256 advertises the new URL-form for
    // stock OIDC clients and the discovery document.
    const legacyIssuer = 'coms-portal-broker'
    const newIssuer = 'https://coms.ahacommerce.net/broker'

    // HS256 must verify against the LEGACY issuer (Heroes-compat contract).
    const hsSecret = new TextEncoder().encode('test-broker-secret')
    const hsVerified = await jwtVerify(hs256!, hsSecret, {
      issuer: legacyIssuer,
      audience: 'portal:app:orbit',
      algorithms: ['HS256'],
    })
    expect((hsVerified.payload as Record<string, unknown>).iss).toBe(legacyIssuer)
    expect((hsVerified.payload as Record<string, unknown>).appSlug).toBe('orbit')

    // HS256 must NOT verify against the URL-form issuer alone — locking the
    // dual-mode contract: changing HS256 mint-side issuer would break Heroes.
    await expect(
      jwtVerify(hs256!, hsSecret, {
        issuer: newIssuer,
        audience: 'portal:app:orbit',
        algorithms: ['HS256'],
      }),
    ).rejects.toThrow()

    // ES256 carries the expected `kid` header and verifies with the public
    // JWK against the NEW URL-form issuer.
    const esHeader = decodeProtectedHeader(es256!)
    expect(esHeader.alg).toBe('ES256')
    expect(esHeader.kid).toBe(testKid)
    expect(esHeader.typ).toBe('JWT')

    const esPublicKey = await importJWK(testPublicJwk, 'ES256')
    const esVerified = await jwtVerify(es256!, esPublicKey, {
      issuer: newIssuer,
      audience: 'portal:app:orbit',
      algorithms: ['ES256'],
    })
    expect((esVerified.payload as Record<string, unknown>).iss).toBe(newIssuer)
    expect((esVerified.payload as Record<string, unknown>).appSlug).toBe('orbit')
    expect((esVerified.payload as Record<string, unknown>).userId).toBe('user-1')
  })

  test('redirect URL also carries portal_app and is otherwise well-formed', async () => {
    const response = await createBrokerHandoff(
      {
        slug: 'orbit',
        url: 'https://orbit.example.com',
        transportMode: 'portable_token',
        handoffMode: 'token_exchange',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'admin',
        teamIds: [],
        apps: ['orbit'],
      },
    )

    const url = new URL(response.redirectUrl)
    expect(url.origin).toBe('https://orbit.example.com')
    expect(url.searchParams.get('portal_app')).toBe('orbit')
    expect(url.searchParams.get('portal_token')).toBeTruthy()
    expect(url.searchParams.get('portal_token_es256')).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Red-cell C2 — mint-side issuer split contract
  // -------------------------------------------------------------------------
  //
  // This test locks the dual-mode safety invariant: HS256 tokens are minted
  // with the LEGACY bare-string issuer (so today's Heroes keeps verifying
  // them) while ES256 tokens are minted with the NEW URL-form issuer (so
  // stock OIDC clients and the discovery document line up).
  //
  // Decoding without verification — we only inspect the `iss` claim.
  // -------------------------------------------------------------------------

  test('HS256 carries legacy issuer; ES256 carries URL-form issuer (mint-side contract)', async () => {
    const response = await createBrokerHandoff(
      {
        slug: 'orbit',
        url: 'https://orbit.example.com',
        transportMode: 'portable_token',
        handoffMode: 'token_exchange',
        brokerOrigin: 'https://coms.example.com',
        status: 'active',
        brokerSigningSecret: null,
      },
      {
        id: 'user-1',
        gipUid: 'gip-1',
        email: 'user@example.com',
        name: 'User',
        portalRole: 'admin',
        teamIds: [],
        apps: ['orbit'],
      },
    )

    const url = new URL(response.redirectUrl)
    const hs256 = url.searchParams.get('portal_token')!
    const es256 = url.searchParams.get('portal_token_es256')!

    // Decode payloads without verification (we're locking the iss claim).
    const decode = (jwt: string) =>
      JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >

    expect(decode(hs256).iss).toBe('coms-portal-broker')
    expect(decode(es256).iss).toBe('https://coms.ahacommerce.net/broker')
  })
})
