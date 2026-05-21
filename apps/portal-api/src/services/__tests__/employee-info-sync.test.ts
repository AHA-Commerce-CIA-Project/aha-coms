import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock drizzle-orm
// ---------------------------------------------------------------------------

mock.module('drizzle-orm', () => fullDrizzleOrmMock())

// ---------------------------------------------------------------------------
// Mock schema
// ---------------------------------------------------------------------------

mock.module('~/db/schema', () => fullSchemaBarrelMock())

// ---------------------------------------------------------------------------
// Tracking: how many times getDisplayEmailsForUsers is called
// ---------------------------------------------------------------------------

let displayEmailCallCount = 0
let displayEmailCalledWithIds: string[][] = []

const mockEmailMap = new Map<string, string | null>([
  ['user-matched-1', 'matched1@example.com'],
  ['user-matched-2', 'matched2@example.com'],
])

mock.module('../email-resolution', () => ({
  getDisplayEmailsForUsers: mock(async (ids: string[]) => {
    displayEmailCallCount++
    displayEmailCalledWithIds.push([...ids])
    return mockEmailMap
  }),
}))

// ---------------------------------------------------------------------------
// Mock sheets client
// ---------------------------------------------------------------------------

let mockSheetRows: Array<Record<string, string>> = []

mock.module('../sheets-client', () => ({
  readEmployeeInfoSheet: mock(async () => mockSheetRows),
}))

// ---------------------------------------------------------------------------
// Mock name-matching — returns controllable matches
// ---------------------------------------------------------------------------

let mockMatchResults: Array<{ match: { id: string; name: string } | null; score: number; ambiguous: boolean }> = []
let matchCallIndex = 0

mock.module('../name-matching', () => ({
  findBestMatch: mock((_name: string, _candidates: unknown[]) => {
    const result = mockMatchResults[matchCallIndex] ?? { match: null, score: 0, ambiguous: false }
    matchCallIndex++
    return result
  }),
}))

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

let selectCallCount = 0
let updateCallCount = 0
// Capture the last WHERE predicate argument so T2.4 tests can inspect it
let lastWhereArg: unknown = undefined

type SelectChain = Record<string, unknown>

