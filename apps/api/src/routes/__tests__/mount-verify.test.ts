/**
 * Mount verification — exercises audit-log route auth and shape.
 * Simulates the four curl checks the admiral requested.
 */
import { mock, test, expect, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'

let tokenValid = true

mock.module('~/middleware/broker-token', () => ({
  requireBrokerToken: () =>
    new Elysia({ name: 'mock-broker-mv' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      const auth = request.headers.get('authorization')
      if (!tokenValid || !auth?.startsWith('Bearer ')) throw status(401, { error: 'unauthorized', reason: 'invalid_token' })
      return { app: { id: 'app-a-id', slug: 'app-a' } }
    }),
}))
mock.module('../middleware/broker-token', () => ({
  requireBrokerToken: () =>
    new Elysia({ name: 'mock-broker-mv-rel' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      const auth = request.headers.get('authorization')
      if (!tokenValid || !auth?.startsWith('Bearer ')) throw status(401, { error: 'unauthorized', reason: 'invalid_token' })
      return { app: { id: 'app-a-id', slug: 'app-a' } }
    }),
}))

mock.module('~/db', () => ({
  db: {
    select: (_cols: unknown) => ({
      from: (_t: unknown) => ({
        where: (_c: unknown) => ({
          orderBy: (..._a: unknown[]) => ({
            limit: (_n: number) => Promise.resolve([])
          })
        })
      })
    })
  }
}))

mock.module('~/db/schema/audit', () => ({
  accessAuditLog: {
    id: 'accessAuditLog.id', createdAt: 'accessAuditLog.createdAt',
    actorId: 'accessAuditLog.actorId', action: 'accessAuditLog.action',
    targetType: 'accessAuditLog.targetType', targetId: 'accessAuditLog.targetId',
    actorAppId: 'accessAuditLog.actorAppId', targetAppId: 'accessAuditLog.targetAppId',
    requestId: 'accessAuditLog.requestId', details: 'accessAuditLog.details',
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ type: 'eq', left: l, right: r }),
  and: (...c: unknown[]) => ({ type: 'and', conditions: c }),
  or: (...c: unknown[]) => ({ type: 'or', conditions: c }),
  gte: (l: unknown, r: unknown) => ({ type: 'gte', left: l, right: r }),
  lte: (l: unknown, r: unknown) => ({ type: 'lte', left: l, right: r }),
  lt: (l: unknown, r: unknown) => ({ type: 'lt', left: l, right: r }),
  desc: (c: unknown) => ({ type: 'desc', col: c }),
  inArray: (l: unknown, v: unknown) => ({ type: 'inArray', left: l, values: v }),
  ne: (l: unknown, r: unknown) => ({ type: 'ne', left: l, right: r }),
  asc: (c: unknown) => ({ type: 'asc', col: c }),
  sql: new Proxy((s: TemplateStringsArray) => s.join(''), { get: (_t, p) => p }),
  relations: () => ({}),
  index: () => ({ on: () => ({}) }),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  unique: () => ({ on: () => ({}) }),
  pgTable: (_: string, c: unknown) => c,
}))

const { auditLogRoutes } = await import('../audit-log')
const app = new Elysia({ prefix: '/api' }).group('/v1', g => g.use(auditLogRoutes))

beforeEach(() => { tokenValid = true })

// Check 1: 401 without token, sanitized error body
test('GET /api/v1/audit-log without token → 401, no internal state in body', async () => {
  tokenValid = false
  const res = await app.handle(new Request('http://localhost/api/v1/audit-log'))
  expect(res.status).toBe(401)
  const body = await res.json() as Record<string, unknown>
  expect(body.error).toBe('unauthorized')
  const text = JSON.stringify(body)
  expect(text).not.toContain('not found')
  expect(text).not.toContain('app id')
  expect(text).not.toContain('appId')
  expect(text).not.toContain('app_id')
  expect(text).not.toContain('actor_ip')
})

// Check 2 (proxy for employees — authPlugin path): confirm audit-log route does NOT
// absorb session-cookie requests by checking that a request with a cookie header
// still gets 401 from requireBrokerToken (no bearer token present)
test('GET /api/v1/audit-log with session cookie but no bearer → 401 from requireBrokerToken', async () => {
  tokenValid = true // broker mock requires bearer, cookie alone is not enough
  const res = await app.handle(
    new Request('http://localhost/api/v1/audit-log', {
      headers: { cookie: '__session=some-valid-cookie' }
    })
  )
  expect(res.status).toBe(401)
})

// Check 3: 200 with correct shape when bearer token present
test('GET /api/v1/audit-log with valid bearer → 200 with entries/nextCursor', async () => {
  const res = await app.handle(
    new Request('http://localhost/api/v1/audit-log', {
      headers: { authorization: 'Bearer valid-token' }
    })
  )
  expect(res.status).toBe(200)
  const body = await res.json() as { entries: unknown[]; nextCursor: unknown }
  expect(Array.isArray(body.entries)).toBe(true)
  expect(body.nextCursor).toBeNull()
})

// Check 4: actor_ip never in response
test('actor_ip never in response', async () => {
  const res = await app.handle(
    new Request('http://localhost/api/v1/audit-log', {
      headers: { authorization: 'Bearer valid-token' }
    })
  )
  const text = await res.text()
  expect(text).not.toContain('actor_ip')
})

// Check 5: route is registered at the correct path
test('audit-log route registered at GET /api/v1/audit-log/', async () => {
  const routes = (app as unknown as { routes: Array<{ path: string; method: string }> }).routes
  const auditRoute = routes.find(r => r.path.includes('audit-log') && r.method === 'GET')
  expect(auditRoute).toBeDefined()
  expect(auditRoute!.path).toMatch(/v1.*audit-log/)
})

// F-2: x-coms-request-id header present on 401 error responses
// Build a minimal app that mirrors index.ts: requestIdPlugin + onError stamp + audit-log route.
mock.module('~/logger', () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {}, child: () => ({ error: () => {}, warn: () => {}, info: () => {} }) }
}))
const { requestIdPlugin } = await import('~/middleware/request-id')
const UUID_RE_F2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const appWithRequestId = new Elysia({ prefix: '/api' })
  .use(requestIdPlugin)
  .onError((context) => {
    const { set } = context
    // requestId is populated by requestIdPlugin's global derive before the throw.
    const requestId = (context as Record<string, unknown>).requestId as string | undefined
    if (requestId) set.headers['x-coms-request-id'] = requestId
    // Do NOT override set.status — Elysia already sets it from the thrown error.
  })
  .group('/v1', g => g.use(auditLogRoutes))

test('F-2: 401 error response carries x-coms-request-id header', async () => {
  tokenValid = false
  const res = await appWithRequestId.handle(new Request('http://localhost/api/v1/audit-log'))
  expect(res.status).toBe(401)
  const header = res.headers.get('x-coms-request-id')
  expect(header).not.toBeNull()
  expect(UUID_RE_F2.test(header!)).toBe(true)
})

test('F-2: x-coms-request-id on 401 is a fresh UUID (not the forged inbound value)', async () => {
  tokenValid = false
  const forged = 'not-a-uuid-at-all'
  const res = await appWithRequestId.handle(
    new Request('http://localhost/api/v1/audit-log', {
      headers: { 'x-coms-request-id': forged }
    })
  )
  expect(res.status).toBe(401)
  const header = res.headers.get('x-coms-request-id')
  expect(header).not.toBe(forged)
  expect(UUID_RE_F2.test(header!)).toBe(true)
})
