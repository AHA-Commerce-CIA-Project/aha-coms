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
import { fullDrizzleOrmMock, fullSchemaBarrelMock, mockSpecs } from '~/test-helpers/schema-barrel-mock'

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
      // Detect `ne(appRegistry.status, 'deprecated')` from the shared
      // drizzle-orm mock helper, which emits `{type: 'ne', left, right}`.
      const isDeprecatedFilter =
        predicate !== null &&
        typeof predicate === 'object' &&
        (predicate as { type?: string }).type === 'ne' &&
        (predicate as { right?: unknown }).right === 'deprecated'
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
mock.module('~/db/schema', () => fullSchemaBarrelMock())
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// Registered under all three specifier spellings since auth.ts imports via
// '../gip-admin' but userinfo.ts and other transitive callers may use '~/gip-admin'.
// Real exports are spread so transitive production imports (revokeRefreshTokens
// from the session-revocation chain, etc.) resolve.
const realGipAdmin = { ...(await import('~/gip-admin')) }
const GIP_ADMIN_SPECS = ['../gip-admin', '../../gip-admin', '~/gip-admin']

const gipAdminMock = {
  ...realGipAdmin,
  verifyIdToken: async () => ({ uid: 'unknown', email: '' }),
}
mockSpecs(GIP_ADMIN_SPECS, () => gipAdminMock)

// Mock portal-native sessions service (replaces GIP verifySessionCookie)
const SESSIONS_SPECS = ['../services/sessions', '../../services/sessions', '~/services/sessions']
mockSpecs(SESSIONS_SPECS, () => ({
  validateSession: async (cookie: string) => {
    if (!mockSessionValid || cookie === 'invalid') return null
    if (!mockUser) return null
    return {
      id: mockUser.id,
      sessionId: 'session-1',
      gipUid: mockUser.gipUid,
      name: mockUser.name,
      portalRole: mockUser.portalRole,
    }
  },
  revokeSession: async () => undefined,
  createPortalSession: async () => ({ sessionId: 'session-new', expiresAt: new Date() }),
}))

// Mock email-resolution service (getDisplayEmail is called by resolveAuthUser; getEmailEntries by userinfo)
const EMAIL_RESOLUTION_SPECS = ['../services/email-resolution', '../../services/email-resolution', '~/services/email-resolution']
mockSpecs(EMAIL_RESOLUTION_SPECS, () => ({
  getDisplayEmail: async () => mockUser?.email ?? null,
  getEmailEntries: async () => mockUser ? [{ address: mockUser.email, kind: 'workspace', isPrimary: true, verified: true, addedBy: 'admin' }] : [],
}))

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
mockSpecs(['../middleware/auth', '../../middleware/auth', '~/middleware/auth'], () => middlewareAuthMock)

// Specifier triples: relative-from-routes, relative-from-routes/__tests__, and
// the '~/' tsconfig alias. Bun's mock store keys by literal specifier string,
// so we register every form a route may use. Real exports are spread into each
// mock so transitive production imports (BrokerValidationError, etc.) resolve.
const realAuthBroker = { ...(await import('~/services/auth-broker')) }
const realOidcVerifier = { ...(await import('~/services/oidc-verifier')) }
const realSessionRevocation = { ...(await import('~/services/session-revocation')) }

const SESSION_REVOCATION_SPECS = [
  '../services/session-revocation',
  '../../services/session-revocation',
  '~/services/session-revocation',
]
const AUTH_BROKER_SPECS = ['../services/auth-broker', '../../services/auth-broker', '~/services/auth-broker']
const OIDC_VERIFIER_SPECS = [
  '../services/oidc-verifier',
  '../../services/oidc-verifier',
  '~/services/oidc-verifier',
]

mockSpecs(SESSION_REVOCATION_SPECS, () => ({
  ...realSessionRevocation,
  revokePortalSession: async () => undefined,
  listAppSlugsForUser: async () => mockUser?.apps ?? [],
}))

mockSpecs(AUTH_BROKER_SPECS, () => ({
  ...realAuthBroker,
  createBrokerHandoff: async () => ({}),
  exchangeBrokerHandoff: async () => ({}),
  findBrokerAppBySlug: async () => null,
}))

mockSpecs(OIDC_VERIFIER_SPECS, () => ({
  ...realOidcVerifier,
  verifyGoogleOidcToken: async () => ({ email: '', sub: '' }),
  verifyGoogleIdToken: async () => ({ email: '', sub: '' }),
}))

const middlewareSessionCookieMock = {
  getSessionCookieValue: (cookieHeader: string) => {
    const m = /(?:^|; )__session=([^;]+)/.exec(cookieHeader)
    return m ? m[1] : undefined
  },
}
mockSpecs(
  ['../middleware/session-cookie', '../../middleware/session-cookie', '~/middleware/session-cookie'],
  () => middlewareSessionCookieMock,
)

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
    // Q8b: emails array is present
    expect(Array.isArray(body.emails)).toBe(true)
    expect(body.portalRole).toBe('employee')
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
