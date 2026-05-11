/**
 * Unit tests for services/sessions.ts (PR A, Spec 06 — Dual-Email Auth).
 *
 * Pattern: in-memory DB mock, same approach as session-revocation.test.ts.
 * Full integration tests (real Postgres roundtrip) are Task #9's scope.
 *
 * Covers:
 *  - createPortalSession + validateSession round-trip (happy path)
 *  - validateSession rejects a session whose revokedAt is set
 *  - validateSession rejects a session whose expiresAt is in the past
 *  - validateSession rejects non-UUID cookie values without DB query
 *  - validateSession rejects inactive user
 *  - validateSession rejects when session_revocations cutoff applies
 *  - revokeSession marks the row revoked
 *  - revokeAllSessionsForUser bulk-revokes and inserts cutoff on admin paths
 *  - insertSessionCutoff uses empty string for null gipUid (OTP-only user)
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Sentinel table objects — must match by reference in production import chain
// ---------------------------------------------------------------------------

const authSessions = {
  id: 'authSessions.id',
  identityUserId: 'authSessions.identityUserId',
  authMethod: 'authSessions.authMethod',
  emailUsed: 'authSessions.emailUsed',
  deviceLabel: 'authSessions.deviceLabel',
  ipAddress: 'authSessions.ipAddress',
  expiresAt: 'authSessions.expiresAt',
  createdAt: 'authSessions.createdAt',
  revokedAt: 'authSessions.revokedAt',
  revokedReason: 'authSessions.revokedReason',
}

const identityUsers = {
  id: 'identityUsers.id',
  gipUid: 'identityUsers.gipUid',
  name: 'identityUsers.name',
  portalRole: 'identityUsers.portalRole',
  status: 'identityUsers.status',
}

const sessionRevocations = {
  id: 'sessionRevocations.id',
  userId: 'sessionRevocations.userId',
  gipUid: 'sessionRevocations.gipUid',
  reason: 'sessionRevocations.reason',
  revokedAt: 'sessionRevocations.revokedAt',
  notBefore: 'sessionRevocations.notBefore',
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string
  identityUserId: string
  authMethod: string
  emailUsed: string | null
  deviceLabel: string | null
  ipAddress: string | null
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
  revokedReason: string | null
}

type UserRow = {
  id: string
  gipUid: string | null
  name: string
  portalRole: string
  status: string
}

type CutoffRow = {
  id: string
  userId: string
  gipUid: string
  reason: string
  revokedAt: Date
  notBefore: Date
}

let sessionStore: SessionRow[] = []
let userStore: UserRow[] = []
let cutoffStore: CutoffRow[] = []

// ---------------------------------------------------------------------------
// DB mock — mirrors the select/insert/update chain used by sessions.ts
// ---------------------------------------------------------------------------

function makeDb() {
  return {
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        if (table === authSessions) {
          sessionStore.push({
            id: value.id as string,
            identityUserId: value.identityUserId as string,
            authMethod: value.authMethod as string,
            emailUsed: (value.emailUsed as string | null) ?? null,
            deviceLabel: (value.deviceLabel as string | null) ?? null,
            ipAddress: (value.ipAddress as string | null) ?? null,
            expiresAt: value.expiresAt as Date,
            createdAt: new Date(),
            revokedAt: null,
            revokedReason: null,
          })
        } else if (table === sessionRevocations) {
          cutoffStore.push({
            id: `cutoff-${cutoffStore.length + 1}`,
            userId: value.userId as string,
            gipUid: value.gipUid as string,
            reason: value.reason as string,
            revokedAt: value.revokedAt as Date,
            notBefore: value.notBefore as Date,
          })
        }
        return Promise.resolve()
      },
    }),

    select: (_fields: unknown) => ({
      from: (table: unknown) => ({
        innerJoin: (_joinTable: unknown, _on: unknown) => ({
          where: (_cond: unknown) => ({
            limit: (_n: number) => {
              // validateSession join: authSessions + identityUsers
              if (table === authSessions) {
                const sess = sessionStore[0]
                if (!sess) return Promise.resolve([])
                const user = userStore.find((u) => u.id === sess.identityUserId)
                if (!user) return Promise.resolve([])
                return Promise.resolve([
                  {
                    sessionId: sess.id,
                    sessionCreatedAt: sess.createdAt,
                    sessionExpiresAt: sess.expiresAt,
                    sessionRevokedAt: sess.revokedAt,
                    identityUserId: user.id,
                    gipUid: user.gipUid,
                    name: user.name,
                    portalRole: user.portalRole,
                    identityStatus: user.status,
                  },
                ])
              }
              return Promise.resolve([])
            },
          }),
        }),
        where: (_cond: unknown) => ({
          limit: (_n: number) => {
            // cutoff check: sessionRevocations OR identityUsers lookup
            if (table === sessionRevocations) {
              return Promise.resolve(cutoffStore.length > 0 ? [cutoffStore[0]] : [])
            }
            if (table === identityUsers) {
              const user = userStore[0]
              return Promise.resolve(user ? [{ gipUid: user.gipUid }] : [])
            }
            return Promise.resolve([])
          },
        }),
      }),
    }),

    update: (_table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (_cond: unknown) => {
          // Apply update to first session in store (tests only have one at a time)
          const sess = sessionStore[0]
          if (sess && values.revokedAt) {
            sess.revokedAt = values.revokedAt as Date
            sess.revokedReason = (values.revokedReason as string) ?? null
          }
          return Promise.resolve()
        },
      }),
    }),
  }
}

let db = makeDb()

mock.module('~/db', () => ({ db }))

mock.module('~/db/schema', () => ({
  ...fullSchemaBarrelMock(),
  authSessions,
  identityUsers,
  sessionRevocations,
}))

mock.module('drizzle-orm', () => fullDrizzleOrmMock())

mock.module('~/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {} },
}))

const {
  createPortalSession,
  validateSession,
  revokeSession,
  revokeAllSessionsForUser,
  insertSessionCutoff,
  SESSION_TTL_MS,
  parseDeviceLabel,
} = await import('../sessions')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: { ua?: string; forwarded?: string } = {}): Request {
  const headers = new Headers()
  if (overrides.ua) headers.set('user-agent', overrides.ua)
  if (overrides.forwarded) headers.set('x-forwarded-for', overrides.forwarded)
  return new Request('http://localhost/', { headers })
}

function seedUser(overrides: Partial<UserRow> = {}): UserRow {
  const user: UserRow = {
    id: 'user-1',
    gipUid: 'gip-uid-1',
    name: 'Test User',
    portalRole: 'employee',
    status: 'active',
    ...overrides,
  }
  userStore.push(user)
  return user
}

beforeEach(() => {
  sessionStore = []
  userStore = []
  cutoffStore = []
  db = makeDb()
  // Re-point the mock to the fresh db object
  mock.module('~/db', () => ({ db }))
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SESSION_TTL_MS', () => {
  test('workspace_oidc is 14 days', () => {
    expect(SESSION_TTL_MS.workspace_oidc).toBe(14 * 24 * 60 * 60 * 1000)
  })
  test('personal_otp is 14 days', () => {
    expect(SESSION_TTL_MS.personal_otp).toBe(14 * 24 * 60 * 60 * 1000)
  })
  test('admin_bypass is 1 hour', () => {
    expect(SESSION_TTL_MS.admin_bypass).toBe(60 * 60 * 1000)
  })
})

describe('createPortalSession', () => {
  test('returns a sessionId (UUID) and expiresAt ~14 days from now', async () => {
    seedUser()
    const req = makeRequest({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/537.36' })

    const result = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: 'user@example.com',
      request: req,
    })

    // sessionId should be a v4 UUID
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )

    // expiresAt should be approximately 14 days from now
    const expectedMs = 14 * 24 * 60 * 60 * 1000
    const delta = result.expiresAt.getTime() - Date.now()
    expect(delta).toBeGreaterThan(expectedMs - 5000)
    expect(delta).toBeLessThan(expectedMs + 5000)

    // Row inserted into the store
    expect(sessionStore).toHaveLength(1)
    expect(sessionStore[0].authMethod).toBe('workspace_oidc')
  })

  test('stores ip from x-forwarded-for first segment', async () => {
    seedUser()
    const req = makeRequest({ forwarded: '203.0.113.1, 10.0.0.1' })

    await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'personal_otp',
      emailUsed: 'user@personal.com',
      request: req,
    })

    expect(sessionStore[0].ipAddress).toBe('203.0.113.1')
  })

  test('admin_bypass expiry is ~1 hour from now', async () => {
    seedUser()
    const req = makeRequest()

    const result = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'admin_bypass',
      emailUsed: null,
      request: req,
    })

    const expectedMs = 60 * 60 * 1000
    const delta = result.expiresAt.getTime() - Date.now()
    expect(delta).toBeGreaterThan(expectedMs - 5000)
    expect(delta).toBeLessThan(expectedMs + 5000)
  })
})

describe('validateSession — happy path', () => {
  test('returns SessionUser for a valid session', async () => {
    seedUser()
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: 'user@example.com',
      request: req,
    })

    const result = await validateSession(sessionId)

    expect(result).not.toBeNull()
    expect(result!.id).toBe('user-1')
    expect(result!.sessionId).toBe(sessionId)
    expect(result!.name).toBe('Test User')
    expect(result!.portalRole).toBe('employee')
  })
})

describe('validateSession — rejection cases', () => {
  test('returns null for a non-UUID cookie value (no DB query)', async () => {
    // No DB setup — if a query were made it would return nothing, but the
    // UUID guard should short-circuit before that.
    const result = await validateSession('not-a-uuid')
    expect(result).toBeNull()
  })

  test('returns null for empty string', async () => {
    expect(await validateSession('')).toBeNull()
  })

  test('returns null when revokedAt is set', async () => {
    seedUser()
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    // Manually mark revoked in the store
    sessionStore[0].revokedAt = new Date()

    const result = await validateSession(sessionId)
    expect(result).toBeNull()
  })

  test('returns null when expiresAt is in the past', async () => {
    seedUser()
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    // Wind the expiry back
    sessionStore[0].expiresAt = new Date(Date.now() - 1000)

    const result = await validateSession(sessionId)
    expect(result).toBeNull()
  })

  test('returns null when user status is not active', async () => {
    seedUser({ status: 'inactive' })
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    const result = await validateSession(sessionId)
    expect(result).toBeNull()
  })

  test('returns null when a session_revocations cutoff row exists', async () => {
    seedUser()
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    // Seed a cutoff row (notBefore > session.createdAt)
    cutoffStore.push({
      id: 'cutoff-1',
      userId: 'user-1',
      gipUid: 'gip-uid-1',
      reason: 'admin_revoke',
      revokedAt: new Date(),
      notBefore: new Date(Date.now() + 1000), // in the future — past the session.createdAt
    })

    const result = await validateSession(sessionId)
    expect(result).toBeNull()
  })
})

describe('revokeSession', () => {
  test('sets revokedAt on the session row', async () => {
    seedUser()
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    expect(sessionStore[0].revokedAt).toBeNull()

    await revokeSession(sessionId, 'logout')

    expect(sessionStore[0].revokedAt).toBeInstanceOf(Date)
    expect(sessionStore[0].revokedReason).toBe('logout')
  })
})

describe('revokeAllSessionsForUser', () => {
  test('revokes session with admin_revoke reason', async () => {
    seedUser()
    const req = makeRequest()
    await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    await revokeAllSessionsForUser({ userId: 'user-1', reason: 'admin_revoke' })

    expect(sessionStore[0].revokedAt).toBeInstanceOf(Date)
    expect(sessionStore[0].revokedReason).toBe('admin_revoke')
    // admin_revoke should also insert a cutoff row
    expect(cutoffStore).toHaveLength(1)
    expect(cutoffStore[0].userId).toBe('user-1')
    expect(cutoffStore[0].reason).toBe('admin_revoke')
  })

  test('revokes session with status_change and inserts cutoff', async () => {
    seedUser()
    const req = makeRequest()
    await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'personal_otp',
      emailUsed: null,
      request: req,
    })

    await revokeAllSessionsForUser({ userId: 'user-1', reason: 'status_change' })

    expect(cutoffStore).toHaveLength(1)
    expect(cutoffStore[0].reason).toBe('status_change')
  })

  test('does NOT insert cutoff for logout_all_other (user-initiated)', async () => {
    seedUser()
    const req = makeRequest()
    const { sessionId } = await createPortalSession({
      identityUserId: 'user-1',
      authMethod: 'workspace_oidc',
      emailUsed: null,
      request: req,
    })

    await revokeAllSessionsForUser({
      userId: 'user-1',
      reason: 'logout_all_other',
      exceptSessionId: sessionId,
    })

    expect(cutoffStore).toHaveLength(0)
  })
})

describe('insertSessionCutoff', () => {
  test('uses empty string for null gipUid (OTP-only user)', async () => {
    await insertSessionCutoff('user-otp', null, 'admin_revoke')

    expect(cutoffStore).toHaveLength(1)
    expect(cutoffStore[0].gipUid).toBe('')
  })

  test('passes gipUid through when present', async () => {
    await insertSessionCutoff('user-1', 'gip-uid-abc', 'status_change')

    expect(cutoffStore[0].gipUid).toBe('gip-uid-abc')
  })
})

describe('parseDeviceLabel', () => {
  test('Mac + Safari UA returns Mac · Safari with version', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    expect(parseDeviceLabel(ua)).toBe('Mac · Safari 18')
  })

  test('Windows + Chrome UA returns Windows · Chrome with version', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    expect(parseDeviceLabel(ua)).toBe('Windows · Chrome 130')
  })

  test('iPhone + Safari UA returns iPhone · Safari with version', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(parseDeviceLabel(ua)).toBe('iPhone · Safari 17')
  })

  test('null UA returns "Unknown device"', () => {
    expect(parseDeviceLabel(null)).toBe('Unknown device')
  })

  test('empty string UA returns "Unknown device"', () => {
    expect(parseDeviceLabel('')).toBe('Unknown device')
  })

  test('Linux + Firefox UA returns Linux · Firefox with version', () => {
    const ua =
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0'
    expect(parseDeviceLabel(ua)).toBe('Linux · Firefox 109')
  })
})
