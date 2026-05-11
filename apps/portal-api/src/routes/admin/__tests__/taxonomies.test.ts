import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { fullDrizzleOrmMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock requireRole
// ---------------------------------------------------------------------------

let isAdmin = true

mock.module('~/middleware/rbac', () => ({
  requireRole: (..._roles: string[]) =>
    new Elysia({ name: 'mock-require-role-tx' }).derive({ as: 'scoped' }, async ({ status }) => {
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
// Fixtures
// ---------------------------------------------------------------------------

const TAXONOMY_ID = 'branches'
const ENTRY_1 = { id: 'row-1', taxonomyId: 'branches', key: 'ID-JKT', value: 'Jakarta', metadata: null, createdAt: new Date(), updatedAt: new Date(), updatedBy: null }
const ENTRY_2 = { id: 'row-2', taxonomyId: 'branches', key: 'TH-BKK', value: 'Bangkok', metadata: null, createdAt: new Date(), updatedAt: new Date(), updatedBy: null }

// ---------------------------------------------------------------------------
// Mock taxonomy service
// ---------------------------------------------------------------------------

type OrgTaxonomyRow = typeof ENTRY_1

let listEntriesResult: OrgTaxonomyRow[] = [ENTRY_1, ENTRY_2]
let listAllIdsResult: string[] = [TAXONOMY_ID, 'teams']
let upsertResult: OrgTaxonomyRow = ENTRY_1
let bulkUpsertResult = { upserted: 2, entries: [ENTRY_1, ENTRY_2] }
let deleteResult: { deleted: number; entries: Array<{ id: string; key: string; value: string }> } = {
  deleted: 1,
  entries: [{ id: 'row-1', key: 'ID-JKT', value: 'Jakarta' }],
}
let upsertShouldThrow = false

const mockListAllTaxonomyIds = mock(async () => listAllIdsResult)
const mockListTaxonomyEntries = mock(async () => listEntriesResult)
const mockUpsertTaxonomyEntry = mock(async () => {
  if (upsertShouldThrow) throw Object.assign(new Error('unique constraint violation'), { code: '23505' })
  return upsertResult
})
const mockBulkUpsert = mock(async () => bulkUpsertResult)
const mockDeleteEntries = mock(async () => deleteResult)

mock.module('~/services/taxonomies', () => ({
  listAllTaxonomyIds: mockListAllTaxonomyIds,
  listTaxonomyEntries: mockListTaxonomyEntries,
  upsertTaxonomyEntry: mockUpsertTaxonomyEntry,
  bulkUpsertTaxonomyEntries: mockBulkUpsert,
  deleteTaxonomyEntries: mockDeleteEntries,
  getTaxonomyEntriesForApp: mock(async () => ({ taxonomies: [], syncedAt: new Date().toISOString() })),
}))

// ---------------------------------------------------------------------------
// Mock DB for lock operations
// ---------------------------------------------------------------------------

let lockInsertReturning: unknown[] = [{ taxonomyId: TAXONOMY_ID, acquiredBy: 'admin-uuid', acquiredAt: new Date() }]
let lockSelectReturning = [{ acquiredBy: 'other-admin-uuid' }]

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = (_n: number) => Promise.resolve(rows.slice(0, _n as number))
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

let lockMode: 'free' | 'held' = 'free'

const mockDb = {
  select: function() {
    const rows = lockMode === 'held' ? lockSelectReturning : lockInsertReturning
    return makeSelectChain(rows)
  },
  insert: () => ({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: async () => lockMode === 'free' ? lockInsertReturning : [],
      }),
    }),
  }),
  delete: () => ({
    where: async () => undefined,
  }),
}

mock.module('~/db', () => ({ db: mockDb }))

// Mock schema modules so barrel loads cleanly
const schemaPlaceholder = (prefix: string, ...fields: string[]) =>
  Object.fromEntries(fields.map((f) => [f, `${prefix}.${f}`]))

mock.module('~/db/schema/taxonomy-edit-locks', () => ({
  taxonomyEditLocks: schemaPlaceholder('tel', 'taxonomyId', 'acquiredBy', 'acquiredAt'),
}))
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// ---------------------------------------------------------------------------
// Mock audit + events
// ---------------------------------------------------------------------------

const mockLogAudit = mock(async () => {})
const mockEmitUpserted = mock(async () => {})
const mockEmitDeleted = mock(async () => {})

mock.module('~/services/audit', () => ({ logAudit: mockLogAudit }))
mock.module('~/services/taxonomy-events', () => ({
  emitTaxonomyUpserted: mockEmitUpserted,
  emitTaxonomyDeleted: mockEmitDeleted,
  emitEmploymentUpdated: mock(async () => {}),
}))

// ---------------------------------------------------------------------------
// Import route
// ---------------------------------------------------------------------------

const { adminTaxonomiesRoutes } = await import('../taxonomies')

function makeApp() {
  return new Elysia().use(adminTaxonomiesRoutes)
}
type TestApp = ReturnType<typeof makeApp>

async function request(app: TestApp, method: string, path: string, body?: unknown) {
  return app.handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }))
}

