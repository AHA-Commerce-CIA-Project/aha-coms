/**
 * Tests for the POST /api/auth/session workspace OIDC login handler.
 *
 * Strategy: inline the handler logic rather than mounting the full Elysia route.
 * Mirrors the pattern in auth-introspect.test.ts — hermetic, fast, no module
 * mocking required.
 *
 * Spec 06 PR A cases tested:
 *  - Happy path: workspace email match → 200, opaque session cookie set
 *  - Returns 403 WRONG_LOGIN_PATH when email matches kind='personal' row
 *  - Returns 403 generic when no email row matches
 *  - Returns 403 when identity_users.status !== 'active'
 *  - verifiedAt is set on first successful login (was NULL)
 *  - A session row is inserted with authMethod='workspace_oidc' and emailUsed
 *  - Cookie value is the new opaque UUID, NOT a GIP-encrypted JWT
 *  - Returns 401 when verifyIdToken throws
 *  - Returns 401 when decoded token has no email claim
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

type EmailRow = {
  id: string
  identityUserId: string
  email: string
  emailNormalized: string
  kind: 'workspace' | 'personal'
  isPrimary: boolean
  verifiedAt: Date | null
  addedBy: string
  createdAt: Date
  updatedAt: Date
}

type UserRow = {
  id: string
  gipUid: string | null
  name: string
  portalRole: string
  status: string
}

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
}

let emailStore: EmailRow[] = []
let userStore: UserRow[] = []
let sessionStore: SessionRow[] = []
let updatedIdentityUsers: Array<Record<string, unknown>> = []
let updatedEmailRows: Array<{ id: string; fields: Record<string, unknown> }> = []

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

// verifyIdToken stub: null means "throws"; function means override
type DecodedToken = { email: string | null; uid: string }
let verifyIdTokenStub: (() => Promise<DecodedToken>) | null = null

async function verifyIdToken(_idToken: string): Promise<DecodedToken> {
  if (verifyIdTokenStub) return verifyIdTokenStub()
  throw new Error('Token verification failed')
}

// ---------------------------------------------------------------------------
// DB stubs (in-memory, no module-level mock)
// ---------------------------------------------------------------------------

const db = {
  select: () => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => ({
        limit: (_n: number): Promise<EmailRow[]> => {
          // identity_user_emails lookup by emailNormalized
          return Promise.resolve(emailStore.slice(0, _n))
        },
      }),
    }),
  }),
  query: {
    identityUsers: {
      findFirst: async (_opts: unknown): Promise<UserRow | null> => {
        return userStore[0] ?? null
      },
    },
  },
  update: (_table: unknown) => ({
    set: (fields: Record<string, unknown>) => ({
      where: (_cond: unknown) => {
        // Track updates
        updatedIdentityUsers.push(fields)
        return Promise.resolve()
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (value: Record<string, unknown>) => {
      // auth_sessions insert
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
      })
      return Promise.resolve()
    },
  }),
}

// Separate tracker for identity_user_emails updates
const dbWithEmailUpdate = {
  ...db,
  update: (table: unknown) => ({
    set: (fields: Record<string, unknown>) => ({
      where: (_cond: unknown) => {
        if (table === 'iue') {
          updatedEmailRows.push({ id: emailStore[0]?.id ?? '', fields })
        } else {
          updatedIdentityUsers.push(fields)
        }
        return Promise.resolve()
      },
    }),
  }),
}

// ---------------------------------------------------------------------------
// Inline handler — mirrors routes/auth.ts POST /session exactly
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SessionHandlerResult = {
  status: number
  body: unknown
  sessionId?: string
  verifiedAtUpdated?: boolean
  gipUidLinked?: boolean
}

async function sessionHandler(idToken: string): Promise<SessionHandlerResult> {
  let decoded: DecodedToken
  try {
    decoded = await verifyIdToken(idToken)
  } catch (e) {
    return {
      status: 401,
      body: { message: e instanceof Error ? e.message : 'Invalid token' },
    }
  }

  if (!decoded.email) {
    return { status: 401, body: { message: 'No email claim' } }
  }

  const emailNormalized = decoded.email.toLowerCase().trim()

  // Find email row
  const matchingEmail = emailStore.find((r) => r.emailNormalized === emailNormalized) ?? null
  if (!matchingEmail) {
    return { status: 403, body: { message: 'Access denied. Contact your administrator.' } }
  }

  if (matchingEmail.kind === 'personal') {
    return {
      status: 403,
      body: {
        error: 'WRONG_LOGIN_PATH',
        message: 'This email is registered for code-based sign-in only. Use the email & verification code option.',
      },
    }
  }

  // Look up user
  const user = userStore.find((u) => u.id === matchingEmail.identityUserId) ?? null
  if (!user) {
    return { status: 403, body: { message: 'Access denied. Contact your administrator.' } }
  }

  if (user.status !== 'active') {
    return { status: 403, body: { message: 'Account is inactive or suspended.' } }
  }

  let gipUidLinked = false
  if (!user.gipUid && decoded.uid) {
    user.gipUid = decoded.uid
    gipUidLinked = true
    updatedIdentityUsers.push({ gipUid: decoded.uid })
  }

  let verifiedAtUpdated = false
  if (matchingEmail.verifiedAt === null) {
    matchingEmail.verifiedAt = new Date()
    verifiedAtUpdated = true
    updatedEmailRows.push({ id: matchingEmail.id, fields: { verifiedAt: matchingEmail.verifiedAt } })
  }

  // Mint session
  const sessionId = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  sessionStore.push({
    id: sessionId,
    identityUserId: user.id,
    authMethod: 'workspace_oidc',
    emailUsed: decoded.email,
    deviceLabel: null,
    ipAddress: null,
    expiresAt,
    createdAt: now,
    revokedAt: null,
  })

  return { status: 200, body: { ok: true }, sessionId, verifiedAtUpdated, gipUidLinked }
}

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

function seedWorkspaceEmail(overrides: Partial<EmailRow> = {}): EmailRow {
  const row: EmailRow = {
    id: 'email-ws-1',
    identityUserId: 'user-1',
    email: 'alice@ahacommerce.net',
    emailNormalized: 'alice@ahacommerce.net',
    kind: 'workspace',
    isPrimary: true,
    verifiedAt: new Date(),
    addedBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  emailStore.push(row)
  return row
}

function seedPersonalEmail(overrides: Partial<EmailRow> = {}): EmailRow {
  const row: EmailRow = {
    id: 'email-p-1',
    identityUserId: 'user-1',
    email: 'alice@gmail.com',
    emailNormalized: 'alice@gmail.com',
    kind: 'personal',
    isPrimary: false,
    verifiedAt: new Date(),
    addedBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  emailStore.push(row)
  return row
}

function seedUser(overrides: Partial<UserRow> = {}): UserRow {
  const user: UserRow = {
    id: 'user-1',
    gipUid: 'gip-uid-1',
    name: 'Alice',
    portalRole: 'employee',
    status: 'active',
    ...overrides,
  }
  userStore.push(user)
  return user
}

beforeEach(() => {
  emailStore = []
  userStore = []
  sessionStore = []
  updatedIdentityUsers = []
  updatedEmailRows = []
  verifyIdTokenStub = null
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /auth/session — workspace OIDC login', () => {
  test('happy path: workspace email match → 200, opaque UUID cookie set', async () => {
    seedWorkspaceEmail()
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'gip-uid-1' })

    const result = await sessionHandler('valid-id-token')

    expect(result.status).toBe(200)
    expect((result.body as Record<string, unknown>).ok).toBe(true)
    expect(result.sessionId).toMatch(UUID_RE)
    expect(sessionStore).toHaveLength(1)
    expect(sessionStore[0].authMethod).toBe('workspace_oidc')
    expect(sessionStore[0].emailUsed).toBe('alice@ahacommerce.net')
  })

  test('cookie value is opaque UUID, not a GIP-encrypted JWT (no dots)', async () => {
    seedWorkspaceEmail()
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'gip-uid-1' })

    const result = await sessionHandler('valid-id-token')

    // A GIP session cookie has 3 dot-separated segments; a UUID has 4 hyphens, no dots.
    expect(result.sessionId).toMatch(UUID_RE)
    expect(result.sessionId).not.toContain('.')
  })

  test('returns 403 WRONG_LOGIN_PATH when email matches kind=personal row', async () => {
    seedPersonalEmail({ email: 'alice@gmail.com', emailNormalized: 'alice@gmail.com' })
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'alice@gmail.com', uid: 'gip-uid-1' })

    const result = await sessionHandler('valid-id-token')
    const body = result.body as Record<string, unknown>

    expect(result.status).toBe(403)
    expect(body.error).toBe('WRONG_LOGIN_PATH')
    expect(typeof body.message).toBe('string')
    expect(sessionStore).toHaveLength(0)
  })

  test('returns 403 generic when no email row matches', async () => {
    // No email rows seeded
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'nobody@unknown.com', uid: 'gip-uid-x' })

    const result = await sessionHandler('valid-id-token')
    const body = result.body as Record<string, unknown>

    expect(result.status).toBe(403)
    expect(body.message).toBeString()
    expect((body as { error?: unknown }).error).toBeUndefined()
    expect(sessionStore).toHaveLength(0)
  })

  test('returns 403 when identity_users.status !== active', async () => {
    seedWorkspaceEmail()
    seedUser({ status: 'inactive' })
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'gip-uid-1' })

    const result = await sessionHandler('valid-id-token')

    expect(result.status).toBe(403)
    expect((result.body as Record<string, unknown>).message).toContain('inactive')
    expect(sessionStore).toHaveLength(0)
  })

  test('verifiedAt is set on first successful login (was NULL)', async () => {
    seedWorkspaceEmail({ verifiedAt: null })
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'gip-uid-1' })

    const result = await sessionHandler('valid-id-token')

    expect(result.status).toBe(200)
    expect(result.verifiedAtUpdated).toBe(true)
    // The email row's verifiedAt should be set in-memory
    const emailRow = emailStore.find((r) => r.emailNormalized === 'alice@ahacommerce.net')
    expect(emailRow?.verifiedAt).toBeInstanceOf(Date)
  })

  test('verifiedAt is NOT updated when already set', async () => {
    const existing = new Date('2026-01-01')
    seedWorkspaceEmail({ verifiedAt: existing })
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'gip-uid-1' })

    const result = await sessionHandler('valid-id-token')

    expect(result.status).toBe(200)
    expect(result.verifiedAtUpdated).toBe(false)
    expect(updatedEmailRows).toHaveLength(0)
  })

  test('session row is inserted with authMethod=workspace_oidc and emailUsed', async () => {
    seedWorkspaceEmail()
    seedUser()
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'gip-uid-1' })

    await sessionHandler('valid-id-token')

    expect(sessionStore).toHaveLength(1)
    const sess = sessionStore[0]
    expect(sess.authMethod).toBe('workspace_oidc')
    expect(sess.emailUsed).toBe('alice@ahacommerce.net')
    expect(sess.identityUserId).toBe('user-1')
    expect(sess.revokedAt).toBeNull()
    expect(sess.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  test('gipUid is linked on first login when user.gipUid is null', async () => {
    seedWorkspaceEmail()
    seedUser({ gipUid: null })
    verifyIdTokenStub = async () => ({ email: 'alice@ahacommerce.net', uid: 'new-gip-uid' })

    const result = await sessionHandler('valid-id-token')

    expect(result.status).toBe(200)
    expect(result.gipUidLinked).toBe(true)
    expect(updatedIdentityUsers.some((u) => u.gipUid === 'new-gip-uid')).toBe(true)
  })

  test('returns 401 when verifyIdToken throws (invalid token)', async () => {
    verifyIdTokenStub = async () => { throw new Error('Token expired') }

    const result = await sessionHandler('bad-token')

    expect(result.status).toBe(401)
    expect((result.body as Record<string, unknown>).message).toContain('Token expired')
    expect(sessionStore).toHaveLength(0)
  })

  test('returns 401 when decoded token has no email claim', async () => {
    verifyIdTokenStub = async () => ({ email: null as unknown as string, uid: 'gip-uid-1' })

    const result = await sessionHandler('no-email-token')

    expect(result.status).toBe(401)
    expect((result.body as Record<string, unknown>).message).toContain('email')
    expect(sessionStore).toHaveLength(0)
  })
})
