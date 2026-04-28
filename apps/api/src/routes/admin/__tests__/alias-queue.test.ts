import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireRole — default: admin allowed
// ---------------------------------------------------------------------------

let isAdmin = true

mock.module('~/middleware/rbac', () => ({
  requireRole: (..._roles: string[]) =>
    new Elysia({ name: 'mock-require-role' }).derive({ as: 'scoped' }, async ({ status }) => {
      if (!isAdmin) throw status(403, { message: 'Insufficient portal role' })
      return {
        authUser: {
          id: 'admin-user-uuid',
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
// Queue row fixture
// ---------------------------------------------------------------------------

type QueueRow = {
  id: string
  rawName: string
  rawNameNormalized: string
  suggestedIdentityUserId: string | null
  source: string
  context: Record<string, unknown>
  status: string
  createdAt: Date
  resolvedAt: Date | null
  resolvedBy: string | null
  resolutionAction: string | null
}

const queueRows: QueueRow[] = [
  {
    id: 'queue-row-1',
    rawName: 'Jane Smith',
    rawNameNormalized: 'jane smith',
    suggestedIdentityUserId: null,
    source: 'auto_seed',
    context: {},
    status: 'pending',
    createdAt: new Date('2026-04-26T10:00:00Z'),
    resolvedAt: null,
    resolvedBy: null,
    resolutionAction: null,
  },
  {
    id: 'queue-row-2',
    rawName: 'Jane E. Smith',
    rawNameNormalized: 'jane smith',
    suggestedIdentityUserId: 'user-uuid-123',
    source: 'sheet_import',
    context: {},
    status: 'pending',
    createdAt: new Date('2026-04-27T10:00:00Z'),
    resolvedAt: null,
    resolvedBy: null,
    resolutionAction: null,
  },
  {
    id: 'queue-row-3',
    rawName: 'Bob Jones',
    rawNameNormalized: 'bob jones',
    suggestedIdentityUserId: null,
    source: 'auto_seed',
    context: {},
    status: 'pending',
    createdAt: new Date('2026-04-28T08:00:00Z'),
    resolvedAt: null,
    resolvedBy: null,
    resolutionAction: null,
  },
]

// ---------------------------------------------------------------------------
// Mock db
// ---------------------------------------------------------------------------

let findFirstResult: QueueRow | undefined = undefined

const mockUpdateChain = {
  set: () => mockUpdateChain,
  where: async () => undefined,
}

const mockSelectChain = {
  from: () => mockSelectChain,
  where: () => mockSelectChain,
  orderBy: async () => queueRows.filter((r) => r.status === 'pending'),
}

const mockDb = {
  select: () => mockSelectChain,
  update: () => mockUpdateChain,
  query: {
    aliasCollisionQueue: {
      findFirst: async (_opts: unknown) => findFirstResult,
    },
  },
}

mock.module('~/db', () => ({ db: mockDb }))

// Mock individual schema modules + drizzle-orm so the barrel can safely re-export them
// without evaluating real drizzle-orm column helpers.
const schemaPlaceholder = (prefix: string, ...fields: string[]) =>
  Object.fromEntries(fields.map((f) => [f, `${prefix}.${f}`]))

mock.module('~/db/schema/alias-collision-queue', () => ({
  aliasCollisionQueue: schemaPlaceholder('acq', 'id', 'rawName', 'rawNameNormalized', 'suggestedIdentityUserId', 'source', 'context', 'status', 'createdAt', 'resolvedAt', 'resolvedBy', 'resolutionAction'),
}))
mock.module('~/db/schema/app-user-config', () => ({
  appUserConfig: schemaPlaceholder('auc', 'portalSub', 'appId', 'config', 'schemaVersion', 'updatedAt'),
}))
mock.module('~/db/schema/identity-users', () => ({
  identityUsers: schemaPlaceholder('iu', 'id', 'name', 'email', 'status', 'portalSub', 'gipUid', 'createdAt', 'updatedAt'),
}))
mock.module('~/db/schema/bulk-edit-locks', () => ({
  bulkEditLocks: schemaPlaceholder('bel', 'appId', 'acquiredBy', 'acquiredAt'),
}))
mock.module('drizzle-orm', () => ({
  eq: (_l: unknown, _r: unknown) => ({}),
  and: (..._args: unknown[]) => ({}),
  asc: (_col: unknown) => ({}),
  desc: (_col: unknown) => ({}),
  sql: new Proxy((_s: TemplateStringsArray) => '', { get: (_t, p) => (_: unknown) => p }),
  relations: () => ({}),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  index: () => ({ on: () => ({}) }),
  unique: () => ({ on: () => ({}) }),
  inArray: (_l: unknown, _r: unknown) => ({}),
  ilike: (_col: unknown, _val: unknown) => ({}),
  or: (..._args: unknown[]) => ({}),
  pgTable: (_name: string, cols: unknown) => cols,
  uuid: () => ({ primaryKey: () => ({}) }),
  text: () => ({ notNull: () => ({ default: () => ({}) }) }),
  boolean: () => ({ notNull: () => ({ default: () => ({}) }) }),
  integer: () => ({ notNull: () => ({ default: () => ({}) }) }),
  jsonb: () => ({ notNull: () => ({ default: () => ({}) }) }),
  timestamp: () => ({ notNull: () => ({ defaultNow: () => ({}) }) }),
  foreignKey: () => ({ references: () => ({}) }),
}))

// ---------------------------------------------------------------------------
// Mock aliases service
// ---------------------------------------------------------------------------

const mockCreateAlias = mock(async (_params: unknown) => ({
  id: 'new-alias-uuid',
  identityUserId: 'user-uuid-123',
  alias: 'Jane Smith',
  aliasNormalized: 'jane smith',
  isPrimary: false,
  source: 'manual',
  createdAt: new Date(),
  createdBy: 'admin-user-uuid',
}))

mock.module('~/services/aliases', () => ({ createAlias: mockCreateAlias, resolveAliases: mock(async () => []), renamePrimaryAlias: mock(async () => {}), detectCollision: mock(async () => ({ collision: false })), enqueueCollision: mock(async () => {}) }))

// ---------------------------------------------------------------------------
// Mock audit service
// ---------------------------------------------------------------------------

const mockLogAudit = mock(async (_params: unknown) => {})
mock.module('~/services/audit', () => ({ logAudit: mockLogAudit }))

// ---------------------------------------------------------------------------
// Import route after all mocks
// ---------------------------------------------------------------------------

const { aliasQueueRoutes } = await import('../alias-queue')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return new Elysia().use(aliasQueueRoutes)
}

type TestApp = ReturnType<typeof makeApp>

async function getQueue(app: TestApp) {
  return app.handle(new Request('http://localhost/alias-queue'))
}

async function postResolve(app: TestApp, id: string, body: unknown) {
  return app.handle(
    new Request(`http://localhost/alias-queue/${id}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function postReject(app: TestApp, id: string, body: unknown) {
  return app.handle(
    new Request(`http://localhost/alias-queue/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /alias-queue', () => {
  beforeEach(() => {
    isAdmin = true
  })

  test('returns grouped pending items with counts', async () => {
    const app = makeApp()
    const res = await getQueue(app)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      groups: Array<{ rawNameNormalized: string; count: number; items: unknown[] }>
    }
    expect(body.groups).toBeDefined()
    expect(body.groups.length).toBeGreaterThan(0)
    const janeGroup = body.groups.find((g) => g.rawNameNormalized === 'jane smith')
    expect(janeGroup).toBeDefined()
    expect(janeGroup!.count).toBe(2)
    expect(janeGroup!.items.length).toBe(2)
  })

  test('non-admin gets 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await getQueue(app)
    expect(res.status).toBe(403)
  })
})

describe('POST /alias-queue/:id/resolve', () => {
  beforeEach(() => {
    isAdmin = true
    findFirstResult = queueRows[0]
    mockCreateAlias.mockReset()
    mockLogAudit.mockReset()
    mockCreateAlias.mockImplementation(async (_p: unknown) => ({
      id: 'new-alias-uuid',
      identityUserId: 'user-uuid-123',
      alias: 'Jane Smith',
      aliasNormalized: 'jane smith',
      isPrimary: false,
      source: 'manual',
      createdAt: new Date(),
      createdBy: 'admin-user-uuid',
    }))
    mockLogAudit.mockImplementation(async () => {})
  })

  test('creates alias, marks resolved, logs audit, returns aliasId', async () => {
    const app = makeApp()
    const res = await postResolve(app, 'queue-row-1', { identityUserId: 'user-uuid-123' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { aliasId: string }
    expect(body.aliasId).toBe('new-alias-uuid')
    expect(mockCreateAlias).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  test('returns 404 on unknown id', async () => {
    findFirstResult = undefined
    const app = makeApp()
    const res = await postResolve(app, 'nonexistent', { identityUserId: 'user-uuid-123' })
    expect(res.status).toBe(404)
  })

  test('returns 409 on already-resolved row', async () => {
    findFirstResult = { ...queueRows[0]!, status: 'resolved' }
    const app = makeApp()
    const res = await postResolve(app, 'queue-row-1', { identityUserId: 'user-uuid-123' })
    expect(res.status).toBe(409)
  })

  test('non-admin gets 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await postResolve(app, 'queue-row-1', { identityUserId: 'user-uuid-123' })
    expect(res.status).toBe(403)
  })
})

describe('POST /alias-queue/:id/reject', () => {
  beforeEach(() => {
    isAdmin = true
    findFirstResult = queueRows[0]
    mockLogAudit.mockReset()
    mockLogAudit.mockImplementation(async () => {})
  })

  test('marks row rejected and logs audit', async () => {
    const app = makeApp()
    const res = await postReject(app, 'queue-row-1', { reason: 'Duplicate entry' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  test('returns 404 on unknown id', async () => {
    findFirstResult = undefined
    const app = makeApp()
    const res = await postReject(app, 'nonexistent', { reason: 'test' })
    expect(res.status).toBe(404)
  })

  test('returns 409 on already-resolved row', async () => {
    findFirstResult = { ...queueRows[0]!, status: 'resolved' }
    const app = makeApp()
    const res = await postReject(app, 'queue-row-1', { reason: 'test' })
    expect(res.status).toBe(409)
  })

  test('non-admin gets 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await postReject(app, 'queue-row-1', { reason: 'test' })
    expect(res.status).toBe(403)
  })
})
