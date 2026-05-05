import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { fullDrizzleOrmMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock requireRole — default: admin allowed
// ---------------------------------------------------------------------------

let isAdmin = true

mock.module('~/middleware/rbac', () => ({
  requireRole: (..._roles: string[]) =>
    new Elysia({ name: 'mock-require-role-admin-employees' }).derive({ as: 'scoped' }, async ({ status }) => {
      if (!isAdmin) throw status(403, { message: 'Insufficient portal role' })
      return {
        authUser: {
          id: '00000000-0000-0000-0000-00000000ad00',
          email: 'admin@test.com',
          name: 'Admin',
          portalRole: 'admin',
          gipUid: 'gip-admin',
          teamIds: [],
          apps: [],
        },
      }
    }),
}))

// ---------------------------------------------------------------------------
// Mock identity_users select for active-row enumeration.
// The route runs:
//   db.select({ id: identityUsers.id }).from(identityUsers).where(eq(identityUsers.status, 'active'))
// We return the configured set on `where()` (terminal in production usage)
// AND on `then()` so async-await on the chain resolves to the same rows.
// ---------------------------------------------------------------------------

let activeUserIds: string[] = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]

function makeSelectChain() {
  const rows = activeUserIds.map((id) => ({ id }))
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  select: () => makeSelectChain(),
}

mock.module('~/db', () => ({ db: mockDb }))

// Schema barrel surface used by the route module.  Each schema gets a flat
// stub object so production code can reference identityUsers.status etc.
const schemaPlaceholder = (prefix: string, ...fields: string[]) =>
  Object.fromEntries(fields.map((f) => [f, `${prefix}.${f}`]))

mock.module('~/db/schema', () => ({
  identityUsers: schemaPlaceholder('iu', 'id', 'status', 'name'),
}))
mock.module('~/db/schema/identity-users', () => ({
  identityUsers: schemaPlaceholder('iu', 'id', 'status', 'name'),
}))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// ---------------------------------------------------------------------------
// Mock provisioning emit
// ---------------------------------------------------------------------------

const mockEmitUserProvisioned = mock(async (_userId: string) => {})
mock.module('~/services/provisioning-events', () => ({
  emitUserProvisioned: mockEmitUserProvisioned,
  emitUserUpdated: mock(async () => {}),
  emitUserOffboarded: mock(async () => {}),
}))

// ---------------------------------------------------------------------------
// Mock audit + logger
// ---------------------------------------------------------------------------

const mockLogAudit = mock(async (_params: unknown) => {})
mock.module('~/services/audit', () => ({ logAudit: mockLogAudit }))

mock.module('~/logger', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}))

// ---------------------------------------------------------------------------
// Import route (after mocks are wired)
// ---------------------------------------------------------------------------

const { adminEmployeesRoutes } = await import('../employees')

function makeApp() {
  return new Elysia().use(adminEmployeesRoutes)
}
type TestApp = ReturnType<typeof makeApp>

async function request(app: TestApp, method: string, path: string, body?: unknown) {
  return app.handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }))
}

function reset() {
  isAdmin = true
  activeUserIds = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ]
  mockEmitUserProvisioned.mockReset()
  mockEmitUserProvisioned.mockImplementation(async () => {})
  mockLogAudit.mockReset()
  mockLogAudit.mockImplementation(async () => {})
}

// ---------------------------------------------------------------------------
// POST /employees/rebroadcast-provisioning
// ---------------------------------------------------------------------------

