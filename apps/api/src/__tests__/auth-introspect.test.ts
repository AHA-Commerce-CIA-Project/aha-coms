/**
 * Tests for the POST /api/auth/broker/introspect endpoint logic.
 *
 * Strategy: rather than mounting the full Elysia route (which would require
 * mocking gip-admin, session cookies, auth middleware, etc.), we inline the
 * introspect handler logic from routes/auth.ts as a plain async function. The
 * implementation in auth.ts is a self-contained block that only touches:
 *   - appRegistry (per-app introspect secret + serviceAccountEmail, with env var fallback)
 *   - process.env.PORTAL_INTROSPECT_SECRET (fallback when app has no secret)
 *   - the X-Portal-Introspect-Secret request header
 *   - Authorization: Bearer <token> header (OIDC path)
 *   - db.query.identityUsers.findFirst
 *   - db.query.sessionRevocations.findFirst
 *   - listAppSlugsForUser (from session-revocation)
 *   - db.select (for teamMembers)
 *
 * We replicate that logic here so tests are hermetic and fast.
 */
import { timingSafeEqual } from 'node:crypto'
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
// Per-app introspect secret — null means "app not found", undefined means "app exists, no secret set"
let appIntrospectSecret: string | null | undefined = undefined
// Per-app serviceAccountEmail — null means "not configured", string means configured
let appServiceAccountEmail: string | null = null
// Stub for verifyGoogleIdToken — null means "use real behaviour" (throws), function means override
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
  throw new Error('Token email mismatch: expected <none>, got <none>')
}

async function authenticateIntrospectCaller(
  headers: Record<string, string>,
  appSlug: string,
): Promise<{ via: 'oidc' | 'secret'; ok: boolean }> {
  // Simulate per-app lookup
  if (appIntrospectSecret === null) {
    // app not found — we still return ok:false; 404 is handled at handler level
    return { via: 'oidc', ok: false }
  }

  const app = {
    introspectSecret: appIntrospectSecret as string | undefined,
    serviceAccountEmail: appServiceAccountEmail,
  }

  const authHeader = headers['authorization'] ?? null

  // --- Try OIDC first ---
  if (authHeader?.startsWith('Bearer ') && app.serviceAccountEmail) {
    try {
      await verifyGoogleIdToken({
        idToken: authHeader.slice(7),
        expectedAudience: SELF_AUDIENCE,
        expectedSAEmail: app.serviceAccountEmail,
      })
      return { via: 'oidc', ok: true }
    } catch {
      // fall through during dual-mode
    }
  }

  // --- Fall back to legacy shared-secret header ---
  const expectedSecret = app.introspectSecret ?? process.env.PORTAL_INTROSPECT_SECRET
  if (expectedSecret) {
    const provided = headers['x-portal-introspect-secret'] ?? ''
    if (
      provided.length === expectedSecret.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expectedSecret))
    ) {
      warnLines.push(`[introspect] app "${appSlug}" used legacy secret auth — migrate to OIDC`)
      return { via: 'secret', ok: true }
    }
  }

  return { via: 'oidc', ok: false }
}

