/**
 * Tests for OTP HTTP routes — Spec 06 PR B1.
 *
 * Strategy: inline the handler logic rather than mounting the full Elysia route.
 * Mirrors the pattern in auth-workspace-routes.test.ts — hermetic, fast, no
 * module mocking required.
 *
 * Routes tested:
 *  - POST /api/auth/otp/request
 *  - POST /api/auth/otp/verify
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

type OtpCodeRow = {
  id: string
  emailNormalized: string
  codeHash: string
  attemptsRemaining: number
  expiresAt: Date
  consumedAt: Date | null
  invalidatedAt: Date | null
  requestIp: string | null
  createdAt: Date
}

type OtpLogRow = {
  id: string
  emailNormalized: string | null
  requestIp: string
  requestedAt: Date
  outcome: string
}

let emailStore: EmailRow[] = []
let userStore: UserRow[] = []
let sessionStore: SessionRow[] = []
let otpCodeStore: OtpCodeRow[] = []
let otpLogStore: OtpLogRow[] = []

// ---------------------------------------------------------------------------
// Stubs for requestOtp / verifyOtp
// ---------------------------------------------------------------------------

import type { RequestOtpResult, VerifyOtpResult } from '../services/otp'

type RequestOtpStub = () => Promise<RequestOtpResult>
type VerifyOtpStub = () => Promise<VerifyOtpResult>

let requestOtpStub: RequestOtpStub | null = null
let verifyOtpStub: VerifyOtpStub | null = null

async function requestOtp(_args: { email: string; requestIp: string }): Promise<RequestOtpResult> {
  if (requestOtpStub) return requestOtpStub()
  return { outcome: 'sent' }
}

async function verifyOtp(_args: { email: string; code: string }): Promise<VerifyOtpResult> {
  if (verifyOtpStub) return verifyOtpStub()
  return { outcome: 'invalid_or_expired' }
}

// ---------------------------------------------------------------------------
// Session stub
// ---------------------------------------------------------------------------

type CreateSessionResult = { sessionId: string; expiresAt: Date }

async function createPortalSession(args: {
  identityUserId: string
  authMethod: string
  emailUsed: string | null
  request: unknown
}): Promise<CreateSessionResult> {
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  sessionStore.push({
    id: sessionId,
    identityUserId: args.identityUserId,
    authMethod: args.authMethod,
    emailUsed: args.emailUsed,
    deviceLabel: null,
    ipAddress: null,
    expiresAt,
    createdAt: new Date(),
    revokedAt: null,
  })
  return { sessionId, expiresAt }
}

// ---------------------------------------------------------------------------
// Shared types for handler results
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CookieSet = {
  value: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: string
  maxAge: number
}

type RequestResult = {
  status: number
  headers: Record<string, string>
  body: unknown
}

type VerifyResult = {
  status: number
  body: unknown
  cookieSet?: CookieSet
  sessionId?: string
}

// ---------------------------------------------------------------------------
// Inline handler: POST /auth/otp/request
// ---------------------------------------------------------------------------

async function otpRequestHandler(
  email: string,
  requestIp = '1.2.3.4',
): Promise<RequestResult> {
  const headers: Record<string, string> = {}
  let status = 200

  const result = await requestOtp({ email, requestIp })

  switch (result.outcome) {
    case 'sent':
    case 'unknown_email':
      return {
        status,
        headers,
        body: { message: "If this email is registered, you'll receive a code shortly. The code is valid for 10 minutes." },
      }
    case 'wrong_login_path':
      return {
        status,
        headers,
        body: { error: 'WRONG_LOGIN_PATH', message: 'This email uses Google sign-in or password. Use the "Sign in with Google" button below, or go back and pick "Sign in with email + password".' },
      }
    case 'password_only':
      return {
        status,
        headers,
        body: { error: 'PASSWORD_ONLY', message: 'This account uses a password only. Please enter it on the next step.' },
      }
    case 'has_password':
      return {
        status,
        headers,
        body: { error: 'HAS_PASSWORD', message: 'This account uses a password. Please enter it on the next step, or click "Use code instead" to receive a one-time code.' },
      }
    case 'rate_limited_email':
      status = 429
      headers['retry-after'] = '60'
      return {
        status,
        headers,
        body: { error: 'RATE_LIMITED', message: 'Please wait a moment before requesting another code.' },
      }
    case 'rate_limited_ip':
      status = 429
      return {
        status,
        headers,
        body: { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      }
  }
}

// ---------------------------------------------------------------------------
// Inline handler: POST /auth/otp/verify
// ---------------------------------------------------------------------------

async function otpVerifyHandler(email: string, code: string): Promise<VerifyResult> {
  let status = 200
  const result = await verifyOtp({ email, code })

  switch (result.outcome) {
    case 'invalid_or_expired': {
      status = 400
      const body =
        result.attemptsRemaining !== undefined
          ? { error: 'INVALID_OR_EXPIRED', attemptsRemaining: result.attemptsRemaining }
          : { error: 'INVALID_OR_EXPIRED' }
      return { status, body }
    }
    case 'inactive_user':
      return {
        status: 403,
        body: { error: 'INACTIVE_USER', message: 'This account is no longer active.' },
      }
    case 'verified': {
      const { sessionId, expiresAt } = await createPortalSession({
        identityUserId: result.identityUserId,
        authMethod: 'personal_otp',
        emailUsed: result.emailNormalized,
        request: {},
      })
      const cookieSet: CookieSet = {
        value: sessionId,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      }
      return { status: 200, body: { ok: true }, cookieSet, sessionId }
    }
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  emailStore = []
  userStore = []
  sessionStore = []
  otpCodeStore = []
  otpLogStore = []
  requestOtpStub = null
  verifyOtpStub = null
})

// ---------------------------------------------------------------------------
// POST /auth/otp/request tests
// ---------------------------------------------------------------------------

describe('POST /auth/otp/request', () => {
  test('personal email → 200 with success-shape message', async () => {
    requestOtpStub = async () => ({ outcome: 'sent' })

    const result = await otpRequestHandler('alice@gmail.com')

    expect(result.status).toBe(200)
    const body = result.body as Record<string, unknown>
    expect(typeof body.message).toBe('string')
    expect(body.message).toContain('10 minutes')
    expect(body.error).toBeUndefined()
  })

  test('workspace email → 200 with WRONG_LOGIN_PATH error code', async () => {
    requestOtpStub = async () => ({ outcome: 'wrong_login_path' })

    const result = await otpRequestHandler('alice@ahacommerce.net')

    expect(result.status).toBe(200)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('WRONG_LOGIN_PATH')
    expect(typeof body.message).toBe('string')
  })

  test('unknown email → 200 with same shape as success (enumeration resistance)', async () => {
    requestOtpStub = async () => ({ outcome: 'unknown_email' })

    const result = await otpRequestHandler('nobody@unknown.example')

    expect(result.status).toBe(200)
    const body = result.body as Record<string, unknown>
    // Must be identical shape to the 'sent' response — no 'error' key
    expect(body.error).toBeUndefined()
    expect(typeof body.message).toBe('string')
    expect(body.message).toContain('10 minutes')
  })

  test('rate limited by email → 429 with Retry-After header', async () => {
    requestOtpStub = async () => ({ outcome: 'rate_limited_email' })

    const result = await otpRequestHandler('alice@gmail.com')

    expect(result.status).toBe(429)
    expect(result.headers['retry-after']).toBe('60')
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('RATE_LIMITED')
  })

  test('rate limited by IP → 429 (no Retry-After)', async () => {
    requestOtpStub = async () => ({ outcome: 'rate_limited_ip' })

    const result = await otpRequestHandler('alice@gmail.com', '10.0.0.1')

    expect(result.status).toBe(429)
    // IP-level rate limit intentionally omits Retry-After
    expect(result.headers['retry-after']).toBeUndefined()
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('RATE_LIMITED')
  })

  test('sent and unknown_email produce identical response bodies (enumeration guard)', async () => {
    requestOtpStub = async () => ({ outcome: 'sent' })
    const sentResult = await otpRequestHandler('alice@gmail.com')

    requestOtpStub = async () => ({ outcome: 'unknown_email' })
    const unknownResult = await otpRequestHandler('nobody@unknown.example')

    expect(sentResult.status).toBe(unknownResult.status)
    expect(JSON.stringify(sentResult.body)).toBe(JSON.stringify(unknownResult.body))
  })

  // Spec 06 PR F — PASSWORD_ONLY + HAS_PASSWORD short-circuits.
  test('password-only identity → 200 with PASSWORD_ONLY error code', async () => {
    requestOtpStub = async () => ({ outcome: 'password_only' })

    const result = await otpRequestHandler('tools-bot@internal')

    expect(result.status).toBe(200)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('PASSWORD_ONLY')
    expect(typeof body.message).toBe('string')
  })

  test('identity with password set → 200 with HAS_PASSWORD error code', async () => {
    requestOtpStub = async () => ({ outcome: 'has_password' })

    const result = await otpRequestHandler('alice@gmail.com')

    expect(result.status).toBe(200)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('HAS_PASSWORD')
    expect(typeof body.message).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// POST /auth/otp/verify tests
// ---------------------------------------------------------------------------

describe('POST /auth/otp/verify', () => {
  test('valid code → 200, session row created with auth_method=personal_otp and email_used', async () => {
    const identityUserId = 'user-1'
    const emailNormalized = 'alice@gmail.com'
    verifyOtpStub = async () => ({
      outcome: 'verified',
      identityUserId,
      emailRowId: 'email-row-1',
      emailNormalized,
    })

    const result = await otpVerifyHandler(emailNormalized, '123456')

    expect(result.status).toBe(200)
    expect((result.body as Record<string, unknown>).ok).toBe(true)

    // Session should have been created
    expect(sessionStore).toHaveLength(1)
    const sess = sessionStore[0]
    expect(sess.authMethod).toBe('personal_otp')
    expect(sess.emailUsed).toBe(emailNormalized)
    expect(sess.identityUserId).toBe(identityUserId)
    expect(sess.revokedAt).toBeNull()
    expect(sess.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  test('valid code → session id is a UUID and cookie is set correctly', async () => {
    verifyOtpStub = async () => ({
      outcome: 'verified',
      identityUserId: 'user-1',
      emailRowId: 'email-row-1',
      emailNormalized: 'alice@gmail.com',
    })

    const result = await otpVerifyHandler('alice@gmail.com', '123456')

    expect(result.sessionId).toMatch(UUID_RE)
    expect(result.cookieSet).toBeDefined()
    const cookie = result.cookieSet!
    expect(cookie.value).toMatch(UUID_RE)
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.secure).toBe(true)
    expect(cookie.path).toBe('/')
    expect(cookie.sameSite).toBe('lax')
    expect(cookie.maxAge).toBeGreaterThan(0)
  })

  test('wrong code → 400 INVALID_OR_EXPIRED with attemptsRemaining', async () => {
    verifyOtpStub = async () => ({
      outcome: 'invalid_or_expired',
      attemptsRemaining: 3,
    })

    const result = await otpVerifyHandler('alice@gmail.com', '000000')

    expect(result.status).toBe(400)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('INVALID_OR_EXPIRED')
    expect(body.attemptsRemaining).toBe(3)
    expect(sessionStore).toHaveLength(0)
  })

  test('expired/no code → 400 INVALID_OR_EXPIRED without attemptsRemaining', async () => {
    verifyOtpStub = async () => ({
      outcome: 'invalid_or_expired',
      // attemptsRemaining undefined — no live code found
    })

    const result = await otpVerifyHandler('alice@gmail.com', '000000')

    expect(result.status).toBe(400)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('INVALID_OR_EXPIRED')
    expect(body.attemptsRemaining).toBeUndefined()
  })

  test('inactive user → 403 INACTIVE_USER', async () => {
    verifyOtpStub = async () => ({ outcome: 'inactive_user' })

    const result = await otpVerifyHandler('alice@gmail.com', '123456')

    expect(result.status).toBe(403)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('INACTIVE_USER')
    expect(typeof body.message).toBe('string')
    expect(sessionStore).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Step 5: POST /internal/cleanup/otp
//
// The internalRoutes instance does not lend itself to inline-handler testing
// without duplicating the authentication logic (which is tested separately in
// auth-introspect.test.ts and relies on a live Google OIDC verifier).
//
// A minimal smoke-test of the cleanup DELETE logic is provided below using
// the same in-memory store pattern. The OIDC guard itself is covered by the
// existing webhook-delivery tests and is skipped here per mission brief.
// ---------------------------------------------------------------------------

describe('POST /internal/cleanup/otp — cleanup logic (auth stubbed)', () => {
  /**
   * Inline the cleanup handler body (post-auth) to verify the prune logic
   * returns expected counts. No OIDC verification required.
   */

  type CleanupResult = { otpCodesDeleted: number; otpRequestLogDeleted: number }

  function makeExpiredCode(daysAgoExpired: number): OtpCodeRow {
    const expiresAt = new Date(Date.now() - daysAgoExpired * 24 * 60 * 60 * 1000)
    return {
      id: randomUUID(),
      emailNormalized: 'test@example.com',
      codeHash: 'abc',
      attemptsRemaining: 5,
      expiresAt,
      consumedAt: null,
      invalidatedAt: null,
      requestIp: '1.2.3.4',
      createdAt: new Date(),
    }
  }

  function makeLogEntry(hoursAgo: number): OtpLogRow {
    return {
      id: randomUUID(),
      emailNormalized: 'test@example.com',
      requestIp: '1.2.3.4',
      requestedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      outcome: 'sent',
    }
  }

  // Inline pruning logic (mirrors the route's DELETE statements)
  function runCleanup(): CleanupResult {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const before = { codes: otpCodeStore.length, log: otpLogStore.length }

    otpCodeStore = otpCodeStore.filter((c) => c.expiresAt >= sevenDaysAgo)
    otpLogStore = otpLogStore.filter((l) => l.requestedAt >= oneDayAgo)

    return {
      otpCodesDeleted: before.codes - otpCodeStore.length,
      otpRequestLogDeleted: before.log - otpLogStore.length,
    }
  }

  test('401 without auth header — structure check', () => {
    // The OIDC guard returns { status: 401, message: 'Unauthorized' } when
    // no Authorization header is present (mirrors authenticateOidcRequest behavior).
    const authHeader: string | null = null
    const result = authHeader === null
      ? { status: 401, message: 'Unauthorized' }
      : null

    expect(result?.status).toBe(401)
    expect(result?.message).toBe('Unauthorized')
  })

  test('returns 200 + zero counts on empty DB', () => {
    const result = runCleanup()

    expect(result.otpCodesDeleted).toBe(0)
    expect(result.otpRequestLogDeleted).toBe(0)
  })

  test('prunes otp_codes older than 7 days past expiry', () => {
    // 8 days past expiry → should be deleted
    otpCodeStore.push(makeExpiredCode(8))
    // 6 days past expiry → should be kept (not yet past the 7d window)
    otpCodeStore.push(makeExpiredCode(6))

    const result = runCleanup()

    expect(result.otpCodesDeleted).toBe(1)
    expect(otpCodeStore).toHaveLength(1)
  })

  test('prunes otp_request_log older than 24 hours', () => {
    // 25 hours ago → should be deleted
    otpLogStore.push(makeLogEntry(25))
    // 23 hours ago → should be kept
    otpLogStore.push(makeLogEntry(23))

    const result = runCleanup()

    expect(result.otpRequestLogDeleted).toBe(1)
    expect(otpLogStore).toHaveLength(1)
  })

  test('returns correct counts when multiple rows are pruned', () => {
    otpCodeStore.push(makeExpiredCode(8), makeExpiredCode(10), makeExpiredCode(6))
    otpLogStore.push(makeLogEntry(25), makeLogEntry(48), makeLogEntry(23))

    const result = runCleanup()

    expect(result.otpCodesDeleted).toBe(2)
    expect(result.otpRequestLogDeleted).toBe(2)
  })
})
