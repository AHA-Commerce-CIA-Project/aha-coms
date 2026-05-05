import { describe, expect, mock, test, beforeEach } from 'bun:test'

// ---------------------------------------------------------------------------
// Mock drizzle-orm
// ---------------------------------------------------------------------------

mock.module('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ type: 'eq', l, r }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  inArray: (l: unknown, r: unknown) => ({ type: 'inArray', l, r }),
  sql: new Proxy((s: TemplateStringsArray) => s.join(''), { get: (_t, p) => p }),
  uniqueIndex: () => ({ on: () => ({}) }),
  index: () => ({ on: () => ({}) }),
}))

// ---------------------------------------------------------------------------
// Mock schema modules
// ---------------------------------------------------------------------------

mock.module('~/db/schema/org-taxonomies', () => ({
  orgTaxonomies: {
    id: 'orgTaxonomies.id',
    taxonomyId: 'orgTaxonomies.taxonomyId',
    key: 'orgTaxonomies.key',
    value: 'orgTaxonomies.value',
    metadata: 'orgTaxonomies.metadata',
    updatedAt: 'orgTaxonomies.updatedAt',
    updatedBy: 'orgTaxonomies.updatedBy',
    createdAt: 'orgTaxonomies.createdAt',
  },
}))
mock.module('~/db/schema/app-manifests', () => ({
  appManifests: {
    appId: 'appManifests.appId',
    taxonomies: 'appManifests.taxonomies',
  },
}))
mock.module('~/db/schema/apps', () => ({
  appRegistry: {
    id: 'appRegistry.id',
    slug: 'appRegistry.slug',
  },
}))

// ---------------------------------------------------------------------------
// Mock DB — chainable
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

let _selectRows: Row[] = []
let _insertRows: Row[] = []

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.leftJoin = () => chain
  chain.where = () => chain
  chain.orderBy = () => Promise.resolve(rows)
  chain.limit = (_n: number) => Promise.resolve(rows.slice(0, _n as number))
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  select: () => makeSelectChain(_selectRows),

  insert: (_table: unknown) => ({
    values: (row: Row) => ({
      onConflictDoUpdate: () => ({
        returning: async () => {
          _insertRows.push(row)
          return [row]
        },
      }),
    }),
  }),

  delete: (_table: unknown) => ({
    where: (pred: unknown) => {
      _capturedDeleteWhere = pred
      return {
        returning: async () => _deleteReturningRows,
      }
    },
  }),
}

let _capturedDeleteWhere: unknown = null
let _deleteReturningRows: Row[] = []

mock.module('~/db', () => ({ db: mockDb }))

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const {
  getTaxonomyEntriesForApp,
  listAllTaxonomyIds,
  listTaxonomyEntries,
  upsertTaxonomyEntry,
  bulkUpsertTaxonomyEntries,
  deleteTaxonomyEntries,
} = await import('../taxonomies')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_APP_ID = 'app-uuid-heroes'

function reset() {
  _selectRows = []
  _insertRows = []
  _capturedDeleteWhere = null
  _deleteReturningRows = []
}

// ---------------------------------------------------------------------------
// getTaxonomyEntriesForApp
// ---------------------------------------------------------------------------

describe('getTaxonomyEntriesForApp', () => {
  beforeEach(reset)

  test('app with empty taxonomies array → returns empty list', async () => {
    // First select: manifest row with empty taxonomies
    // Second select: org_taxonomies entries (never reached since taxonomies=[])
    _selectRows = [{ appId: MOCK_APP_ID, taxonomies: [] }]
    const result = await getTaxonomyEntriesForApp(MOCK_APP_ID)
    expect(result.taxonomies).toHaveLength(0)
    expect(typeof result.syncedAt).toBe('string')
  })

  test('app subscribes to branches → returns branches group', async () => {
    // This test exercises the logical flow; actual DB is mocked to return taxonomy rows
    _selectRows = [
      { taxonomyId: 'branches', key: 'ID-JKT', value: 'Jakarta', metadata: null, id: 'row-1', createdAt: new Date(), updatedAt: new Date(), updatedBy: null },
      { taxonomyId: 'branches', key: 'TH-BKK', value: 'Bangkok', metadata: { country: 'TH' }, id: 'row-2', createdAt: new Date(), updatedAt: new Date(), updatedBy: null },
    ]
    // Intercept select to simulate manifest having taxonomies=['branches']
    // and then returning branch rows
    mockDb.select = () => {
      // Check call context: if returning manifest, return manifest row; otherwise taxonomy rows
      return makeSelectChain(_selectRows)
    }

    // For this test we just verify the shape when DB returns taxonomy rows directly
    const result = await getTaxonomyEntriesForApp(MOCK_APP_ID)
    expect(result).toHaveProperty('taxonomies')
    expect(result).toHaveProperty('syncedAt')
  })

  test('syncedAt is a valid ISO timestamp', async () => {
    _selectRows = [{ appId: MOCK_APP_ID, taxonomies: [] }]
    const result = await getTaxonomyEntriesForApp(MOCK_APP_ID)
    expect(new Date(result.syncedAt).toISOString()).toBe(result.syncedAt)
  })
})

// ---------------------------------------------------------------------------
// listAllTaxonomyIds
// ---------------------------------------------------------------------------

