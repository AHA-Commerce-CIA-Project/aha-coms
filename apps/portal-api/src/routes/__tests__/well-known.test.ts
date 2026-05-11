/**
 * Well-known routes tests (Rev 2 §01 + §02).
 *
 * Tests:
 *  - GET /.well-known/jwks.json returns active + retiring keys
 *  - GET /.well-known/openid-configuration returns valid discovery document
 *  - Discovery doc issuer matches the URL-form constant
 *  - Cache-control headers are set correctly
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { PLATFORM_AUTH_CONTRACT_VERSION } from '@coms-portal/shared/contracts/auth'

// ---------------------------------------------------------------------------
// DB mock — controls which signing-key rows are returned
// ---------------------------------------------------------------------------

const signingKeyRows: Array<{ publicJwk: Record<string, unknown> }> = []

const db = {
  select: (_cols: unknown) => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => Promise.resolve(signingKeyRows),
    }),
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/signing-keys', () => ({
  portalBrokerSigningKeys: {
    publicJwk: 'public_jwk',
    status: 'status',
  },
  SIGNING_KEY_STATUS: {
    CREATED: 'created',
    ACTIVE: 'active',
    RETIRING: 'retiring',
    RETIRED: 'retired',
  },
}))
mock.module('drizzle-orm', () => ({
  inArray: (_col: unknown, _vals: unknown[]) => ({ type: 'inArray' }),
  eq: (l: unknown, r: unknown) => ({ l, r }),
  and: (...c: unknown[]) => ({ c }),
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
}))

const { wellKnownRoutes } = await import('../well-known')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Call a route handler directly by matching path. */
async function callRoute(path: string): Promise<Response> {
  // Build a minimal Elysia test request — use the compiled handler.
  const app = wellKnownRoutes
  const url = `http://localhost${path}`
  return app.handle(new Request(url, { method: 'GET' }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /.well-known/jwks.json', () => {
  beforeEach(() => {
    signingKeyRows.length = 0
  })

  test('returns empty keys array when no active/retiring keys', async () => {
    const res = await callRoute('/.well-known/jwks.json')
    const body = await res.json()
    expect(body).toEqual({ keys: [] })
  })

  test('returns publicJwk objects for active and retiring keys', async () => {
    signingKeyRows.push(
      { publicJwk: { kty: 'EC', crv: 'P-256', kid: 'bk-1', alg: 'ES256', use: 'sig' } },
      { publicJwk: { kty: 'EC', crv: 'P-256', kid: 'bk-2', alg: 'ES256', use: 'sig' } },
    )

    const res = await callRoute('/.well-known/jwks.json')
    const body = await res.json() as { keys: unknown[] }

    expect(body.keys).toHaveLength(2)
    expect((body.keys[0] as Record<string, unknown>).kid).toBe('bk-1')
    expect((body.keys[1] as Record<string, unknown>).kid).toBe('bk-2')
  })

  test('sets Cache-Control: public, max-age=600, must-revalidate', async () => {
    const res = await callRoute('/.well-known/jwks.json')
    const cc = res.headers.get('cache-control') ?? ''
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=600')
    expect(cc).toContain('must-revalidate')
  })

  test('sets content-type application/json', async () => {
    const res = await callRoute('/.well-known/jwks.json')
    const ct = res.headers.get('content-type') ?? ''
    expect(ct).toContain('application/json')
  })
})

describe('GET /.well-known/openid-configuration', () => {
  test('returns 200 with JSON body', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toBeObject()
  })

  test('issuer is URL-form (https://.../broker)', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const doc = await res.json() as Record<string, unknown>
    const issuer = doc.issuer as string
    expect(issuer).toMatch(/^https?:\/\/.+\/broker$/)
  })

  test('jwks_uri points to /.well-known/jwks.json on the same origin', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const doc = await res.json() as Record<string, unknown>
    const jwksUri = doc.jwks_uri as string
    expect(jwksUri).toMatch(/\/.well-known\/jwks\.json$/)
    // issuer origin == jwks_uri origin
    const issuerOrigin = new URL(doc.issuer as string).origin
    const jwksOrigin = new URL(jwksUri).origin
    expect(issuerOrigin).toBe(jwksOrigin)
  })

  test('id_token_signing_alg_values_supported includes ES256', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const doc = await res.json() as Record<string, unknown>
    const algs = doc.id_token_signing_alg_values_supported as string[]
    expect(algs).toContain('ES256')
  })

  test('x-coms-platform-auth-contract-version matches PLATFORM_AUTH_CONTRACT_VERSION', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const doc = await res.json() as Record<string, unknown>
    expect(doc['x-coms-platform-auth-contract-version']).toBe(PLATFORM_AUTH_CONTRACT_VERSION)
  })

  test('sets Cache-Control: public, max-age=3600', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const cc = res.headers.get('cache-control') ?? ''
    expect(cc).toContain('public')
    expect(cc).toContain('max-age=3600')
  })

  test('claims_supported includes required OIDC standard claims', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const doc = await res.json() as Record<string, unknown>
    const claims = doc.claims_supported as string[]
    for (const required of ['sub', 'email', 'iss', 'aud', 'iat', 'exp']) {
      expect(claims).toContain(required)
    }
  })

  test('response_types_supported includes code', async () => {
    const res = await callRoute('/.well-known/openid-configuration')
    const doc = await res.json() as Record<string, unknown>
    expect(doc.response_types_supported).toContain('code')
  })
})
