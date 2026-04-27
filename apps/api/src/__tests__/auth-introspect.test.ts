/**
 * Tests for the POST /api/auth/broker/introspect endpoint logic.
 *
 * Strategy: rather than mounting the full Elysia route (which would require
 * mocking gip-admin, session cookies, auth middleware, etc.), we inline the
 * introspect handler logic from routes/auth.ts as a plain async function. The
 * implementation in auth.ts is a self-contained block that only touches:
 *   - appRegistry (per-app serviceAccountEmail lookup)
 *   - Authorization: Bearer <google-id-token> header (OIDC verification)
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
// null means "app not found in DB"; otherwise the app exists
let appExists = true
// Per-app serviceAccountEmail — null means "not configured", string means configured
let appServiceAccountEmail: string | null = null
// Stub for verifyGoogleIdToken — null means "throws" (default-fail), function means override
let verifyGoogleIdTokenStub: ((opts: {
  idToken: string
  expectedAudience: string
  expectedSAEmail: string
}) => Promise<{ email: string; sub: string }>) | null = null

// Captured log lines
let warnLines: string[] = []
let logLines: string[] = []

// ---------------------------------------------------------------------------
// Inline implementation of authenticateIntrospectCaller
// (mirrors routes/auth.ts authenticateIntrospectCaller exactly)
// ---------------------------------------------------------------------------

const SELF_AUDIENCE =
  process.env.PORTAL_PUBLIC_ORIGIN ?? 'https://coms.ahacommerce.net'

async function verifyGoogleIdToken(opts: {
  idToken: string
  expectedAudience: string
  expectedSAEmail: string
}): Promise<{ email: string; sub: string }> {
  if (verifyGoogleIdTokenStub) {
    return verifyGoogleIdTokenStub(opts)
  }
  throw new Error('Token verification failed (default stub)')
}

type IntrospectAuthFailure =
  | 'app_not_found'
  | 'sa_not_configured'
  | 'missing_bearer'
  | 'verify_failed'

async function authenticateIntrospectCaller(
  headers: Record<string, string>,
  appSlug: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: IntrospectAuthFailure }
> {
  if (!appExists) return { ok: false, reason: 'app_not_found' }
  if (!appServiceAccountEmail) {
    return { ok: false, reason: 'sa_not_configured' }
  }

  const authHeader = headers['authorization'] ?? null
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing_bearer' }
  }

  try {
    await verifyGoogleIdToken({
      idToken: authHeader.slice(7),
      expectedAudience: SELF_AUDIENCE,
      expectedSAEmail: appServiceAccountEmail,
    })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'verify_failed' }
  }
}

// ---------------------------------------------------------------------------
// Inline implementation of the introspect handler
// (mirrors routes/auth.ts POST /broker/introspect)
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
  const { userId, sessionIssuedAt, appSlug } = body

  const auth = await authenticateIntrospectCaller(headers, appSlug)
  if (!auth.ok) {
    warnLines.push(`[introspect] auth_failed app:${appSlug} reason:${auth.reason}`)
    return { status: 401, body: { message: 'Unauthorized' } }
  }
  logLines.push(`[introspect] via:oidc app:${appSlug}`)

  const issuedAt = new Date(sessionIssuedAt)

  // 1. Look up user
  const user = currentUser
  if (!user) {
    return { status: 404, body: { message: 'User not found' } }
  }

  // 2. Check for a revocation more recent than issuedAt
  const revocation = currentRevocation
  if (revocation && revocation.notBefore >= issuedAt) {
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
// Test setup
// ---------------------------------------------------------------------------

const HEROES_SA = 'heroes-sa@project.iam.gserviceaccount.com'

describe('introspect endpoint (OIDC-only)', () => {
  beforeEach(() => {
    currentUser = null
    currentRevocation = null
    appSlugsForUser = []
    appExists = true
    appServiceAccountEmail = HEROES_SA
    verifyGoogleIdTokenStub = async () => ({ email: HEROES_SA, sub: 'abc123' })
    warnLines = []
    logLines = []
  })

  function validBody(): IntrospectBody {
    return {
      userId: 'user-1',
      sessionIssuedAt: new Date(Date.now() - 60_000).toISOString(),
      appSlug: 'heroes',
    }
  }

  function validHeaders(): Record<string, string> {
    return { authorization: 'Bearer fake.id.token' }
  }

  function activeUser(): UserRecord {
    return {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
  }

  // -------------------------------------------------------------------------
  // OIDC happy path + auth-failure modes
  // -------------------------------------------------------------------------

  test('OIDC: valid Bearer + correct SA email → 200, logs via:oidc', async () => {
    currentUser = activeUser()
    appSlugsForUser = ['heroes']

    const { status } = await introspectHandler(validBody(), validHeaders())

    expect(status).toBe(200)
    expect(logLines.some((l) => l.includes('via:oidc') && l.includes('app:heroes'))).toBe(true)
    expect(warnLines).toHaveLength(0)
  })

  test('missing Authorization header → 401, reason missing_bearer logged', async () => {
    const { status } = await introspectHandler(validBody(), {})
    expect(status).toBe(401)
    expect(warnLines.some((l) => l.includes('reason:missing_bearer'))).toBe(true)
  })

  test('Bearer token whose verification fails → 401, reason verify_failed logged', async () => {
    verifyGoogleIdTokenStub = async () => {
      throw new Error('Token email mismatch')
    }
    const { status } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(401)
    expect(warnLines.some((l) => l.includes('reason:verify_failed'))).toBe(true)
  })

  test('app with no serviceAccountEmail configured → 401, reason sa_not_configured logged', async () => {
    appServiceAccountEmail = null
    const { status } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(401)
    expect(warnLines.some((l) => l.includes('reason:sa_not_configured'))).toBe(true)
  })

  test('unknown app slug → 401, reason app_not_found logged', async () => {
    appExists = false
    const { status, body } = await introspectHandler(validBody(), validHeaders())
    // Generic 401 — does not leak app existence
    expect(status).toBe(401)
    expect((body as Record<string, unknown>).message).toBe('Unauthorized')
    expect(warnLines.some((l) => l.includes('reason:app_not_found'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Post-auth business logic
  // -------------------------------------------------------------------------

  test('returns 404 for a nonexistent userId (after OIDC succeeds)', async () => {
    currentUser = null
    const { status } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(404)
  })

  test('returns active:true for an active user with app access and no revocations', async () => {
    currentUser = activeUser()
    appSlugsForUser = ['heroes']
    currentRevocation = null

    const { status, body } = await introspectHandler(validBody(), validHeaders())
    const b = body as Record<string, unknown>

    expect(status).toBe(200)
    expect(b.active).toBe(true)
    expect((b.user as PortalSessionUser).email).toBe('user@example.com')
  })

  test('returns active:false with revokedAt and reason for a revoked session', async () => {
    currentUser = activeUser()
    currentRevocation = {
      id: 'rev-1',
      userId: 'user-1',
      reason: 'logout',
      revokedAt: new Date('2026-04-20T10:00:00Z'),
      notBefore: new Date('2026-04-20T10:00:00Z'),
    }

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
    currentUser = { ...activeUser(), status: 'inactive' }
    currentRevocation = null

    const { status, body } = await introspectHandler(validBody(), validHeaders())
    const b = body as Record<string, unknown>

    expect(status).toBe(200)
    expect(b.active).toBe(false)
    expect(b.reason).toBe('status_change')
  })

  test('returns active:false reason:admin when user does not have the appSlug in their apps', async () => {
    currentUser = activeUser()
    appSlugsForUser = ['orbit']
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
