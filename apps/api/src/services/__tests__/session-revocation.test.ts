import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test.
// We mock all schema modules individually so the drizzle pg-core constructors
// are never invoked. This matches the pattern in auth-broker.test.ts.
// ---------------------------------------------------------------------------

// Schema stubs — simple column-name sentinel objects
const identityUsers = { id: 'identityUsers.id', gipUid: 'identityUsers.gipUid' }
const sessionRevocations = { userId: 'sessionRevocations.userId', notBefore: 'sessionRevocations.notBefore' }
const teamMembers = { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' }
const teamAppAccess = { teamId: 'teamAppAccess.teamId', appId: 'teamAppAccess.appId' }
const appRegistry = { id: 'appRegistry.id', slug: 'appRegistry.slug' }

// In-memory user store
type UserRecord = {
  id: string
  gipUid: string | null
  email: string
  name: string
  portalRole: string
  status: string
}

let currentUser: UserRecord | null = null

// In-memory revocations store
const revocationStore: Array<Record<string, unknown>> = []

// Per-test select stub so we can simulate the three-step slug resolution:
// teamMembers → teamAppAccess → appRegistry
let selectStub: (() => Array<Record<string, unknown>>) | null = null

function defaultSelectStub() {
  selectStub = null
}

const db = {
  query: {
    identityUsers: {
      findFirst: async () => currentUser,
    },
  },
  insert: (_table: unknown) => ({
    values(value: Record<string, unknown>) {
      revocationStore.push({ id: `rev-${revocationStore.length + 1}`, ...value })
      return Promise.resolve()
    },
  }),
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      where: async () => (selectStub ? selectStub() : []),
    }),
  }),
}

mock.module('~/db', () => ({ db }))

// Mock the schema barrel with all symbols used by session-revocation + listAppSlugsForUser
mock.module('~/db/schema', () => ({
  identityUsers,
  sessionRevocations,
  teamMembers,
  teamAppAccess,
  appRegistry,
}))

mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
  inArray: (left: unknown, right: unknown) => ({ left, right }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
  gte: (left: unknown, right: unknown) => ({ left, right }),
  // sql and relations needed by schema files transitively loaded by the barrel
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
}))

// Mock GIP revokeRefreshTokens
// Path is relative to the TEST FILE: '../../gip-admin' resolves to src/gip-admin.ts
const revokeRefreshTokens = mock(async (_uid: string) => undefined)
mock.module('../../gip-admin', () => ({ revokeRefreshTokens }))

// Mock the webhook dispatcher via the dedicated re-export shim.
// We must NOT mock '../webhook-dispatcher' directly: Bun's `mock.module` is
// process-global and registered at file load, so a partial replacement of the
// dispatcher leaks into webhook-dispatcher.test.ts and worker tests, causing
// `signWebhookBody`/`verifyWebhookSignature`/`deliverWebhook` to come back as
// undefined for those suites. Mocking the thin re-export keeps the dispatcher
// untouched everywhere else.
const dispatchPortalWebhook = mock(async () => undefined)
mock.module('../portal-webhook-fanout', () => ({ dispatchPortalWebhook }))

const { revokePortalSession } = await import('../session-revocation')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUser(overrides: Partial<UserRecord> = {}) {
  currentUser = {
    id: 'user-1',
    gipUid: 'gip-uid-1',
    email: 'user@example.com',
    name: 'Test User',
    portalRole: 'employee',
    status: 'active',
    ...overrides,
  }
}

/**
 * Override db.select to simulate the three-step DB walk used by listAppSlugsForUser:
 *   1st call → teamMembers rows
 *   2nd call → teamAppAccess rows
 *   3rd call → appRegistry rows
 */
function mockAppSlugs(slugs: string[]) {
  let callCount = 0
  db.select = (_fields: unknown) => ({
    from: (_table: unknown) => ({
      where: async () => {
        callCount++
        if (callCount === 1) return slugs.length > 0 ? [{ teamId: 'team-1' }] : []
        if (callCount === 2) return slugs.length > 0 ? [{ appId: 'app-1' }] : []
        return slugs.map((slug) => ({ slug }))
      },
    }),
  })
}

function resetSelectToEmpty() {
  db.select = (_fields: unknown) => ({
    from: (_table: unknown) => ({
      where: async () => [],
    }),
  })
}

// ---------------------------------------------------------------------------
// 4. Session revocation tests
// ---------------------------------------------------------------------------

describe('revokePortalSession', () => {
  beforeEach(() => {
    currentUser = null
    revocationStore.length = 0
    revokeRefreshTokens.mockClear()
    dispatchPortalWebhook.mockClear()
    resetSelectToEmpty()
  })

  test('inserts a session_revocations row with notBefore close to now', async () => {
    setUser()
    const before = new Date()

    await revokePortalSession({ userId: 'user-1', reason: 'logout' })

    expect(revocationStore).toHaveLength(1)
    const row = revocationStore[0]
    expect(row.userId).toBe('user-1')
    expect(row.reason).toBe('logout')
    expect(row.notBefore).toBeInstanceOf(Date)
    const notBefore = row.notBefore as Date
    expect(notBefore.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100)
    expect(notBefore.getTime()).toBeLessThanOrEqual(Date.now() + 100)
  })

  test('calls revokeRefreshTokens with the user gipUid', async () => {
    setUser({ gipUid: 'gip-uid-abc' })

    await revokePortalSession({ userId: 'user-1', reason: 'logout' })

    expect(revokeRefreshTokens).toHaveBeenCalledTimes(1)
    expect(revokeRefreshTokens).toHaveBeenCalledWith('gip-uid-abc')
  })

  test('skips revokeRefreshTokens when gipUid is null', async () => {
    setUser({ gipUid: null })

    await revokePortalSession({ userId: 'user-1', reason: 'offboarded' })

    expect(revokeRefreshTokens).not.toHaveBeenCalled()
  })

  test('calls dispatchPortalWebhook with session.revoked and the user app slugs', async () => {
    setUser()
    mockAppSlugs(['heroes', 'orbit'])

    await revokePortalSession({ userId: 'user-1', reason: 'logout' })

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { appSlugs: string[] },
    ]
    expect(event).toBe('session.revoked')
    expect(payload.userId).toBe('user-1')
    expect(payload.reason).toBe('logout')
    expect(opts.appSlugs).toEqual(['heroes', 'orbit'])
  })

  test('does not call dispatchPortalWebhook when user has no apps', async () => {
    setUser()
    // db.select returns [] (no team memberships) — appSlugs resolves to []

    await revokePortalSession({ userId: 'user-1', reason: 'admin' })

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })

  test('throws when the user is not found', async () => {
    currentUser = null

    await expect(
      revokePortalSession({ userId: 'nonexistent', reason: 'logout' }),
    ).rejects.toThrow('not found')
  })
})