function reset() {
  isAdmin = true
  lockMode = 'free'
  lockInsertReturning = [{ taxonomyId: TAXONOMY_ID, acquiredBy: 'admin-uuid', acquiredAt: new Date() }]
  lockSelectReturning = [{ acquiredBy: 'other-admin-uuid' }]
  listEntriesResult = [ENTRY_1, ENTRY_2]
  listAllIdsResult = [TAXONOMY_ID, 'teams']
  upsertResult = ENTRY_1
  upsertShouldThrow = false
  mockLogAudit.mockReset()
  mockLogAudit.mockImplementation(async () => {})
  mockUpsertTaxonomyEntry.mockReset()
  mockUpsertTaxonomyEntry.mockImplementation(async () => {
    if (upsertShouldThrow) throw Object.assign(new Error('unique constraint violation'), { code: '23505' })
    return upsertResult
  })
  mockEmitUpserted.mockReset()
  mockEmitUpserted.mockImplementation(async () => {})
  mockEmitDeleted.mockReset()
  mockEmitDeleted.mockImplementation(async () => {})
}

// ---------------------------------------------------------------------------
// Tests: GET /admin/taxonomies
// ---------------------------------------------------------------------------

describe('GET /admin/taxonomies', () => {
  beforeEach(reset)

  test('list → 200 with taxonomyIds and counts', async () => {
    const app = makeApp()
    const res = await request(app, 'GET', '/taxonomies')
    expect(res.status).toBe(200)
    const body = await res.json() as { taxonomies: Array<{ taxonomyId: string; entryCount: number }> }
    expect(body.taxonomies).toBeDefined()
    expect(Array.isArray(body.taxonomies)).toBe(true)
  })

  test('non-admin → 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await request(app, 'GET', '/taxonomies')
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Tests: GET /admin/taxonomies/:taxonomyId
// ---------------------------------------------------------------------------

describe('GET /admin/taxonomies/:taxonomyId', () => {
  beforeEach(reset)

  test('returns entries for given taxonomyId', async () => {
    const app = makeApp()
    const res = await request(app, 'GET', `/taxonomies/${TAXONOMY_ID}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: unknown[] }
    expect(body.entries).toHaveLength(2)
  })

  test('non-admin → 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await request(app, 'GET', `/taxonomies/${TAXONOMY_ID}`)
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Tests: POST /admin/taxonomies/:taxonomyId/single
// ---------------------------------------------------------------------------

describe('POST /admin/taxonomies/:taxonomyId/single', () => {
  beforeEach(reset)

  test('single upsert → 200 + audit logged', async () => {
    const app = makeApp()
    const res = await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/single`, {
      key: 'ID-JKT',
      value: 'Jakarta',
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; entry: unknown }
    expect(body.ok).toBe(true)
    expect(body.entry).toBeDefined()
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  test('non-admin → 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/single`, {
      key: 'ID-JKT',
      value: 'Jakarta',
    })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Tests: POST /admin/taxonomies/:taxonomyId/bulk
// ---------------------------------------------------------------------------

describe('POST /admin/taxonomies/:taxonomyId/bulk', () => {
  beforeEach(reset)

  test('bulk upsert → 200 with batchId and upserted count', async () => {
    const app = makeApp()
    const res = await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/bulk`, {
      entries: [
        { key: 'ID-JKT', value: 'Jakarta' },
        { key: 'TH-BKK', value: 'Bangkok' },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; upserted: number; batchId: string }
    expect(body.ok).toBe(true)
    expect(body.upserted).toBe(2)
    expect(typeof body.batchId).toBe('string')
    expect(mockLogAudit).toHaveBeenCalledTimes(2) // one per entry
  })

  // Spec 07 §Race window — bulk path emits exactly ONE taxonomy.upserted event
  // per (taxonomyId, batchId), regardless of entry count. Critical because
  // Heroes-side ordering depends on this: a single batched envelope is what
  // arrives BEFORE the affected employment.updated events.
  test('bulk upsert emits single taxonomy.upserted event for the whole batch (Race window)', async () => {
    const app = makeApp()
    await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/bulk`, {
      entries: [
        { key: 'ID-JKT', value: 'Jakarta' },
        { key: 'TH-BKK', value: 'Bangkok' },
        { key: 'VN-HAN', value: 'Hanoi' },
      ],
    })
    expect(mockEmitUpserted).toHaveBeenCalledTimes(1)
    const calls = mockEmitUpserted.mock.calls as unknown as Array<
      [{ taxonomyId: string; entries: Array<{ key: string; value: string }> }]
    >
    const params = calls[0][0]
    expect(params.taxonomyId).toBe(TAXONOMY_ID)
    expect(params.entries).toHaveLength(2) // bulkUpsertTaxonomyEntries mock returns ENTRY_1 and ENTRY_2
  })

  test('single upsert emits exactly one taxonomy.upserted event', async () => {
    const app = makeApp()
    await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/single`, {
      key: 'ID-JKT',
      value: 'Jakarta',
    })
    expect(mockEmitUpserted).toHaveBeenCalledTimes(1)
    const calls = mockEmitUpserted.mock.calls as unknown as Array<
      [{ taxonomyId: string; entries: unknown[] }]
    >
    const params = calls[0][0]
    expect(params.taxonomyId).toBe(TAXONOMY_ID)
    expect(params.entries).toHaveLength(1)
  })

  test('lock contention → 409', async () => {
    lockMode = 'held'
    const app = makeApp()
    const res = await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/bulk`, {
      entries: [{ key: 'ID-JKT', value: 'Jakarta' }],
    })
    expect(res.status).toBe(409)
  })

  test('non-admin → 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await request(app, 'POST', `/taxonomies/${TAXONOMY_ID}/bulk`, { entries: [] })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Tests: DELETE /admin/taxonomies/:taxonomyId/:key
// ---------------------------------------------------------------------------

describe('DELETE /admin/taxonomies/:taxonomyId/:key', () => {
  beforeEach(reset)

  test('delete entry → 200 + audit', async () => {
    const app = makeApp()
    const res = await request(app, 'DELETE', `/taxonomies/${TAXONOMY_ID}/ID-JKT`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  // Regression for staging 500 (2026-05-05): the delete route was logging audit
  // with `targetId: '${taxonomyId}/${key}'` (e.g. "branches/SMOKE"), but
  // access_audit_log.target_id is `uuid NOT NULL`, causing a Postgres
  // "invalid input syntax for type uuid" error and bubbling up as 500.
  // Audit must use the deleted row's actual uuid (returned by the service).
  test('audit targetId is the deleted row uuid (not "<taxonomyId>/<key>")', async () => {
    deleteResult = {
      deleted: 1,
      entries: [{ id: '1d8c1a96-1234-4abc-9def-000000000001', key: 'SMOKE', value: 'Smoke Test Branch' }],
    }
    const app = makeApp()
    const res = await request(app, 'DELETE', `/taxonomies/${TAXONOMY_ID}/SMOKE`)
    expect(res.status).toBe(200)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    const call = mockLogAudit.mock.calls[0] as unknown as Array<{ targetId: string; details: Record<string, unknown> }>
    const args = call[0]
    expect(args.targetId).toBe('1d8c1a96-1234-4abc-9def-000000000001')
    // Sanity: human-readable info goes to details JSON, not targetId
    expect(args.details).toMatchObject({ taxonomyId: TAXONOMY_ID, key: 'SMOKE' })
  })

  test('delete with no matching row → 404 (not 500)', async () => {
    deleteResult = { deleted: 0, entries: [] }
    const app = makeApp()
    const res = await request(app, 'DELETE', `/taxonomies/${TAXONOMY_ID}/MISSING`)
    expect(res.status).toBe(404)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  test('non-admin → 403', async () => {
    isAdmin = false
    const app = makeApp()
    const res = await request(app, 'DELETE', `/taxonomies/${TAXONOMY_ID}/ID-JKT`)
    expect(res.status).toBe(403)
  })
})
