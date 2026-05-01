/**
 * Regression — global `onError` must propagate `throw status(N, body)` from any plugin
 * unchanged.  Before this fix (spec-06 PR E), the onError handler in apps/api/src/index.ts
 * unconditionally set `set.status = 500` for every code other than 'VALIDATION', so a
 * `throw status(401, ...)` from authPlugin's `.derive()` emerged from the API as 500
 * even though Cloud Run logs showed the correct internal 401.  /api/userinfo bypassed
 * the bug only because it sets `set.status = 401` manually instead of throwing.
 *
 * The handler is extracted into apps/api/src/middleware/api-error-handler.ts so this
 * test exercises the same code path mounted by index.ts in production.
 *
 * Critical: the throws here happen inside `.derive()` (matching the production
 * authPlugin pattern).  When thrown from a route handler directly, Elysia applies
 * the status without consulting onError; only derive/middleware throws hit the bug.
 */
import { Elysia } from 'elysia'
import { test, expect, mock } from 'bun:test'

mock.module('~/logger', () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {}, child: () => ({ error: () => {}, warn: () => {}, info: () => {} }) },
}))

const { handleApiError } = await import('~/middleware/api-error-handler')

function buildAppWithDeriveThrow(code: number, body: unknown, headers?: Record<string, string>) {
  const plug = new Elysia({ name: `plug-${code}` }).derive({ as: 'scoped' }, ({ status, set }) => {
    if (headers) {
      for (const [k, v] of Object.entries(headers)) set.headers[k] = v
    }
    throw status(code, body)
  })
  return new Elysia({ prefix: '/api' })
    .onError(handleApiError)
    .group('/v1', g => g.use(plug).get('/probe', () => ({ ok: true })))
}

test('throw status(401, ...) from derive propagates as 401', async () => {
  const res = await buildAppWithDeriveThrow(401, { message: 'No session cookie' })
    .handle(new Request('http://localhost/api/v1/probe'))
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ message: 'No session cookie' })
})

test('throw status(403, ...) from derive propagates as 403', async () => {
  const res = await buildAppWithDeriveThrow(403, { message: 'Insufficient portal role' })
    .handle(new Request('http://localhost/api/v1/probe'))
  expect(res.status).toBe(403)
  expect(await res.json()).toEqual({ message: 'Insufficient portal role' })
})

test('throw status(404, ...) from derive propagates as 404', async () => {
  const res = await buildAppWithDeriveThrow(404, { message: 'Not found' })
    .handle(new Request('http://localhost/api/v1/probe'))
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ message: 'Not found' })
})

test('throw status(409, ...) from derive propagates as 409 with structured body', async () => {
  const res = await buildAppWithDeriveThrow(409, { error: 'EMAIL_IN_USE' })
    .handle(new Request('http://localhost/api/v1/probe'))
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'EMAIL_IN_USE' })
})

test('throw status(429, ...) from derive propagates as 429 and preserves retry-after', async () => {
  const res = await buildAppWithDeriveThrow(429, { error: 'RATE_LIMITED' }, { 'retry-after': '60' })
    .handle(new Request('http://localhost/api/v1/probe'))
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBe('60')
  expect(await res.json()).toEqual({ error: 'RATE_LIMITED' })
})

test('genuine unhandled errors render as a sanitised 500 (no message leak)', async () => {
  const plug = new Elysia({ name: 'boom-plug' }).derive({ as: 'scoped' }, () => {
    throw new Error('private internal detail with SQL parameters')
  })
  const app = new Elysia({ prefix: '/api' })
    .onError(handleApiError)
    .group('/v1', g => g.use(plug).get('/probe', () => ({ ok: true })))
  const res = await app.handle(new Request('http://localhost/api/v1/probe'))
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ message: 'Internal error' })
})

test('mirrors authPlugin: derive throws 401, route never executes', async () => {
  // Faithful reproduction of the production bug: authPlugin's `.derive` block at
  // apps/api/src/middleware/auth.ts:89 throws status(401, ...) when no session cookie.
  // Pre-fix: the response was 500.  Post-fix: 401 with the original body.
  const authPlugMock = new Elysia({ name: 'auth-plug-mock' }).derive({ as: 'scoped' }, ({ request, status }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    if (!cookieHeader.includes('__session=')) {
      throw status(401, { message: 'No session cookie' })
    }
    return { authUser: { id: 'fake', portalRole: 'admin' as const } }
  })
  const app = new Elysia({ prefix: '/api' })
    .onError(handleApiError)
    .group('/v1', g =>
      g.use(authPlugMock).get('/dashboard', ({ authUser }) => ({ user: authUser.id })),
    )
  const res = await app.handle(new Request('http://localhost/api/v1/dashboard'))
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ message: 'No session cookie' })
})
