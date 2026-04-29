/**
 * Tenant-scoped audit-log read tests (Effect 3.10).
 *
 * Cross-tenant leak is a hard gate: the test verifies that requesting with
 * app A's broker token returns zero rows from app B, even with crafted params.
 *
 * actor_ip absence: JSON.stringify of any response must not contain 'actor_ip'.
 *
 * This file mocks requireBrokerToken and the DB layer so no real signing keys
 * or Postgres connection are required.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// App fixtures
// ---------------------------------------------------------------------------

const APP_A = { id: 'aaaaaaaa-0000-0000-0000-000000000001', slug: 'app-a' }
const APP_B = { id: 'bbbbbbbb-0000-0000-0000-000000000001', slug: 'app-b' }

// ---------------------------------------------------------------------------
// Audit log row fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-29T12:00:00.000Z')
const HOUR_AGO = new Date('2026-04-29T11:00:00.000Z')
const TWO_HOURS_AGO = new Date('2026-04-29T10:00:00.000Z')

type AuditRow = {
  id: string
  createdAt: Date
  actorId: string
  action: string
  targetType: string
  targetId: string
  actorAppId: string | null
  targetAppId: string | null
  requestId: string | null
  details: unknown | null
}

// Row where A is actor
const ROW_A_ACTOR: AuditRow = {
  id: 'row-a-actor-001',
  createdAt: HOUR_AGO,
  actorId: 'user-1',
  action: 'view',
  targetType: 'app',
  targetId: APP_A.id,
  actorAppId: APP_A.id,
  targetAppId: null,
  requestId: 'req-a-001',
  details: null,
}

// Row where A is target
const ROW_A_TARGET: AuditRow = {
  id: 'row-a-target-001',
  createdAt: TWO_HOURS_AGO,
  actorId: 'user-2',
  action: 'admin_action',
  targetType: 'app',
  targetId: APP_A.id,
  actorAppId: null,
  targetAppId: APP_A.id,
  requestId: 'req-admin-001',
  details: { note: 'admin acted on behalf of A' },
}

// Row scoped only to B (actor)
const ROW_B_ACTOR: AuditRow = {
  id: 'row-b-actor-001',
  createdAt: HOUR_AGO,
  actorId: 'user-3',
  action: 'view',
  targetType: 'app',
  targetId: APP_B.id,
  actorAppId: APP_B.id,
  targetAppId: null,
  requestId: 'req-b-001',
  details: null,
}

// Row scoped only to B (target)
const ROW_B_TARGET: AuditRow = {
  id: 'row-b-target-001',
  createdAt: TWO_HOURS_AGO,
  actorId: 'user-4',
  action: 'admin_action',
  targetType: 'app',
  targetId: APP_B.id,
  actorAppId: null,
  targetAppId: APP_B.id,
  requestId: 'req-b-002',
  details: null,
}

// Row touching neither A nor B
const ROW_NEITHER: AuditRow = {
  id: 'row-neither-001',
  createdAt: HOUR_AGO,
  actorId: 'user-5',
  action: 'login',
  targetType: 'user',
  targetId: 'user-5',
  actorAppId: null,
  targetAppId: null,
  requestId: 'req-none-001',
  details: null,
}

// All rows in the fixture "database"
const ALL_ROWS: AuditRow[] = [ROW_A_ACTOR, ROW_A_TARGET, ROW_B_ACTOR, ROW_B_TARGET, ROW_NEITHER]

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

// The calling app — switched between tests to simulate different tenants.
let callingApp = APP_A

// Whether to require a token header (simulates invalid/missing token).
let tokenValid = true

// Captured WHERE predicate from the DB mock — used to verify tenant-scoping.
let capturedWhereCondition: unknown = null

// ---------------------------------------------------------------------------
// requireBrokerToken mock — injects callingApp or throws 401
// ---------------------------------------------------------------------------

mock.module('~/middleware/broker-token', () => ({
  requireBrokerToken: () =>
    new Elysia({ name: 'mock-require-broker-token' }).derive(
      { as: 'scoped' },
      async ({ request, status }: { request: Request; status: (code: number, body: unknown) => Error }) => {
        const auth = request.headers.get('authorization')
        if (!tokenValid || !auth || !auth.startsWith('Bearer ')) {
          throw status(401, { error: 'unauthorized', reason: 'invalid_token' })
        }
        return { app: callingApp }
      },
    ),
}))

mock.module('../middleware/broker-token', () => ({
  requireBrokerToken: () =>
    new Elysia({ name: 'mock-require-broker-token-rel' }).derive(
      { as: 'scoped' },
      async ({ request, status }: { request: Request; status: (code: number, body: unknown) => Error }) => {
        const auth = request.headers.get('authorization')
        if (!tokenValid || !auth || !auth.startsWith('Bearer ')) {
          throw status(401, { error: 'unauthorized', reason: 'invalid_token' })
        }
        return { app: callingApp }
      },
    ),
}))

// ---------------------------------------------------------------------------
// DB mock — applies tenant filter in-process (simulating SQL WHERE)
// ---------------------------------------------------------------------------

// This mock captures the where condition AND applies the actual tenant filter
// so cross-tenant leak tests are meaningful: the filter is applied in JS the
// same way the WHERE clause would filter in SQL.

function applyWhereFilter(rows: AuditRow[], condition: unknown): AuditRow[] {
  if (!condition || typeof condition !== 'object') return rows

  const cond = condition as Record<string, unknown>

  if (cond.type === 'and') {
    const conditions = cond.conditions as unknown[]
    return conditions.reduce(
      (acc: AuditRow[], c) => applyWhereFilter(acc, c),
      rows,
    )
  }

  if (cond.type === 'or') {
    const conditions = cond.conditions as unknown[]
    const matched = new Set<string>()
    const result: AuditRow[] = []
    for (const c of conditions) {
      for (const row of applyWhereFilter(rows, c)) {
        if (!matched.has(row.id)) {
          matched.add(row.id)
          result.push(row)
        }
      }
    }
    return result
  }

  if (cond.type === 'eq') {
    const left = cond.left as string
    const right = cond.right as string
    return rows.filter((row) => {
      if (left === 'accessAuditLog.actorAppId') return row.actorAppId === right
      if (left === 'accessAuditLog.targetAppId') return row.targetAppId === right
      if (left === 'accessAuditLog.id') return row.id === right
      if (left === 'accessAuditLog.createdAt') return row.createdAt.toISOString() === right
      return true
    })
  }

  if (cond.type === 'gte') {
    const left = cond.left as string
    const right = cond.right as unknown
    return rows.filter((row) => {
      if (left === 'accessAuditLog.createdAt') return row.createdAt >= (right as Date)
      return true
    })
  }

  if (cond.type === 'lte') {
    const left = cond.left as string
    const right = cond.right as unknown
    return rows.filter((row) => {
      if (left === 'accessAuditLog.createdAt') return row.createdAt <= (right as Date)
      return true
    })
  }

  if (cond.type === 'lt') {
    const left = cond.left as string
    const right = cond.right as unknown
    return rows.filter((row) => {
      if (left === 'accessAuditLog.createdAt') return row.createdAt < (right as Date)
      if (left === 'accessAuditLog.id') return row.id < (right as string)
      return true
    })
  }

  return rows
}

// Chainable DB mock that intercepts select/from/where/orderBy/limit
function makeDbChain(baseRows: AuditRow[]) {
  let filteredRows = baseRows
  const chain = {
    select: (_cols: unknown) => chain,
    from: (_table: unknown) => chain,
    where: (condition: unknown) => {
      capturedWhereCondition = condition
      filteredRows = applyWhereFilter(baseRows, condition)
      return chain
    },
    orderBy: (..._args: unknown[]) => chain,
    limit: (n: number) => Promise.resolve(filteredRows.slice(0, n)),
  }
  return chain
}

const db = {
  select: (_cols: unknown) => makeDbChain(ALL_ROWS),
}

mock.module('~/db', () => ({ db }))

mock.module('~/db/schema/audit', () => ({
  accessAuditLog: {
    id: 'accessAuditLog.id',
    createdAt: 'accessAuditLog.createdAt',
    actorId: 'accessAuditLog.actorId',
    action: 'accessAuditLog.action',
    targetType: 'accessAuditLog.targetType',
    targetId: 'accessAuditLog.targetId',
    actorAppId: 'accessAuditLog.actorAppId',
    targetAppId: 'accessAuditLog.targetAppId',
    requestId: 'accessAuditLog.requestId',
    details: 'accessAuditLog.details',
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
  or: (...conditions: unknown[]) => ({ type: 'or', conditions }),
  gte: (left: unknown, right: unknown) => ({ type: 'gte', left, right }),
  lte: (left: unknown, right: unknown) => ({ type: 'lte', left, right }),
  lt: (left: unknown, right: unknown) => ({ type: 'lt', left, right }),
  desc: (col: unknown) => ({ type: 'desc', col }),
  inArray: (left: unknown, values: unknown) => ({ type: 'inArray', left, values }),
  ne: (left: unknown, right: unknown) => ({ type: 'ne', left, right }),
  asc: (col: unknown) => ({ type: 'asc', col }),
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  index: () => ({ on: () => ({}) }),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  unique: () => ({ on: () => ({}) }),
  pgTable: (_name: string, cols: unknown) => cols,
}))

// ---------------------------------------------------------------------------
// Import route after mocks are in place
// ---------------------------------------------------------------------------

const { auditLogRoutes } = await import('../audit-log')

const testApp = new Elysia({ prefix: '/v1' }).use(auditLogRoutes)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, token?: string): Request {
  const headers = new Headers()
  if (token !== undefined) {
    headers.set('authorization', `Bearer ${token}`)
  }
  return new Request(`http://localhost/v1${path}`, { method: 'GET', headers })
}

function authed(path = '/audit-log/'): Request {
  return makeRequest(path, 'valid-token')
}

function unauthed(path = '/audit-log/'): Request {
  return makeRequest(path)
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  callingApp = APP_A
  tokenValid = true
  capturedWhereCondition = null
})

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('Authentication', () => {
  test('returns 401 when Authorization header is missing', async () => {
    const res = await testApp.handle(unauthed())
    expect(res.status).toBe(401)
  })

  test('returns 401 when token is invalid (mock tokenValid=false)', async () => {
    tokenValid = false
    const res = await testApp.handle(authed())
    expect(res.status).toBe(401)
  })

  test('returns 200 with valid broker token', async () => {
    const res = await testApp.handle(authed())
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Cross-tenant leak (hard gate)
// ---------------------------------------------------------------------------

describe('Cross-tenant isolation', () => {
  test('app A token returns only rows where actorAppId=A or targetAppId=A', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: AuditRow[] }
    const ids = body.entries.map((e) => e.id)
    expect(ids).toContain(ROW_A_ACTOR.id)
    expect(ids).toContain(ROW_A_TARGET.id)
    // B-scoped rows must never appear
    expect(ids).not.toContain(ROW_B_ACTOR.id)
    expect(ids).not.toContain(ROW_B_TARGET.id)
    // Neither-row must never appear
    expect(ids).not.toContain(ROW_NEITHER.id)
  })

  test('app B token returns only rows where actorAppId=B or targetAppId=B', async () => {
    callingApp = APP_B
    const res = await testApp.handle(authed('/audit-log/?from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: AuditRow[] }
    const ids = body.entries.map((e) => e.id)
    expect(ids).toContain(ROW_B_ACTOR.id)
    expect(ids).toContain(ROW_B_TARGET.id)
    // A-scoped rows must never appear
    expect(ids).not.toContain(ROW_A_ACTOR.id)
    expect(ids).not.toContain(ROW_A_TARGET.id)
    expect(ids).not.toContain(ROW_NEITHER.id)
  })

  test('app A token with crafted large limit does not return B rows', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?limit=100'))
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: AuditRow[] }
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(ROW_B_ACTOR.id)
    expect(serialized).not.toContain(ROW_B_TARGET.id)
  })

  test('WHERE predicate uses OR(actorAppId=caller, targetAppId=caller)', async () => {
    callingApp = APP_A
    // Issue a request to populate capturedWhereCondition, then inspect it.
    await testApp.handle(authed('/audit-log/?from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    expect(capturedWhereCondition).toBeDefined()
    expect(capturedWhereCondition).not.toBeNull()
    // The top-level condition should be an AND containing an OR
    const top = capturedWhereCondition as { type: string; conditions: unknown[] }
    expect(top.type).toBe('and')
    const orCond = top.conditions.find(
      (c) => (c as { type: string }).type === 'or',
    ) as { type: string; conditions: { type: string; left: string; right: string }[] } | undefined
    expect(orCond).toBeDefined()
    const ors = orCond!.conditions
    const actorEq = ors.find((c) => c.left === 'accessAuditLog.actorAppId')
    const targetEq = ors.find((c) => c.left === 'accessAuditLog.targetAppId')
    expect(actorEq?.right).toBe(APP_A.id)
    expect(targetEq?.right).toBe(APP_A.id)
  })
})

// ---------------------------------------------------------------------------
// actor_ip never in response
// ---------------------------------------------------------------------------

describe('PII: actor_ip never returned', () => {
  test('JSON.stringify of response does not contain "actor_ip"', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('actor_ip')
  })

  test('actor_ip absent even when fetching all results with large limit', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?limit=100'))
    const text = await res.text()
    expect(text).not.toContain('actor_ip')
  })
})

// ---------------------------------------------------------------------------
// Date filters
// ---------------------------------------------------------------------------

describe('Date filters', () => {
  test('from/to filters constrain returned rows', async () => {
    callingApp = APP_A
    // Only ROW_A_ACTOR is within this narrow window
    const from = '2026-04-29T10:30:00.000Z' // after TWO_HOURS_AGO, before HOUR_AGO
    const to = '2026-04-29T12:30:00.000Z'
    const res = await testApp.handle(authed(`/audit-log/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: AuditRow[] }
    const ids = body.entries.map((e) => e.id)
    expect(ids).toContain(ROW_A_ACTOR.id)
    expect(ids).not.toContain(ROW_A_TARGET.id) // ROW_A_TARGET is at TWO_HOURS_AGO = 10:00, below from
  })

  test('invalid from date returns 400', async () => {
    const res = await testApp.handle(authed('/audit-log/?from=not-a-date'))
    expect(res.status).toBe(400)
  })

  test('invalid to date returns 400', async () => {
    const res = await testApp.handle(authed('/audit-log/?to=not-a-date'))
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

describe('Cursor pagination', () => {
  test('invalid cursor returns 400 with sanitized error (no cursor/parse info echoed)', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?cursor=not-valid-base64url-json!!'))
    expect(res.status).toBe(400)
    const text = await res.text()
    // Must not echo back the cursor value or parse error
    expect(text).not.toContain('not-valid-base64url-json')
    expect(text).not.toContain('SyntaxError')
    expect(text).not.toContain('JSON')
    expect(text).toContain('invalid cursor')
  })

  test('response contains nextCursor when there are more results', async () => {
    callingApp = APP_A
    // Request limit=1 so we only get one row and expect a nextCursor
    const res = await testApp.handle(authed('/audit-log/?limit=1&from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: AuditRow[]; nextCursor: string | null }
    expect(body.entries).toHaveLength(1)
    expect(body.nextCursor).not.toBeNull()
  })

  test('nextCursor is a valid base64url string', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?limit=1&from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    const body = await res.json() as { nextCursor: string }
    const cursor = body.nextCursor
    expect(typeof cursor).toBe('string')
    // base64url characters only
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+=*$/)
    // Decodable to valid JSON
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'))
    expect(typeof decoded.createdAt).toBe('string')
    expect(typeof decoded.id).toBe('string')
  })

  test('nextCursor is null when all results fit in one page', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?limit=100&from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    const body = await res.json() as { nextCursor: string | null }
    expect(body.nextCursor).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('Response shape', () => {
  test('each entry has expected fields', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: Record<string, unknown>[] }
    expect(body.entries.length).toBeGreaterThan(0)
    for (const entry of body.entries) {
      expect(typeof entry.id).toBe('string')
      expect(typeof entry.occurredAt).toBe('string')
      expect(typeof entry.actorId).toBe('string')
      expect(typeof entry.action).toBe('string')
      expect(typeof entry.targetType).toBe('string')
      expect(typeof entry.targetId).toBe('string')
      // actorAppId / targetAppId may be string or null
      expect(entry.actorAppId === null || typeof entry.actorAppId === 'string').toBe(true)
      expect(entry.targetAppId === null || typeof entry.targetAppId === 'string').toBe(true)
      expect(entry.requestId === null || typeof entry.requestId === 'string').toBe(true)
      // actor_ip must be absent
      expect('actor_ip' in entry).toBe(false)
      expect('actorIp' in entry).toBe(false)
    }
  })

  test('requestId is propagated from fixture rows', async () => {
    callingApp = APP_A
    const res = await testApp.handle(authed('/audit-log/?from=2026-04-29T00:00:00Z&to=2026-04-29T23:59:59Z'))
    const body = await res.json() as { entries: Array<{ id: string; requestId: string | null }> }
    const rowA = body.entries.find((e) => e.id === ROW_A_ACTOR.id)
    expect(rowA?.requestId).toBe('req-a-001')
  })
})
