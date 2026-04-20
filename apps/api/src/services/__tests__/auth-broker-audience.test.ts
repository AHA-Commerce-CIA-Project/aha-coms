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
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
  // sql and relations needed by the ~/db/schema barrel's new re-exports
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  and: (...conditions: unknown[]) => ({ conditions }),
}))

const { brokerAudienceFor, BrokerValidationError } = await import('../auth-broker')

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
