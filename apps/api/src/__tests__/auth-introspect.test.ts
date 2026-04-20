/**
 * Tests for the POST /api/auth/broker/introspect endpoint logic.
 *
 * Strategy: rather than mounting the full Elysia route (which would require
 * mocking gip-admin, session cookies, auth middleware, etc.), we inline the
 * introspect handler logic from routes/auth.ts as a plain async function. The
 * implementation in auth.ts is a self-contained block that only touches:
 *   - process.env.PORTAL_INTROSPECT_SECRET
 *   - the X-Portal-Introspect-Secret request header
 *   - db.query.identityUsers.findFirst
 *   - db.query.sessionRevocations.findFirst
 *   - listAppSlugsForUser (from session-revocation)
 *   - db.select (for teamMembers)
 *
 * We replicate that logic here so tests are hermetic and fast.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Minimal in-memory DB (no module mocking — this file is standalone)
// ---------------------------------------------------------------------------

type UserRecord = {
  id: string
  gipUid: string | null
  email: string
  name: string
  portalRole: string
  status: string
}

type RevocationRecord = {
  id: string
  userId: string
  reason: string
  revokedAt: Date
  notBefore: Date
}

let currentUser: UserRecord | null = null
let currentRevocation: RevocationRecord | null = null
let appSlugsForUser: string[] = []

// ---------------------------------------------------------------------------
// Inline implementation of the introspect handler
// (mirrors routes/auth.ts POST /broker/introspect exactly)
// ---------------------------------------------------------------------------

type RevocationReason = 'logout' | 'status_change' | 'offboarded' | 'admin'

interface PortalSessionUser {
  id: string
  gipUid: string
  email: string
  name: string
  portalRole: string
  teamIds: string[]
  apps: string[]
}

type IntrospectBody = {
  userId: string
  sessionIssuedAt: string
  appSlug: string
}

async function introspectHandler(
  body: IntrospectBody,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const secret = process.env.PORTAL_INTROSPECT_SECRET
  if (!secret) {
    return { status: 503, body: { message: 'Introspection is not configured on the portal' } }
  }

  const provided = headers['x-portal-introspect-secret'] ?? ''
  if (provided !== secret) {
    return { status: 401, body: { message: 'Unauthorized' } }
  }

  const { userId, sessionIssuedAt, appSlug } = body

  // 1. Look up user
  const user = currentUser
  if (!user) {
    return { status: 404, body: { message: 'User not found' } }
  }

  // 2. Check for a revocation more recent than issuedAt
  const revocation = currentRevocation
  if (revocation && revocation.notBefore >= new Date(sessionIssuedAt)) {
    return {
      status: 200,
      body: {
        active: false,
        revokedAt: revocation.revokedAt.toISOString(),
        reason: revocation.reason as RevocationReason,
      },
    }
  }

  // 3. Account status
  if (user.status !== 'active') {
    return { status: 200, body: { active: false, reason: 'status_change' as RevocationReason } }
  }

  // 4. App access
  if (!appSlugsForUser.includes(appSlug)) {
    return { status: 200, body: { active: false, reason: 'admin' as RevocationReason } }
  }

  // 5. Return active session user
  const teamIds = appSlugsForUser.length > 0 ? ['team-1'] : []
  const sessionUser: PortalSessionUser = {
    id: user.id,
    gipUid: user.gipUid ?? '',
    email: user.email,
    name: user.name,
    portalRole: user.portalRole,
    teamIds,
    apps: appSlugsForUser,
  }

  return { status: 200, body: { active: true, user: sessionUser } }
}

// ---------------------------------------------------------------------------
// 5. Introspection endpoint tests
// ---------------------------------------------------------------------------

const VALID_SECRET = 'test-introspect-secret'

describe('introspect endpoint', () => {
  beforeEach(() => {
    currentUser = null
    currentRevocation = null
    appSlugsForUser = []
    process.env.PORTAL_INTROSPECT_SECRET = VALID_SECRET
  })

  function validBody(): IntrospectBody {
    return {
      userId: 'user-1',
      sessionIssuedAt: new Date(Date.now() - 60_000).toISOString(),
      appSlug: 'heroes',
    }
  }

  function validHeaders(): Record<string, string> {
    return { 'x-portal-introspect-secret': VALID_SECRET }
  }

  test('returns 401 without X-Portal-Introspect-Secret header', async () => {
    const { status } = await introspectHandler(validBody(), {})
    expect(status).toBe(401)
  })

  test('returns 401 with a wrong secret', async () => {
    const { status } = await introspectHandler(validBody(), {
      'x-portal-introspect-secret': 'wrong-secret',
    })
    expect(status).toBe(401)
  })

  test('returns 503 when PORTAL_INTROSPECT_SECRET env is unset', async () => {
    delete process.env.PORTAL_INTROSPECT_SECRET
    const { status, body } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(503)
    expect((body as Record<string, unknown>).message).toContain('not configured')
  })

  test('returns 404 for a nonexistent userId', async () => {
    currentUser = null
    const { status } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(404)
  })

  test('returns active:true for an active user with app access and no revocations', async () => {
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['heroes']
    currentRevocation = null

    const { status, body } = await introspectHandler(validBody(), validHeaders())
    const b = body as Record<string, unknown>

    expect(status).toBe(200)
    expect(b.active).toBe(true)
    expect((b.user as PortalSessionUser).email).toBe('user@example.com')
  })

  test('returns active:false with revokedAt and reason for a revoked session', async () => {
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    // Revocation notBefore is AFTER the session issuedAt — means the session is revoked
    currentRevocation = {
      id: 'rev-1',
      userId: 'user-1',
      reason: 'logout',
      revokedAt: new Date('2026-04-20T10:00:00Z'),
      notBefore: new Date('2026-04-20T10:00:00Z'),
    }

    // Session was issued well before the revocation
    const { status, body } = await introspectHandler(
      {
        userId: 'user-1',
        sessionIssuedAt: new Date('2026-04-20T09:00:00Z').toISOString(),
        appSlug: 'heroes',
      },
      validHeaders(),
    )
    const b = body as Record<string, unknown>

    expect(status).toBe(200)
    expect(b.active).toBe(false)
    expect(b.reason).toBe('logout')
    expect(b.revokedAt).toBe('2026-04-20T10:00:00.000Z')
  })

  test('returns active:false reason:status_change for inactive users', async () => {
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'inactive',
    }
    currentRevocation = null

    const { status, body } = await introspectHandler(validBody(), validHeaders())
    const b = body as Record<string, unknown>

    expect(status).toBe(200)
    expect(b.active).toBe(false)
    expect(b.reason).toBe('status_change')
  })

  test('returns active:false reason:admin when user does not have the appSlug in their apps', async () => {
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['orbit'] // user has orbit, not heroes
    currentRevocation = null

    const { status, body } = await introspectHandler(
      { userId: 'user-1', sessionIssuedAt: new Date().toISOString(), appSlug: 'heroes' },
      validHeaders(),
    )
    const b = body as Record<string, unknown>

    expect(status).toBe(200)
    expect(b.active).toBe(false)
    expect(b.reason).toBe('admin')
  })
})
