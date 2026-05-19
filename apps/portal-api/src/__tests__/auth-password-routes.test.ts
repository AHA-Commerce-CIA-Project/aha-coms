/**
 * Tests for password sign-in HTTP route — Spec 06 PR F.
 *
 * Strategy mirrors auth-otp-routes.test.ts: inline the handler logic rather
 * than mounting the full Elysia route. Each test stubs attemptPasswordSignIn
 * and verifies the route's status code, headers, body shape, and (on success)
 * the minted session.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import type { AttemptPasswordSignInResult } from '../services/password-signin'

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

let attemptStub: (() => Promise<AttemptPasswordSignInResult>) | null = null

async function attemptPasswordSignIn(_args: {
  email: string
  password: string
  requestIp: string
}): Promise<AttemptPasswordSignInResult> {
  if (attemptStub) return attemptStub()
  return { outcome: 'invalid_credentials' }
}

type CreateSessionResult = { sessionId: string; expiresAt: Date }

const sessionsCreated: Array<{
  identityUserId: string
  authMethod: string
  emailUsed: string | null
}> = []

async function createPortalSession(args: {
  identityUserId: string
  authMethod: string
  emailUsed: string | null
  request: unknown
}): Promise<CreateSessionResult> {
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  sessionsCreated.push({
    identityUserId: args.identityUserId,
    authMethod: args.authMethod,
    emailUsed: args.emailUsed,
  })
  return { sessionId, expiresAt }
}

// ---------------------------------------------------------------------------
// Inline handler — mirror of routes/auth.ts POST /auth/password/sign-in
// ---------------------------------------------------------------------------

type CookieSet = {
  value: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: string
  maxAge: number
}

type RouteResult = {
  status: number
  headers: Record<string, string>
  body: unknown
  cookieSet?: CookieSet
}

async function passwordSignInHandler(
  email: string,
  password: string,
  requestIp = '1.2.3.4',
): Promise<RouteResult> {
  const headers: Record<string, string> = {}
  let status = 200
  let cookieSet: CookieSet | undefined

  const result = await attemptPasswordSignIn({ email, password, requestIp })

  switch (result.outcome) {
    case 'invalid_credentials':
      status = 401
      return { status, headers, body: { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } }
    case 'inactive_user':
      status = 403
      return { status, headers, body: { error: 'INACTIVE_USER', message: 'This account is no longer active.' } }
    case 'rate_limited_email':
      status = 429
      headers['retry-after'] = String(result.retryAfterSeconds)
      return { status, headers, body: { error: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment before trying again.' } }
    case 'rate_limited_ip':
      status = 429
      return { status, headers, body: { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }
    case 'locked_out':
      status = 423
      headers['retry-after'] = String(result.retryAfterSeconds)
      return { status, headers, body: { error: 'LOCKED_OUT', message: 'Too many failed attempts. Please try again later.' } }
    case 'signed_in': {
      const { sessionId, expiresAt } = await createPortalSession({
        identityUserId: result.identityUserId,
        authMethod: 'password',
        emailUsed: result.emailNormalized,
        request: {},
      })
      cookieSet = {
        value: sessionId,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      }
      return { status: 200, headers, body: { ok: true }, cookieSet }
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  attemptStub = null
  sessionsCreated.length = 0
})

describe('POST /auth/password/sign-in', () => {
  test('happy path → 200, session minted with auth_method=password', async () => {
    attemptStub = async () => ({
      outcome: 'signed_in',
      identityUserId: 'user-1',
      emailNormalized: 'admin@gmail.com',
    })

    const result = await passwordSignInHandler('admin@gmail.com', 'Aha1234567!Bb')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.cookieSet).toBeDefined()
    expect(sessionsCreated).toHaveLength(1)
    expect(sessionsCreated[0]).toEqual({
      identityUserId: 'user-1',
      authMethod: 'password',
      emailUsed: 'admin@gmail.com',
    })
  })

  test('bad password → 401 INVALID_CREDENTIALS', async () => {
    attemptStub = async () => ({ outcome: 'invalid_credentials' })

    const result = await passwordSignInHandler('admin@gmail.com', 'wrong')

    expect(result.status).toBe(401)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('INVALID_CREDENTIALS')
    expect(sessionsCreated).toHaveLength(0)
  })

  test('inactive user → 403 INACTIVE_USER', async () => {
    attemptStub = async () => ({ outcome: 'inactive_user' })

    const result = await passwordSignInHandler('disabled@gmail.com', 'Aha1234567!Bb')

    expect(result.status).toBe(403)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('INACTIVE_USER')
  })

  test('rate limited (per-email) → 429 with Retry-After', async () => {
    attemptStub = async () => ({ outcome: 'rate_limited_email', retryAfterSeconds: 60 })

    const result = await passwordSignInHandler('admin@gmail.com', 'wrong')

    expect(result.status).toBe(429)
    expect(result.headers['retry-after']).toBe('60')
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('RATE_LIMITED')
  })

  test('rate limited (per-IP) → 429 without Retry-After', async () => {
    attemptStub = async () => ({ outcome: 'rate_limited_ip' })

    const result = await passwordSignInHandler('admin@gmail.com', 'wrong', '10.0.0.1')

    expect(result.status).toBe(429)
    expect(result.headers['retry-after']).toBeUndefined()
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('RATE_LIMITED')
  })

  test('lockout → 423 LOCKED_OUT with Retry-After', async () => {
    attemptStub = async () => ({ outcome: 'locked_out', retryAfterSeconds: 900 })

    const result = await passwordSignInHandler('admin@gmail.com', 'wrong')

    expect(result.status).toBe(423)
    expect(result.headers['retry-after']).toBe('900')
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('LOCKED_OUT')
  })
})