describe('POST /admin/employees/rebroadcast-provisioning', () => {
  beforeEach(reset)

  test('happy path — fans out one emit per active identity_users row', async () => {
    const app = makeApp()
    const res = await request(app, 'POST', '/employees/rebroadcast-provisioning', {})

    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number; fired: number; failed: number; failures: unknown[] }
    expect(body.count).toBe(3)
    expect(body.fired).toBe(3)
    expect(body.failed).toBe(0)
    expect(body.failures).toEqual([])

    expect(mockEmitUserProvisioned).toHaveBeenCalledTimes(3)
    const calledIds = (mockEmitUserProvisioned.mock.calls as unknown as Array<[string]>).map((c) => c[0]).sort()
    expect(calledIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ])

    // One audit summary entry; no per-user failure entries because all succeeded.
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    const summaryArgs = (mockLogAudit.mock.calls[0] as unknown as Array<{
      action: string
      details: { count: number; requestedCount: number | null; source: string }
    }>)[0]
    expect(summaryArgs.action).toBe('bulk_rebroadcast_provisioning')
    expect(summaryArgs.details.count).toBe(3)
    expect(summaryArgs.details.requestedCount).toBeNull()
  })

  test('selective userIds — only the requested ids are fanned out', async () => {
    const app = makeApp()
    const res = await request(app, 'POST', '/employees/rebroadcast-provisioning', {
      userIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number; fired: number; failed: number }
    expect(body.count).toBe(2)
    expect(body.fired).toBe(2)
    expect(body.failed).toBe(0)

    expect(mockEmitUserProvisioned).toHaveBeenCalledTimes(2)
    const calledIds = (mockEmitUserProvisioned.mock.calls as unknown as Array<[string]>).map((c) => c[0]).sort()
    expect(calledIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])

    // Summary records the requestedCount that the caller asked for.
    const summaryArgs = (mockLogAudit.mock.calls[0] as unknown as Array<{
      details: { count: number; requestedCount: number | null }
    }>)[0]
    expect(summaryArgs.details.requestedCount).toBe(2)
    expect(summaryArgs.details.count).toBe(2)
  })

  test('partial failure — one emit throws → response shows failed:1 and failure audit row', async () => {
    const failingId = '22222222-2222-4222-8222-222222222222'
    mockEmitUserProvisioned.mockImplementation(async (userId: string) => {
      if (userId === failingId) throw new Error('downstream-boom')
    })

    const app = makeApp()
    const res = await request(app, 'POST', '/employees/rebroadcast-provisioning', {})

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      count: number
      fired: number
      failed: number
      failures: Array<{ userId: string; error: string }>
    }
    expect(body.count).toBe(3)
    expect(body.fired).toBe(2)
    expect(body.failed).toBe(1)
    expect(body.failures).toHaveLength(1)
    expect(body.failures[0]).toEqual({ userId: failingId, error: 'downstream-boom' })

    // 1 summary entry + 1 per-user failure entry = 2 audit calls.
    expect(mockLogAudit).toHaveBeenCalledTimes(2)
    const summary = (mockLogAudit.mock.calls[0] as unknown as Array<{ action: string; details: { count: number } }>)[0]
    expect(summary.action).toBe('bulk_rebroadcast_provisioning')
    expect(summary.details.count).toBe(3)

    const failure = (mockLogAudit.mock.calls[1] as unknown as Array<{
      action: string
      targetType: string
      targetId: string
      details: { error: string }
    }>)[0]
    expect(failure.action).toBe('bulk_rebroadcast_provisioning_failure')
    expect(failure.targetType).toBe('user')
    expect(failure.targetId).toBe(failingId)
    expect(failure.details.error).toBe('downstream-boom')
  })

  test('non-admin → 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await request(app, 'POST', '/employees/rebroadcast-provisioning', {})
    expect(res.status).toBe(403)
    expect(mockEmitUserProvisioned).not.toHaveBeenCalled()
  })

  test('empty selection (no active rows, no userIds passed) → 200 with zero counts', async () => {
    activeUserIds = []
    const app = makeApp()
    const res = await request(app, 'POST', '/employees/rebroadcast-provisioning', {})
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number; fired: number; failed: number }
    expect(body.count).toBe(0)
    expect(body.fired).toBe(0)
    expect(body.failed).toBe(0)
    expect(mockEmitUserProvisioned).not.toHaveBeenCalled()
  })
})