function makeSelectChain(rows: unknown[]): SelectChain {
  const chain: SelectChain = {}
  chain.from = () => chain
  chain.where = (predicate: unknown) => {
    lastWhereArg = predicate
    return chain
  }
  chain.orderBy = () => Promise.resolve(rows)
  chain.limit = (_n: number) => Promise.resolve(rows.slice(0, _n as number))
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  select: () => {
    selectCallCount++
    return makeSelectChain([])
  },
  update: (_table: unknown) => ({
    set: () => ({
      where: () => {
        updateCallCount++
        return Promise.resolve()
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (_rows: unknown) => ({
      onConflictDoNothing: () => Promise.resolve(),
      returning: () => Promise.resolve([{ id: 'new-team-1' }]),
    }),
  }),
}

mock.module('~/db', () => ({ db: mockDb }))

// ---------------------------------------------------------------------------
// Mock other deps
// ---------------------------------------------------------------------------

mock.module('../provisioning-events', () => ({
  emitUserProvisioned: mock(async () => {}),
}))
mock.module('../employees', () => ({
  createEmployee: mock(async () => ({ id: 'new-user-id' })),
}))
mock.module('~/logger', () => ({
  logger: { error: () => {} },
}))

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { syncEmployeeInfo } = await import('../employee-info-sync')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reset() {
  displayEmailCallCount = 0
  displayEmailCalledWithIds = []
  selectCallCount = 0
  updateCallCount = 0
  matchCallIndex = 0
  mockSheetRows = []
  mockMatchResults = []
  lastWhereArg = undefined
}

// ---------------------------------------------------------------------------
// T1.6 — getDisplayEmailsForUsers called exactly ONCE regardless of matched rows
// ---------------------------------------------------------------------------

describe('syncEmployeeInfo — T1.6 batch email resolution', () => {
  beforeEach(reset)

  test('no sheet rows → getDisplayEmailsForUsers called zero times', async () => {
    mockSheetRows = []
    const result = await syncEmployeeInfo()
    // No rows → we push the 'no rows' error and return early before email lookup
    expect(displayEmailCallCount).toBe(0)
    expect(result.errors).toHaveLength(1)
  })

  test('two matched rows → getDisplayEmailsForUsers called exactly once (T1.6: one batch, not two)', async () => {
    mockSheetRows = [
      { fullName: 'Alice', personalEmail: 'alice@example.com', teamName: '' },
      { fullName: 'Bob', personalEmail: 'bob@example.com', teamName: '' },
    ]
    mockMatchResults = [
      { match: { id: 'user-matched-1', name: 'Alice Smith' }, score: 0.9, ambiguous: false },
      { match: { id: 'user-matched-2', name: 'Bob Jones' }, score: 0.8, ambiguous: false },
    ]
    // selectCallCount: 1 (employees fetch) + any per-row fetches from upsertPersonalEmailFromSheet
    await syncEmployeeInfo()
    // Key assertion: exactly one call to the batch email resolver
    expect(displayEmailCallCount).toBe(1)
  })

  test('three matched rows → still exactly one getDisplayEmailsForUsers call', async () => {
    mockSheetRows = [
      { fullName: 'Alice', personalEmail: '', teamName: '' },
      { fullName: 'Bob', personalEmail: '', teamName: '' },
      { fullName: 'Carol', personalEmail: '', teamName: '' },
    ]
    mockMatchResults = [
      { match: { id: 'user-1', name: 'Alice' }, score: 1.0, ambiguous: false },
      { match: { id: 'user-2', name: 'Bob' }, score: 1.0, ambiguous: false },
      { match: { id: 'user-3', name: 'Carol' }, score: 1.0, ambiguous: false },
    ]
    await syncEmployeeInfo()
    expect(displayEmailCallCount).toBe(1)
    // All three matched IDs must appear in the one batch call
    expect(displayEmailCalledWithIds[0]).toContain('user-1')
    expect(displayEmailCalledWithIds[0]).toContain('user-2')
    expect(displayEmailCalledWithIds[0]).toContain('user-3')
  })

  test('unmatched rows do not inflate the email lookup call count', async () => {
    mockSheetRows = [
      { fullName: 'Alice', personalEmail: 'alice@example.com', teamName: '' },
      { fullName: 'Unknown', personalEmail: '', teamName: '' },
    ]
    mockMatchResults = [
      { match: { id: 'user-matched-1', name: 'Alice Smith' }, score: 0.9, ambiguous: false },
      { match: null, score: 0, ambiguous: false },
    ]
    await syncEmployeeInfo()
    expect(displayEmailCallCount).toBe(1)
    // Only matched IDs appear in the batch call
    expect(displayEmailCalledWithIds[0]).toContain('user-matched-1')
    expect(displayEmailCalledWithIds[0]).not.toContain(undefined)
  })

  test('email map value surfaces in result.matched entries', async () => {
    mockSheetRows = [
      { fullName: 'Alice', personalEmail: '', teamName: '' },
    ]
    mockMatchResults = [
      { match: { id: 'user-matched-1', name: 'Alice Smith' }, score: 1.0, ambiguous: false },
    ]
    const result = await syncEmployeeInfo()
    // The mocked emailMap has 'user-matched-1' → 'matched1@example.com'
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].email).toBe('matched1@example.com')
  })
})

// ---------------------------------------------------------------------------
// T2.4 — upsertTeamMembership uses eq(sql`lower(...)`, teamName.toLowerCase())
//         so the WHERE predicate is sargable against idx_teams_name_lower
// ---------------------------------------------------------------------------

describe('upsertTeamMembership — T2.4 sargable lower() predicate', () => {
  beforeEach(reset)

  test('mixed-case teamName is lowercased on the JS side before the WHERE predicate', async () => {
    // Give the row a non-lower teamName to verify the JS-side toLowerCase() fires
    mockSheetRows = [
      { fullName: 'Alice', personalEmail: '', teamName: 'AHA Commerce' },
    ]
    mockMatchResults = [
      { match: { id: 'user-matched-1', name: 'Alice Smith' }, score: 1.0, ambiguous: false },
    ]
    await syncEmployeeInfo()

    // lastWhereArg is the value passed to db.select().from().where(...)
    // The fullDrizzleOrmMock renders: eq(left, right) → { type: 'eq', left, right }
    // sql`lower(${teams.name})` → the mock sql proxy returns a string (template join)
    // right should be 'aha commerce' (JS toLowerCase applied to 'AHA Commerce')
    const where = lastWhereArg as { type: string; left: unknown; right: unknown } | undefined
    expect(where).toBeDefined()
    expect(where?.type).toBe('eq')
    // The right-hand side must be the lowercased JS string — confirms T2.4 rewrite is active
    expect(where?.right).toBe('aha commerce')
  })

  test('already-lower teamName is unchanged in the predicate', async () => {
    mockSheetRows = [
      { fullName: 'Bob', personalEmail: '', teamName: 'engineering' },
    ]
    mockMatchResults = [
      { match: { id: 'user-matched-2', name: 'Bob Jones' }, score: 0.9, ambiguous: false },
    ]
    await syncEmployeeInfo()

    const where = lastWhereArg as { type: string; right: unknown } | undefined
    expect(where?.type).toBe('eq')
    expect(where?.right).toBe('engineering')
  })
})
