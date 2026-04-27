import { beforeEach, describe, expect, test } from 'bun:test'
import { mock } from 'bun:test'

// ---------------------------------------------------------------------------
// Module stubs — must come before the dynamic import of auth-broker
// ---------------------------------------------------------------------------

mock.module('~/db', () => ({ db: {} }))
mock.module('~/db/schema/apps', () => ({
  appRegistry: { slug: 'app_registry.slug' },
}))
mock.module('~/db/schema/auth-handoffs', () => ({
  authHandoffs: { id: 'auth_handoffs.id', codeHash: 'auth_handoffs.code_hash' },
}))
mock.module('~/db/schema/signing-keys', () => ({
  portalBrokerSigningKeys: { kid: 'kid', publicJwk: 'public_jwk', status: 'status' },
  SIGNING_KEY_STATUS: {
    CREATED: 'created',
    ACTIVE: 'active',
    RETIRING: 'retiring',
    RETIRED: 'retired',
  },
}))
// Deliberately do NOT mock `../signing-keys`: bun's process-global
// `mock.module` would bleed into 01-signing-keys.test.ts. The audience
// tests only exercise sanitizeRedirectTo + brokerAudienceFor; they do
// not invoke signBrokerToken, so the real signing-keys module is loaded
// but never called.
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
  inArray: (left: unknown, values: unknown[]) => ({ left, values }),
  // sql and relations needed by the ~/db/schema barrel's new re-exports
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  and: (...conditions: unknown[]) => ({ conditions }),
}))

const { brokerAudienceFor, BrokerValidationError, sanitizeRedirectTo } = await import('../auth-broker')

// jose is used for JWT operations; import it directly (no mock needed — we
// test real signing/verification to exercise the audience binding).
const { SignJWT, jwtVerify } = await import('jose')

// ---------------------------------------------------------------------------
// 3. Per-app audience
// ---------------------------------------------------------------------------

const ISSUER = 'coms-portal-broker'
const SECRET_KEY = new TextEncoder().encode('test-broker-secret-audience')

/**
 * Sign a minimal JWT bound to a specific appSlug audience, mimicking
 * the payload shape used by auth-broker.signBrokerToken.
 */
async function signForApp(appSlug: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ appSlug, userId: 'u-1', email: 'user@example.com' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(brokerAudienceFor(appSlug))
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(SECRET_KEY)
}

describe('brokerAudienceFor', () => {
  test("returns 'portal:app:heroes' for slug 'heroes'", () => {
    expect(brokerAudienceFor('heroes')).toBe('portal:app:heroes')
  })

  test("returns 'portal:app:orbit' for slug 'orbit'", () => {
    expect(brokerAudienceFor('orbit')).toBe('portal:app:orbit')
  })
})

describe('audience binding in JWT verification', () => {
  beforeEach(() => {
    process.env.PORTAL_BROKER_SIGNING_SECRET = 'test-broker-secret-audience'
  })

  test('signing for app A and verifying with audience for app B throws', async () => {
    const token = await signForApp('heroes')

    // Verifying a heroes-scoped token against the orbit audience must fail
    await expect(
      jwtVerify(token, SECRET_KEY, {
        issuer: ISSUER,
        audience: brokerAudienceFor('orbit'),
      }),
    ).rejects.toThrow()
  })

  test('signing and verifying for the same app succeeds', async () => {
    const token = await signForApp('orbit')

    const { payload } = await jwtVerify(token, SECRET_KEY, {
      issuer: ISSUER,
      audience: brokerAudienceFor('orbit'),
    })

    expect((payload as Record<string, unknown>).appSlug).toBe('orbit')
  })
})

// ---------------------------------------------------------------------------
// sanitizeRedirectTo
// ---------------------------------------------------------------------------

describe('sanitizeRedirectTo', () => {
  const APP_URL = 'https://heroes.example.com'

  // --- empty / absent inputs ---

  test('undefined input returns undefined (no warn)', () => {
    expect(sanitizeRedirectTo(undefined, APP_URL)).toBeUndefined()
  })

  test('null input returns undefined', () => {
    expect(sanitizeRedirectTo(null, APP_URL)).toBeUndefined()
  })

  test('empty string returns undefined', () => {
    expect(sanitizeRedirectTo('', APP_URL)).toBeUndefined()
  })

  // --- relative paths ---

  test('relative path is accepted as-is', () => {
    expect(sanitizeRedirectTo('/deep/path', APP_URL)).toBe('/deep/path')
  })

  test('root slash is accepted', () => {
    expect(sanitizeRedirectTo('/', APP_URL)).toBe('/')
  })

  // --- protocol-relative rejection ---

  test('protocol-relative URL is rejected', () => {
    expect(sanitizeRedirectTo('//evil.com/x', APP_URL)).toBeUndefined()
  })

  // --- dangerous schemes ---

  test('javascript: scheme is rejected', () => {
    expect(sanitizeRedirectTo('javascript:alert(1)', APP_URL)).toBeUndefined()
  })

  test('data: scheme is rejected', () => {
    expect(sanitizeRedirectTo('data:text/html,<h1>x</h1>', APP_URL)).toBeUndefined()
  })

  // --- host matching ---

  test('absolute URL matching registered host is accepted', () => {
    expect(sanitizeRedirectTo('https://heroes.example.com/foo', APP_URL)).toBe(
      'https://heroes.example.com/foo',
    )
  })

  test('absolute URL with a different host is rejected', () => {
    expect(sanitizeRedirectTo('https://evil.com/x', APP_URL)).toBeUndefined()
  })

  // --- port handling ---
  // Decision: compare hostname ONLY — port is ignored.
  // Rationale: Cloud Run assigns the same hostname regardless of port, and
  // app_registry.url typically omits the port number. Blocking on port
  // differences would be overly strict and would break legitimate traffic
  // during Cloud Run pilots where internal routing may use a non-standard port.
  test('same hostname with an explicit port is accepted (hostname-only comparison)', () => {
    expect(sanitizeRedirectTo('https://heroes.example.com:8443/foo', APP_URL)).toBe(
      'https://heroes.example.com:8443/foo',
    )
  })

  // --- malformed input ---

  test('malformed URL string is rejected', () => {
    expect(sanitizeRedirectTo('not a url', APP_URL)).toBeUndefined()
  })

  // --- http scheme ---

  test('http: absolute URL matching host is accepted (covers Cloud Run http-internal traffic)', () => {
    expect(sanitizeRedirectTo('http://heroes.example.com/path', APP_URL)).toBe(
      'http://heroes.example.com/path',
    )
  })
})