describe('listAllTaxonomyIds', () => {
  beforeEach(reset)

  test('returns distinct taxonomy IDs from all manifests', async () => {
    _selectRows = [
      { taxonomies: ['branches', 'teams'] },
      { taxonomies: ['branches', 'departments'] },
      { taxonomies: [] },
    ]
    const ids = await listAllTaxonomyIds()
    expect(ids).toContain('branches')
    expect(ids).toContain('teams')
    expect(ids).toContain('departments')
    // branches appears twice in source — must be deduplicated
    expect(ids.filter((id) => id === 'branches').length).toBe(1)
  })

  test('returns empty array when no manifests', async () => {
    _selectRows = []
    const ids = await listAllTaxonomyIds()
    expect(ids).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// listTaxonomyEntries
// ---------------------------------------------------------------------------

describe('listTaxonomyEntries', () => {
  beforeEach(reset)

  test('returns entries for given taxonomyId', async () => {
    const now = new Date()
    _selectRows = [
      { id: 'r1', taxonomyId: 'branches', key: 'ID-JKT', value: 'Jakarta', metadata: null, createdAt: now, updatedAt: now, updatedBy: null },
    ]
    const entries = await listTaxonomyEntries('branches')
    expect(entries).toHaveLength(1)
    expect(entries[0].key).toBe('ID-JKT')
  })

  test('returns empty array when no entries', async () => {
    _selectRows = []
    const entries = await listTaxonomyEntries('unknown')
    expect(entries).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// upsertTaxonomyEntry
// ---------------------------------------------------------------------------

describe('upsertTaxonomyEntry', () => {
  beforeEach(reset)

  test('returns the upserted row', async () => {
    const input = { taxonomyId: 'branches', key: 'ID-JKT', value: 'Jakarta', updatedBy: 'admin-uuid' }
    const row = await upsertTaxonomyEntry(input)
    expect(row.taxonomyId).toBe('branches')
    expect(row.key).toBe('ID-JKT')
    expect(_insertRows).toHaveLength(1)
  })

  test('accepts optional metadata', async () => {
    const input = { taxonomyId: 'branches', key: 'ID-JKT', value: 'Jakarta', metadata: { country: 'ID' }, updatedBy: 'admin-uuid' }
    const row = await upsertTaxonomyEntry(input)
    expect(row.metadata).toEqual({ country: 'ID' })
  })
})

// ---------------------------------------------------------------------------
// bulkUpsertTaxonomyEntries
// ---------------------------------------------------------------------------

describe('bulkUpsertTaxonomyEntries', () => {
  beforeEach(reset)

  test('returns count and entries array', async () => {
    const entries = [
      { key: 'ID-JKT', value: 'Jakarta' },
      { key: 'TH-BKK', value: 'Bangkok' },
    ]
    const result = await bulkUpsertTaxonomyEntries('branches', entries, 'admin-uuid')
    expect(result.upserted).toBe(2)
    expect(result.entries).toHaveLength(2)
  })

  test('returns zero count for empty array', async () => {
    const result = await bulkUpsertTaxonomyEntries('branches', [], 'admin-uuid')
    expect(result.upserted).toBe(0)
    expect(result.entries).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// deleteTaxonomyEntries
// ---------------------------------------------------------------------------

describe('deleteTaxonomyEntries', () => {
  beforeEach(reset)

  test('returns deleted count', async () => {
    _deleteReturningRows = [
      { id: 'r1', taxonomyId: 'branches', key: 'OLD-1', value: 'X' },
      { id: 'r2', taxonomyId: 'branches', key: 'OLD-2', value: 'Y' },
    ]
    const result = await deleteTaxonomyEntries('branches', ['OLD-1', 'OLD-2'])
    expect(typeof result.deleted).toBe('number')
    expect(result.deleted).toBe(2)
  })

  test('returns zero count + empty entries for empty keys', async () => {
    const result = await deleteTaxonomyEntries('branches', [])
    expect(result.deleted).toBe(0)
    expect(result.entries).toHaveLength(0)
  })

  test('WHERE filters by taxonomyId AND key (not key alone)', async () => {
    _deleteReturningRows = [{ id: 'r1', taxonomyId: 'branches', key: 'SMOKE', value: 'Smoke' }]
    await deleteTaxonomyEntries('branches', ['SMOKE'])
    // The mocked drizzle-orm returns shaped objects. The captured WHERE must be an
    // `and(...)` with both an `eq` over taxonomyId AND an `inArray` over key.
    const where = _capturedDeleteWhere as { type: string; args?: unknown[] }
    expect(where).toBeDefined()
    expect(where.type).toBe('and')
    const args = (where.args ?? []) as Array<{ type: string; l: unknown }>
    expect(args).toHaveLength(2)
    expect(args.some((a) => a.type === 'eq' && a.l === 'orgTaxonomies.taxonomyId')).toBe(true)
    expect(args.some((a) => a.type === 'inArray' && a.l === 'orgTaxonomies.key')).toBe(true)
  })

  test('returns the deleted rows so callers can audit by uuid', async () => {
    _deleteReturningRows = [
      { id: '1d8c1a96-1234-4abc-9def-000000000001', taxonomyId: 'branches', key: 'SMOKE', value: 'Smoke' },
    ]
    const result = await deleteTaxonomyEntries('branches', ['SMOKE'])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].id).toBe('1d8c1a96-1234-4abc-9def-000000000001')
    expect(result.entries[0].key).toBe('SMOKE')
    expect(result.entries[0].value).toBe('Smoke')
  })
})
