/**
 * userinfo + RP-initiated logout tests (Rev 3 Spec 01).
 *
 * Tests:
 *   - GET /userinfo: 401 without session, 200 with documented shape when authenticated
 *   - POST /auth/logout: rejects unallowlisted post_logout_redirect_uri (400)
 *   - POST /auth/logout: accepts allowlisted URI (with trailing-slash normalization)
 *   - GET /auth/logout: 400 without redirect, 400 unallowlisted, 303 with allowlisted target
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Module mocks — pattern matches well-known.test.ts
// ---------------------------------------------------------------------------

interface MockUser {
  id: string
  gipUid: string
  email: string
  name: string
  portalRole: 'employee' | 'admin'
  status: 'active' | 'inactive'
  apps: string[]
}

interface MockApp {
  slug: string
  name: string
  url: string
  status?: 'active' | 'deprecated'
}

let mockUser: MockUser | null = null
let mockApps: MockApp[] = []
let mockSessionValid = true

function setMockUser(user: MockUser | null) {
  mockUser = user
}
function setMockApps(apps: MockApp[]) {
  mockApps = apps
}
function setMockSessionValid(valid: boolean) {
  mockSessionValid = valid
}

// Drizzle stub — chainable select / from / where with thenable returns.
// auth.ts uses `.from(t).where(ne(status, 'deprecated'))` (post red-cell fix);
// userinfo.ts uses `.from(t).where(inArray(slug, [...]))`. The where mock
// inspects the predicate marker emitted by our drizzle-orm mock and applies
// the deprecated-row filter when present. Other predicates pass through
// unfiltered, matching the prior behavior.
function makeThenable(): {
  from: () => unknown
  then: (resolve: (v: unknown) => void) => void
  where: (predicate?: unknown) => unknown
} {
  const obj = {
    from: () => makeThenable(),
    then: (resolve: (v: unknown) => void) => resolve(mockApps),
    where: (predicate?: unknown) => {
      const isDeprecatedFilter =
        predicate !== null &&
        typeof predicate === 'object' &&
        (predicate as { op?: string }).op === 'ne' &&
        (predicate as { r?: unknown }).r === 'deprecated'
      const rows = isDeprecatedFilter
        ? mockApps.filter((a) => (a.status ?? 'active') !== 'deprecated')
        : mockApps
      return Promise.resolve(rows)
    },
  }
  return obj
}

const db = {
  select: () => makeThenable(),
  query: {
    identityUsers: {
      findFirst: () => Promise.resolve(mockUser),
    },
  },
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema', () => ({
  identityUsers: { gipUid: 'gip_uid', id: 'id' },
  sessionRevocations: {},
  teamMembers: {},
  appRegistry: { slug: 'slug', name: 'name', url: 'url', status: 'status' },
  teamAppAccess: {},
}))
mock.module('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ op: 'eq', l, r }),
  and: (...c: unknown[]) => ({ op: 'and', c }),
  ne: (l: unknown, r: unknown) => ({ op: 'ne', l, r }),
  inArray: () => ({ op: 'inArray' }),
  gte: () => ({ op: 'gte' }),
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
}))

// gip-admin: stub verifySessionCookie + verifyIdToken.
// Bun mock.module identifies modules by specifier string; consumers that
// import via '../gip-admin' and consumers that import via '~/gip-admin' would
// resolve to the same file but different module identity inside bun's mock
// store. Our consumers use '../gip-admin' (auth.ts and userinfo.ts both).
const gipAdminMock = {
  verifySessionCookie: async (cookie: string) => {
    if (!mockSessionValid || cookie === 'invalid') {
      throw new Error('Invalid session')
    }
    return { uid: mockUser?.gipUid ?? 'unknown', email: mockUser?.email ?? '' }
  },
  verifyIdToken: async () => ({ uid: 'unknown', email: '' }),
  createSessionCookie: async () => 'cookie',
}
mock.module('../gip-admin', () => gipAdminMock)
mock.module('../../gip-admin', () => gipAdminMock)
mock.module('~/gip-admin', () => gipAdminMock)

// resolveAuthUser: stub returns the configured mockUser as a SessionUser
const middlewareAuthMock = {
  resolveAuthUser: async () => {
    if (!mockUser) throw new Error('User not found')
    return {
      id: mockUser.id,
      gipUid: mockUser.gipUid,
      email: mockUser.email,
      name: mockUser.name,
      portalRole: mockUser.portalRole,
      teamIds: [],
      apps: mockUser.apps,
    }
  },
  AuthResolutionError: class extends Error {},
  authPlugin: { name: 'auth-plugin' },
}
mock.module('../middleware/auth', () => middlewareAuthMock)
mock.module('../../middleware/auth', () => middlewareAuthMock)
mock.module('~/middleware/auth', () => middlewareAuthMock)

// Service-layer mocks. Multiple specifier spellings for the same module so
// bun's mock store intercepts whether the consumer imports via '../', '../../',
// or the '~/' tsconfig alias.
const claimsMock = { resolveAndSyncClaims: async () => undefined }
mock.module('../services/claims', () => claimsMock)
mock.module('../../services/claims', () => claimsMock)
mock.module('~/services/claims', () => claimsMock)

const sessionRevocationMock = {
  revokePortalSession: async () => undefined,
  listAppSlugsForUser: async () => mockUser?.apps ?? [],
}
mock.module('../services/session-revocation', () => sessionRevocationMock)
mock.module('../../services/session-revocation', () => sessionRevocationMock)
mock.module('~/services/session-revocation', () => sessionRevocationMock)

const authBrokerMock = {
  BrokerAuthorizationError: class extends Error {},
  BrokerValidationError: class extends Error {},
  createBrokerHandoff: async () => ({}),
  exchangeBrokerHandoff: async () => ({}),
  findBrokerAppBySlug: async () => null,
}
mock.module('../services/auth-broker', () => authBrokerMock)
mock.module('../../services/auth-broker', () => authBrokerMock)
mock.module('~/services/auth-broker', () => authBrokerMock)

const oidcVerifierMock = { verifyGoogleIdToken: async () => undefined }
mock.module('../services/oidc-verifier', () => oidcVerifierMock)
mock.module('../../services/oidc-verifier', () => oidcVerifierMock)
mock.module('~/services/oidc-verifier', () => oidcVerifierMock)

const middlewareSessionCookieMock = {
  getSessionCookieValue: (cookieHeader: string) => {
    const m = /(?:^|; )__session=([^;]+)/.exec(cookieHeader)
    return m ? m[1] : undefined
  },
}
mock.module('../middleware/session-cookie', () => middlewareSessionCookieMock)
mock.module('../../middleware/session-cookie', () => middlewareSessionCookieMock)
mock.module('~/middleware/session-cookie', () => middlewareSessionCookieMock)

const { authRoutes } = await import('../auth')
const { userinfoRoutes } = await import('../userinfo')

// Compose into a tree that mirrors index.ts (api/auth + api/userinfo)
import { Elysia } from 'elysia'
const app = new Elysia({ prefix: '/api' })
  .use(authRoutes)
  .use(userinfoRoutes)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authedRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({
    cookie: '__session=valid-cookie',
  })
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function unauthedRequest(method: string, path: string): Request {
  return new Request(`http://localhost${path}`, { method })
}

beforeEach(() => {
  mockUser = {
    id: 'user-1',
    gipUid: 'gip-1',
    email: 'jane@aha.test',
    name: 'Jane Smith',
    portalRole: 'employee',
    status: 'active',
    apps: ['heroes'],
  }
  mockApps = [
    { slug: 'heroes', name: 'Heroes', url: 'https://heroes.ahacommerce.net' },
  ]
  mockSessionValid = true
})

// ---------------------------------------------------------------------------
// userinfo
// ---------------------------------------------------------------------------

describe('GET /api/userinfo', () => {
  test('returns 401 when no session cookie present', async () => {
    const res = await app.handle(unauthedRequest('GET', '/api/userinfo'))
    expect(res.status).toBe(401)
  })

  test('returns 401 when session cookie is invalid', async () => {
    setMockSessionValid(false)
    const res = await app.handle(authedRequest('GET', '/api/userinfo'))
    expect(res.status).toBe(401)
  })

  test('returns documented shape for authenticated user', async () => {
    const res = await app.handle(authedRequest('GET', '/api/userinfo'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sub).toBe('user-1')
    expect(body.name).toBe('Jane Smith')
    expect(body.email).toBe('jane@aha.test')
    expect(body.role).toBe('employee')
    expect(body.avatar_url).toBeNull()
    expect(body.apps).toEqual([
      { slug: 'heroes', label: 'Heroes', url: 'https://heroes.ahacommerce.net' },
    ])
  })

  test('returns empty apps list when user has no app access', async () => {
    setMockUser({ ...mockUser!, apps: [] })
    const res = await app.handle(authedRequest('GET', '/api/userinfo'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.apps).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout — allowlist
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout with post_logout_redirect_uri', () => {
  test('returns 400 when post_logout_redirect_uri is not allowlisted', async () => {
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://attacker.example/steal',
      }),
    )
    expect(res.status).toBe(400)
  })

  test('returns 400 for malformed URI', async () => {
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'not-a-url',
      }),
    )
    expect(res.status).toBe(400)
  })

  test('returns 400 for non-http protocol (data:, javascript:)', async () => {
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'javascript:alert(1)',
      }),
    )
    expect(res.status).toBe(400)
  })

  test('returns 200 + redirect_to when URI is in app_registry allowlist', async () => {
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://heroes.ahacommerce.net',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    // URL.toString() canonicalizes origin-only URLs with a trailing slash.
    expect(body.redirect_to).toBe('https://heroes.ahacommerce.net/')
  })

  test('treats https://host and https://host/ as the same allowlisted origin', async () => {
    // Origin-comparison subsumes manual trailing-slash normalization: both
    // forms parse to the same URL.origin.
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://heroes.ahacommerce.net/',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.redirect_to).toBe('https://heroes.ahacommerce.net/')
  })

  test('returns 200 (no redirect_to) when no post_logout_redirect_uri provided', async () => {
    const res = await app.handle(authedRequest('POST', '/api/auth/logout'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.redirect_to).toBeUndefined()
  })

  test('accepts per-path URI under allowlisted origin (spec-01 line 91 contract)', async () => {
    // Heroes integration handoff promises Heroes can pass `/logged-out` as a
    // branded splash. Origin-match must permit any pathname under a registered
    // origin. Pre-fix this returned 400.
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://heroes.ahacommerce.net/logged-out',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.redirect_to).toBe('https://heroes.ahacommerce.net/logged-out')
  })

  test('rejects per-path URI under non-allowlisted origin even with allowlisted-looking path', async () => {
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://attacker.example/heroes.ahacommerce.net',
      }),
    )
    expect(res.status).toBe(400)
  })

  test('rejects URI whose origin matches a deprecated app_registry row', async () => {
    setMockApps([
      { slug: 'retired', name: 'Retired', url: 'https://retired.ahacommerce.net', status: 'deprecated' },
      { slug: 'heroes', name: 'Heroes', url: 'https://heroes.ahacommerce.net' },
    ])
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://retired.ahacommerce.net',
      }),
    )
    expect(res.status).toBe(400)
  })

  test('accepts case-insensitive host match (URL.origin canonicalizes)', async () => {
    const res = await app.handle(
      authedRequest('POST', '/api/auth/logout', {
        post_logout_redirect_uri: 'https://Heroes.AhaCommerce.NET/',
      }),
    )
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/logout — RP-initiated
// ---------------------------------------------------------------------------

describe('GET /api/auth/logout (RP-initiated)', () => {
  test('returns 400 when post_logout_redirect_uri query param missing', async () => {
    const res = await app.handle(unauthedRequest('GET', '/api/auth/logout'))
    // Elysia query validation will produce a 422-ish; we accept any 4xx here.
    expect(res.status >= 400 && res.status < 500).toBe(true)
  })

  test('returns 400 when post_logout_redirect_uri is not allowlisted', async () => {
    const res = await app.handle(
      unauthedRequest(
        'GET',
        '/api/auth/logout?post_logout_redirect_uri=https%3A%2F%2Fattacker.example',
      ),
    )
    expect(res.status).toBe(400)
  })

  test('returns 303 redirect when post_logout_redirect_uri is allowlisted', async () => {
    const res = await app.handle(
      unauthedRequest(
        'GET',
        '/api/auth/logout?post_logout_redirect_uri=https%3A%2F%2Fheroes.ahacommerce.net',
      ),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://heroes.ahacommerce.net/')
  })

  test('303 redirect treats https://host and https://host/ as the same origin', async () => {
    const res = await app.handle(
      unauthedRequest(
        'GET',
        '/api/auth/logout?post_logout_redirect_uri=https%3A%2F%2Fheroes.ahacommerce.net%2F',
      ),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://heroes.ahacommerce.net/')
  })

  test('id_token_hint is accepted but not required for redirect to land', async () => {
    const res = await app.handle(
      unauthedRequest(
        'GET',
        '/api/auth/logout?post_logout_redirect_uri=https%3A%2F%2Fheroes.ahacommerce.net&id_token_hint=eyJhbG.test.sig',
      ),
    )
    expect(res.status).toBe(303)
  })
})
