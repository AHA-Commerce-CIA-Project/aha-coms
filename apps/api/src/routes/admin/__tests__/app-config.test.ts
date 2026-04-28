import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireRole
// ---------------------------------------------------------------------------

let isAdmin = true

mock.module('~/middleware/rbac', () => ({
  requireRole: (..._roles: string[]) =>
    new Elysia({ name: 'mock-require-role-ac' }).derive({ as: 'scoped' }, async ({ status }) => {
      if (!isAdmin) throw status(403, { message: 'Insufficient portal role' })
      return {
        authUser: {
          id: 'admin-uuid',
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
// Fixture data
// ---------------------------------------------------------------------------

const HEROES_APP_ID = 'uuid-heroes-app'
const USER_1 = 'user-uuid-1'
const USER_2 = 'user-uuid-2'

const mockManifest = {
  appId: HEROES_APP_ID,
  displayName: 'Heroes',
  schemaVersion: 1,
  configSchema: {
    role: { type: 'enum', values: ['member', 'captain', 'admin'], default: 'member' },
    leaderboard_eligible: { type: 'boolean', default: true },
  },
}

const configRows = [
  { portalSub: USER_1, appId: HEROES_APP_ID, config: { role: 'member', leaderboard_eligible: true }, schemaVersion: 1, updatedAt: new Date('2026-04-28T00:00:00Z'), name: 'Alice', email: 'alice@test.com' },
  { portalSub: USER_2, appId: HEROES_APP_ID, config: { role: 'captain', leaderboard_eligible: false }, schemaVersion: 1, updatedAt: new Date('2026-04-28T01:00:00Z'), name: 'Bob', email: 'bob@test.com' },
]

// ---------------------------------------------------------------------------
// Mock db — chainable, last method in chain is awaitable
// ---------------------------------------------------------------------------

let lockInsertReturning: unknown[] = [{ appId: HEROES_APP_ID, acquiredBy: 'admin-uuid', acquiredAt: new Date() }]
let lockSelectReturning = [{ acquiredBy: 'other-admin-uuid' }]
let selectCallCount = 0

// We track which select call we're on to return the right data:
// - acquireLock's select (after failed insert) → lockSelectReturning
// - config list selects → configRows
// - single existing config select → singleConfigRow
let singleConfigRow = [{ config: { role: 'member', leaderboard_eligible: true }, schemaVersion: 1 }]

function makeSelectChain(resolveWith: unknown[]): unknown {
  const chain: Record<string, unknown> = {}
  const resolve = () => Promise.resolve(resolveWith)
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.where = () => chain
  chain.orderBy = resolve
  chain.limit = (_n: number) => resolve()
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resolve().then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  _selectMode: 'list' as 'list' | 'single' | 'lock',

  select: function() {
    selectCallCount++
    // Determine what to return based on context set by test
    const data = this._selectMode === 'single' ? singleConfigRow
      : this._selectMode === 'lock' ? lockSelectReturning
      : configRows
    return makeSelectChain(data)
  },

  update: () => ({
    set: () => ({ where: async () => undefined }),
  }),

  delete: () => ({
    where: async () => undefined,
  }),

  insert: () => ({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: async () => lockInsertReturning,
      }),
    }),
  }),

  transaction: async (fn: (tx: unknown) => unknown) => fn({
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }),
}

mock.module('~/db', () => ({ db: mockDb }))

// Mock individual schema modules + drizzle-orm so the barrel can safely re-export them
// without evaluating real drizzle-orm column helpers.
const schemaPlaceholder = (prefix: string, ...fields: string[]) =>
  Object.fromEntries(fields.map((f) => [f, `${prefix}.${f}`]))

mock.module('~/db/schema/app-user-config', () => ({
  appUserConfig: schemaPlaceholder('auc', 'portalSub', 'appId', 'config', 'schemaVersion', 'updatedAt'),
}))
mock.module('~/db/schema/identity-users', () => ({
  identityUsers: schemaPlaceholder('iu', 'id', 'name', 'email', 'status', 'portalSub', 'gipUid', 'createdAt', 'updatedAt'),
}))
mock.module('~/db/schema/bulk-edit-locks', () => ({
  bulkEditLocks: schemaPlaceholder('bel', 'appId', 'acquiredBy', 'acquiredAt'),
}))
mock.module('~/db/schema/alias-collision-queue', () => ({
  aliasCollisionQueue: schemaPlaceholder('acq', 'id', 'rawName', 'rawNameNormalized', 'suggestedIdentityUserId', 'source', 'context', 'status', 'createdAt', 'resolvedAt', 'resolvedBy', 'resolutionAction'),
}))
mock.module('drizzle-orm', () => ({
  eq: (_l: unknown, _r: unknown) => ({}),
  and: (..._args: unknown[]) => ({}),
  ilike: (_col: unknown, _val: unknown) => ({}),
  or: (..._args: unknown[]) => ({}),
  asc: (_col: unknown) => ({}),
  desc: (_col: unknown) => ({}),
  sql: new Proxy((_s: TemplateStringsArray) => '', { get: (_t, p) => (_: unknown) => p }),
  relations: () => ({}),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  index: () => ({ on: () => ({}) }),
  unique: () => ({ on: () => ({}) }),
  inArray: (_l: unknown, _r: unknown) => ({}),
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
// Mock manifests service
// ---------------------------------------------------------------------------

const mockLoadAllManifests = mock(async () => [mockManifest])

mock.module('~/services/manifests', () => ({
  loadAllManifests: mockLoadAllManifests,
  validateConfig: (manifest: typeof mockManifest, config: Record<string, unknown>) => {
    const errors: { key: string; reason: string }[] = []
    for (const [key, field] of Object.entries(manifest.configSchema)) {
      const value = config[key]
      if (value === undefined || value === null) {
        errors.push({ key, reason: 'missing required key' })
        continue
      }
      if (field.type === 'enum' && !(field as { values: string[] }).values.includes(value as string)) {
        errors.push({ key, reason: `must be one of: ${(field as { values: string[] }).values.join(', ')}` })
      }
      if (field.type === 'boolean' && typeof value !== 'boolean') {
        errors.push({ key, reason: 'must be a boolean' })
      }
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  },
}))

// ---------------------------------------------------------------------------
// Mock events + audit
// ---------------------------------------------------------------------------

const mockEmit = mock(async () => {})
const mockLogAudit = mock(async () => {})

mock.module('~/services/app-user-config-events', () => ({ emitAppConfigUpdated: mockEmit }))
mock.module('~/services/audit', () => ({ logAudit: mockLogAudit }))

// ---------------------------------------------------------------------------
// Import route
// ---------------------------------------------------------------------------

const { adminAppConfigRoutes } = await import('../app-config')

function makeApp() {
  return new Elysia().use(adminAppConfigRoutes)
}

type TestApp = ReturnType<typeof makeApp>

function reset() {
  isAdmin = true
  selectCallCount = 0
  lockInsertReturning = [{ appId: HEROES_APP_ID, acquiredBy: 'admin-uuid', acquiredAt: new Date() }]
  lockSelectReturning = [{ acquiredBy: 'other-admin-uuid' }]
  singleConfigRow = [{ config: { role: 'member', leaderboard_eligible: true }, schemaVersion: 1 }]
  mockDb._selectMode = 'list'
  mockEmit.mockReset()
  mockLogAudit.mockReset()
  mockEmit.mockImplementation(async () => {})
  mockLogAudit.mockImplementation(async () => {})
  mockLoadAllManifests.mockImplementation(async () => [mockManifest])
}

// ---------------------------------------------------------------------------
// Tests: GET /app-config
// ---------------------------------------------------------------------------

describe('GET /app-config', () => {
  beforeEach(reset)

  test('returns manifests list when no appId given', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config'))
    expect(res.status).toBe(200)
    const body = await res.json() as { manifests: unknown[]; rows: unknown[] }
    expect(body.manifests.length).toBe(1)
    expect(body.rows).toHaveLength(0)
  })

  test('returns config rows for given appId', async () => {
    const app = makeApp()
    const res = await app.handle(new Request(`http://localhost/app-config?appId=${HEROES_APP_ID}`))
    expect(res.status).toBe(200)
    const body = await res.json() as { rows: unknown[] }
    expect(body.rows.length).toBe(2)
  })

  test('non-admin gets 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config'))
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Tests: POST /app-config/single
// ---------------------------------------------------------------------------

describe('POST /app-config/single', () => {
  beforeEach(() => {
    reset()
    mockDb._selectMode = 'single'
  })

  test('updates config, emits event, logs audit', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/single', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, portalSub: USER_1, config: { role: 'captain', leaderboard_eligible: true } }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  test('returns 422 on invalid config', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/single', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, portalSub: USER_1, config: { role: 'god', leaderboard_eligible: true } }),
    }))
    expect(res.status).toBe(422)
  })

  test('returns 404 when no existing config row', async () => {
    singleConfigRow = []
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/single', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, portalSub: 'nonexistent', config: { role: 'member', leaderboard_eligible: true } }),
    }))
    expect(res.status).toBe(404)
  })

  test('non-admin gets 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/single', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, portalSub: USER_1, config: { role: 'member', leaderboard_eligible: true } }),
    }))
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Tests: POST /app-config/bulk-preview
// ---------------------------------------------------------------------------