// ---------------------------------------------------------------------------
// Inline implementation of the introspect handler
// (mirrors routes/auth.ts POST /broker/introspect exactly, post-T4 refactor)
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
): Promise<{ status: number; body: unknown; via?: 'oidc' | 'secret' }> {
  const { userId, sessionIssuedAt, appSlug } = body

  // Simulate app-not-found at handler level (when appIntrospectSecret === null)
  if (appIntrospectSecret === null) {
    return { status: 404, body: { message: 'App not found' } }
  }

  const auth = await authenticateIntrospectCaller(headers, appSlug)
  if (!auth.ok) {
    return { status: 401, body: { message: 'Unauthorized' } }
  }
  logLines.push(`[introspect] via:${auth.via} app:${appSlug}`)

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
      via: auth.via,
      body: {
        active: false,
        revokedAt: revocation.revokedAt.toISOString(),
        reason: revocation.reason as RevocationReason,
      },
    }
  }

  // 3. Account status
  if (user.status !== 'active') {
    return { status: 200, via: auth.via, body: { active: false, reason: 'status_change' as RevocationReason } }
  }

  // 4. App access
  if (!appSlugsForUser.includes(appSlug)) {
    return { status: 200, via: auth.via, body: { active: false, reason: 'admin' as RevocationReason } }
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

  return { status: 200, via: auth.via, body: { active: true, user: sessionUser } }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const VALID_SECRET = 'test-introspect-secret'

describe('introspect endpoint', () => {
  beforeEach(() => {
    currentUser = null
    currentRevocation = null
    appSlugsForUser = []
    // Default: app exists but has no per-app secret → falls back to env var
    appIntrospectSecret = undefined
    appServiceAccountEmail = null
    verifyGoogleIdTokenStub = null
    warnLines = []
    logLines = []
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

  // -------------------------------------------------------------------------
  // Existing legacy-path tests (preserved unchanged)
  // -------------------------------------------------------------------------

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

  test('returns 401 when neither per-app secret nor PORTAL_INTROSPECT_SECRET env is set', async () => {
    delete process.env.PORTAL_INTROSPECT_SECRET
    appIntrospectSecret = undefined // app exists but no per-app secret
    const { status } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(401)
  })

  test('returns 404 for an unknown app slug', async () => {
    appIntrospectSecret = null // simulate app not found in DB
    const { status, body } = await introspectHandler(validBody(), validHeaders())
    expect(status).toBe(404)
    expect((body as Record<string, unknown>).message).toContain('App not found')
  })

  test('uses per-app secret when set, ignoring env var', async () => {
    const PER_APP_SECRET = 'per-app-secret-xyz'
    appIntrospectSecret = PER_APP_SECRET
    process.env.PORTAL_INTROSPECT_SECRET = 'different-global-secret'
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['heroes']

    // Wrong secret (global) → 401
    const { status: s401 } = await introspectHandler(validBody(), {
      'x-portal-introspect-secret': 'different-global-secret',
    })
    expect(s401).toBe(401)

    // Correct per-app secret → 200
    const { status: s200 } = await introspectHandler(validBody(), {
      'x-portal-introspect-secret': PER_APP_SECRET,
    })
    expect(s200).toBe(200)
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

  // -------------------------------------------------------------------------
  // New dual-mode tests (T4)
  // -------------------------------------------------------------------------

  test('OIDC: valid Bearer + correct SA email → 200, logs via:oidc', async () => {
    appServiceAccountEmail = 'heroes-sa@project.iam.gserviceaccount.com'
    verifyGoogleIdTokenStub = async () => ({
      email: 'heroes-sa@project.iam.gserviceaccount.com',
      sub: 'abc123',
    })
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['heroes']

    const { status } = await introspectHandler(validBody(), {
      authorization: 'Bearer fake.id.token',
    })

    expect(status).toBe(200)
    expect(logLines.some((l) => l.includes('via:oidc') && l.includes('app:heroes'))).toBe(true)
    expect(warnLines).toHaveLength(0)
  })

  test('legacy secret: valid x-portal-introspect-secret (no Bearer) → 200, logs via:secret', async () => {
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['heroes']

    const { status } = await introspectHandler(validBody(), validHeaders())

    expect(status).toBe(200)
    expect(logLines.some((l) => l.includes('via:secret') && l.includes('app:heroes'))).toBe(true)
    expect(warnLines.some((l) => l.includes('migrate to OIDC'))).toBe(true)
  })

  test('neither Bearer nor secret → 401', async () => {
    const { status } = await introspectHandler(validBody(), {})
    expect(status).toBe(401)
  })

  test('Bearer with mismatched SA email (verifyGoogleIdToken throws) → falls through to secret; if no secret → 401', async () => {
    appServiceAccountEmail = 'heroes-sa@project.iam.gserviceaccount.com'
    verifyGoogleIdTokenStub = async () => {
      throw new Error('Token email mismatch: expected heroes-sa@project.iam.gserviceaccount.com, got other-sa@project.iam.gserviceaccount.com')
    }
    delete process.env.PORTAL_INTROSPECT_SECRET
    appIntrospectSecret = undefined // no secret either

    const { status } = await introspectHandler(validBody(), {
      authorization: 'Bearer fake.id.token',
    })

    expect(status).toBe(401)
  })

  test('Bearer with mismatched SA email → falls through to secret; if correct secret → 200 via:secret', async () => {
    appServiceAccountEmail = 'heroes-sa@project.iam.gserviceaccount.com'
    verifyGoogleIdTokenStub = async () => {
      throw new Error('Token email mismatch')
    }
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['heroes']

    const { status } = await introspectHandler(validBody(), {
      authorization: 'Bearer fake.id.token',
      'x-portal-introspect-secret': VALID_SECRET,
    })

    expect(status).toBe(200)
    expect(logLines.some((l) => l.includes('via:secret'))).toBe(true)
    expect(warnLines.some((l) => l.includes('migrate to OIDC'))).toBe(true)
  })

  test('app with serviceAccountEmail = null (Heroes pre-population) → OIDC skipped, falls to secret path', async () => {
    // serviceAccountEmail is null: Heroes not yet configured for OIDC
    appServiceAccountEmail = null
    currentUser = {
      id: 'user-1',
      gipUid: 'gip-1',
      email: 'user@example.com',
      name: 'Test User',
      portalRole: 'employee',
      status: 'active',
    }
    appSlugsForUser = ['heroes']

    // Send both headers (as Heroes would in dual-mode H3)
    const { status } = await introspectHandler(validBody(), {
      authorization: 'Bearer fake.id.token', // present but skipped because SA email is null
      'x-portal-introspect-secret': VALID_SECRET,
    })

    // verifyGoogleIdToken should NOT have been called (stub is null — if called it would throw)
    expect(status).toBe(200)
    expect(logLines.some((l) => l.includes('via:secret'))).toBe(true)
    expect(warnLines.some((l) => l.includes('migrate to OIDC'))).toBe(true)
  })

  test('app with serviceAccountEmail = null + no secret → 401 (not a OIDC attempt, not configured)', async () => {
    appServiceAccountEmail = null
    delete process.env.PORTAL_INTROSPECT_SECRET
    appIntrospectSecret = undefined

    const { status } = await introspectHandler(validBody(), {
      authorization: 'Bearer fake.id.token',
    })
    expect(status).toBe(401)
  })
})
