/**
 * Tests for the self-service /api/me/sessions endpoints — Spec 06 PR E §10.
 *
 * Strategy: inline handler logic, mirroring auth-otp-routes.test.ts and
 * employees-sign-out.test.ts.  No module mocking required.
 *
 * Routes under test:
 *  - GET    /api/me/sessions                  → list active sessions for caller
 *  - DELETE /api/me/sessions/:id              → revoke a single session (gated by ownership)
 *  - POST   /api/me/sessions/sign-out-others  → revoke all sessions except current
 */
import { beforeEach, describe, expect, test } from 'bun:test'

type SessionRow = {
  id: string
  identityUserId: string
  authMethod: 'workspace_oidc' | 'personal_otp' | 'admin_bypass'
  deviceLabel: string | null
  ipAddress: string | null
  createdAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

let sessionStore: SessionRow[] = []
let revokeCalls: Array<{ id: string; reason: string }> = []
let bulkRevokeCalls: Array<{ userId: string; reason: string; exceptSessionId?: string }> = []

beforeEach(() => {
  sessionStore = []
  revokeCalls = []
  bulkRevokeCalls = []
})

function truncateIp(ip: string | null): string | null {
  if (!ip) return null
  // IPv4 last octet → xxx.  IPv6 last group → xxxx.
  if (ip.includes(':')) {
    const parts = ip.split(':')
    parts[parts.length - 1] = 'xxxx'
    return parts.join(':')
  }
  const parts = ip.split('.')
  if (parts.length === 4) {
    parts[3] = 'xxx'
    return parts.join('.')
  }
  return ip
}

type ListRow = {
  id: string
  authMethod: string
  deviceLabel: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

async function listHandler(args: {
  authUser: { id: string }
  currentSessionId: string
}): Promise<{ status: 200; body: { sessions: ListRow[] } }> {
  const now = new Date()
  const rows = sessionStore
    .filter(
      (r) =>
        r.identityUserId === args.authUser.id &&
        r.revokedAt === null &&
        r.expiresAt > now,
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(
      (r): ListRow => ({
        id: r.id,
        authMethod: r.authMethod,
        deviceLabel: r.deviceLabel,
        ipAddress: truncateIp(r.ipAddress),
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        isCurrent: r.id === args.currentSessionId,
      }),
    )
  return { status: 200, body: { sessions: rows } }
}

async function deleteHandler(args: {
  authUser: { id: string }
  currentSessionId: string
  sessionId: string
}): Promise<
  | { status: 200; body: { ok: true; clearedCookie: boolean } }
  | { status: 404; body: { error: 'SESSION_NOT_FOUND' } }
> {
  const row = sessionStore.find(
    (r) => r.id === args.sessionId && r.identityUserId === args.authUser.id && r.revokedAt === null,
  )
  if (!row) {
    return { status: 404, body: { error: 'SESSION_NOT_FOUND' } }
  }
  revokeCalls.push({ id: row.id, reason: 'logout_other_device' })
  const isCurrent = row.id === args.currentSessionId
  return { status: 200, body: { ok: true, clearedCookie: isCurrent } }
}

async function signOutOthersHandler(args: {
  authUser: { id: string }
  currentSessionId: string
}): Promise<{ status: 200; body: { ok: true } }> {
  bulkRevokeCalls.push({
    userId: args.authUser.id,
    reason: 'logout_all_other',
    exceptSessionId: args.currentSessionId,
  })
  return { status: 200, body: { ok: true } }
}

// ---------------------------------------------------------------------------
// GET /api/me/sessions
// ---------------------------------------------------------------------------
describe('GET /api/me/sessions', () => {
  test('returns own active sessions, marks current with isCurrent=true', async () => {
    const now = new Date()
    sessionStore = [
      {
        id: 'sess-current',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: 'Mac · Safari 18',
        ipAddress: '203.0.113.45',
        createdAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 14 * 86_400_000),
        revokedAt: null,
      },
      {
        id: 'sess-other-device',
        identityUserId: 'user-A',
        authMethod: 'personal_otp',
        deviceLabel: 'iPhone · Mobile Safari',
        ipAddress: '198.51.100.7',
        createdAt: new Date(now.getTime() - 86_400_000),
        expiresAt: new Date(now.getTime() + 14 * 86_400_000),
        revokedAt: null,
      },
    ]
    const res = await listHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'sess-current',
    })
    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions[0].id).toBe('sess-current')
    expect(res.body.sessions[0].isCurrent).toBe(true)
    expect(res.body.sessions[1].id).toBe('sess-other-device')
    expect(res.body.sessions[1].isCurrent).toBe(false)
  })

  test('IP addresses are truncated for display privacy', async () => {
    sessionStore = [
      {
        id: 'sess-1',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: '203.0.113.45',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
    ]
    const res = await listHandler({ authUser: { id: 'user-A' }, currentSessionId: 'x' })
    expect(res.body.sessions[0].ipAddress).toBe('203.0.113.xxx')
  })

  test('IPv6 addresses are truncated at the final group', async () => {
    sessionStore = [
      {
        id: 'sess-v6',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: '2001:db8::1234:5678',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
    ]
    const res = await listHandler({ authUser: { id: 'user-A' }, currentSessionId: 'x' })
    expect(res.body.sessions[0].ipAddress).toBe('2001:db8::1234:xxxx')
  })

  test('does not return other users\' sessions', async () => {
    sessionStore = [
      {
        id: 'mine',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
      {
        id: 'theirs',
        identityUserId: 'user-B',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
    ]
    const res = await listHandler({ authUser: { id: 'user-A' }, currentSessionId: 'mine' })
    expect(res.body.sessions).toHaveLength(1)
    expect(res.body.sessions[0].id).toBe('mine')
  })

  test('skips revoked and expired rows', async () => {
    sessionStore = [
      {
        id: 'revoked',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      },
      {
        id: 'expired',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(Date.now() - 30 * 86_400_000),
        expiresAt: new Date(Date.now() - 86_400_000),
        revokedAt: null,
      },
      {
        id: 'live',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
    ]
    const res = await listHandler({ authUser: { id: 'user-A' }, currentSessionId: 'live' })
    expect(res.body.sessions.map((s) => s.id)).toEqual(['live'])
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/me/sessions/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/me/sessions/:id', () => {
  beforeEach(() => {
    sessionStore = [
      {
        id: 'mine',
        identityUserId: 'user-A',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
      {
        id: 'mine-current',
        identityUserId: 'user-A',
        authMethod: 'personal_otp',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
      {
        id: 'theirs',
        identityUserId: 'user-B',
        authMethod: 'workspace_oidc',
        deviceLabel: null,
        ipAddress: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      },
    ]
  })

  test('happy path: revokes own non-current session, no cookie clear', async () => {
    const res = await deleteHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'mine-current',
      sessionId: 'mine',
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, clearedCookie: false })
    expect(revokeCalls).toEqual([{ id: 'mine', reason: 'logout_other_device' }])
  })

  test('revoking current session signals cookie should be cleared', async () => {
    const res = await deleteHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'mine-current',
      sessionId: 'mine-current',
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, clearedCookie: true })
    expect(revokeCalls).toEqual([{ id: 'mine-current', reason: 'logout_other_device' }])
  })

  test('cross-user revoke attempt → 404 (no leak that the row exists)', async () => {
    const res = await deleteHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'mine-current',
      sessionId: 'theirs',
    })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'SESSION_NOT_FOUND' })
    expect(revokeCalls).toEqual([])
  })

  test('unknown session id → 404', async () => {
    const res = await deleteHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'mine-current',
      sessionId: 'ghost',
    })
    expect(res.status).toBe(404)
    expect(revokeCalls).toEqual([])
  })

  test('already-revoked session → 404 (treat as not-present)', async () => {
    sessionStore[0].revokedAt = new Date()
    const res = await deleteHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'mine-current',
      sessionId: 'mine',
    })
    expect(res.status).toBe(404)
    expect(revokeCalls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// POST /api/me/sessions/sign-out-others
// ---------------------------------------------------------------------------
describe('POST /api/me/sessions/sign-out-others', () => {
  test('issues bulk revoke with exceptSessionId = current', async () => {
    const res = await signOutOthersHandler({
      authUser: { id: 'user-A' },
      currentSessionId: 'mine-current',
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(bulkRevokeCalls).toEqual([
      { userId: 'user-A', reason: 'logout_all_other', exceptSessionId: 'mine-current' },
    ])
  })
})