describe('POST /app-config/bulk-preview', () => {
  beforeEach(reset)

  test('returns diff preview without writing', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/bulk-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: HEROES_APP_ID,
        rows: [
          { portalSub: USER_1, config: { role: 'captain', leaderboard_eligible: true } },
          { portalSub: USER_2, config: { role: 'admin', leaderboard_eligible: false } },
        ],
      }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { changes: unknown[]; totalRows: number }
    expect(body.changes.length).toBe(2)
    expect(body.totalRows).toBe(2)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  test('returns 422 when unknown portalSub in batch', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/bulk-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: HEROES_APP_ID,
        rows: [{ portalSub: 'ghost-user', config: { role: 'member', leaderboard_eligible: true } }],
      }),
    }))
    expect(res.status).toBe(422)
  })

  test('rejects entire batch on any validation error (partial application forbidden)', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/bulk-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: HEROES_APP_ID,
        rows: [
          { portalSub: USER_1, config: { role: 'captain', leaderboard_eligible: true } },
          { portalSub: USER_2, config: { role: 'invalid_role', leaderboard_eligible: false } },
        ],
      }),
    }))
    expect(res.status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// Tests: POST /app-config/bulk-commit
// ---------------------------------------------------------------------------

describe('POST /app-config/bulk-commit', () => {
  beforeEach(reset)

  test('commits all rows, returns batchId and updatedCount', async () => {
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/bulk-commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: HEROES_APP_ID,
        rows: [
          { portalSub: USER_1, config: { role: 'captain', leaderboard_eligible: true } },
          { portalSub: USER_2, config: { role: 'admin', leaderboard_eligible: false } },
        ],
      }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; batchId: string; updatedCount: number }
    expect(body.ok).toBe(true)
    expect(body.updatedCount).toBe(2)
    expect(typeof body.batchId).toBe('string')
    expect(mockLogAudit).toHaveBeenCalledTimes(2)
  })

  test('returns 409 when lock already held by another admin', async () => {
    lockInsertReturning = []
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/bulk-commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: HEROES_APP_ID,
        rows: [{ portalSub: USER_1, config: { role: 'captain', leaderboard_eligible: true } }],
      }),
    }))
    expect(res.status).toBe(409)
  })

  test('preview and commit produce same change count (equivalence)', async () => {
    const rows = [
      { portalSub: USER_1, config: { role: 'captain', leaderboard_eligible: true } },
      { portalSub: USER_2, config: { role: 'admin', leaderboard_eligible: false } },
    ]
    const app = makeApp()

    const previewRes = await app.handle(new Request('http://localhost/app-config/bulk-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, rows }),
    }))
    expect(previewRes.status).toBe(200)
    const preview = await previewRes.json() as { changes: unknown[]; totalRows: number }

    // Re-create app to reset module state
    const app2 = makeApp()
    const commitRes = await app2.handle(new Request('http://localhost/app-config/bulk-commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, rows }),
    }))
    expect(commitRes.status).toBe(200)
    const commit = await commitRes.json() as { updatedCount: number }

    expect(preview.changes.length).toBe(commit.updatedCount)
  })

  test('non-admin gets 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await app.handle(new Request('http://localhost/app-config/bulk-commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: HEROES_APP_ID, rows: [] }),
    }))
    expect(res.status).toBe(403)
  })
})
