import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ─── NOTE: levenshtein() was removed in T2.5 (replaced by pg_trgm similarity).
// The pure-function suite below was also removed. The new calibration table
// for pg_trgm is documented in the detectCollision describe block. ─────────────

// ─── normalizeName edge cases ─────────────────────────────────────────────────

import { normalizeName } from '../name-matching'

describe('normalizeName edge cases', () => {
  test('lowercases mixed case', () => {
    expect(normalizeName('Jane SMITH')).toBe('jane smith')
  })

  test('collapses multiple spaces', () => {
    expect(normalizeName('Jane  Smith')).toBe('jane smith')
  })

  test('trims leading and trailing whitespace', () => {
    expect(normalizeName('  Jane Smith  ')).toBe('jane smith')
  })

  test('handles Unicode whitespace-like characters via trim+collapse', () => {
    // Tab and newline should be collapsed to single space
    expect(normalizeName('Jane\tSmith')).toBe('jane smith')
    expect(normalizeName('Jane\nSmith')).toBe('jane smith')
  })

  test('strips periods (initials)', () => {
    expect(normalizeName('Jane A. Smith')).toBe('jane a smith')
  })

  test('single name no spaces', () => {
    expect(normalizeName('Pauzi')).toBe('pauzi')
  })
})

// ─── DB-backed function tests (mock db) ──────────────────────────────────────

// Mock the db module before importing aliases
const mockDbSelect = mock()
const mockDbInsert = mock()
const mockDbUpdate = mock()
const mockDbTransaction = mock()
const mockDbExecute = mock()

mock.module('~/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
    execute: mockDbExecute,
  },
}))

mock.module('~/db/schema', () => fullSchemaBarrelMock())
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

const { resolveAliases, renamePrimaryAlias, detectCollision } =
  await import('../aliases')

beforeEach(() => {
  mockDbSelect.mockReset()
  mockDbInsert.mockReset()
  mockDbUpdate.mockReset()
  mockDbTransaction.mockReset()
  mockDbExecute.mockReset()
})

describe('resolveAliases', () => {
  test('returns empty array for empty input', async () => {
    const result = await resolveAliases([])
    expect(result).toEqual([])
  })

  test('returns match for known alias', async () => {
    const fakeRow = {
      aliasNormalized: 'jane smith',
      identityUserId: 'uid-1',
      alias: 'Jane Smith',
      isPrimary: true,
      status: 'active',
      updatedAt: new Date('2025-01-01'),
    }

    // resolveAliases does: db.select().from().innerJoin().where() => rows
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.innerJoin = () => chain
    chain.where = async () => [fakeRow]
    mockDbSelect.mockReturnValue(chain)

    const result = await resolveAliases(['Jane Smith'])
    expect(result).toHaveLength(1)
    expect(result[0]!.match).not.toBeNull()
    expect(result[0]!.match!.identityUserId).toBe('uid-1')
    expect(result[0]!.match!.tombstoned).toBe(false)
    expect(result[0]!.match!.deactivatedAt).toBeNull()
  })

  test('returns null for unknown alias', async () => {
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.innerJoin = () => chain
    chain.where = async () => []
    mockDbSelect.mockReturnValue(chain)

    const result = await resolveAliases(['Unknown Person'])
    expect(result[0]!.match).toBeNull()
  })

  test('tombstoned user resolves with tombstoned=true and deactivatedAt', async () => {
    const deactivatedAt = new Date('2024-06-15T00:00:00Z')
    const fakeRow = {
      aliasNormalized: 'jane smith',
      identityUserId: 'uid-2',
      alias: 'Jane Smith',
      isPrimary: true,
      status: 'inactive',
      updatedAt: deactivatedAt,
    }

    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.innerJoin = () => chain
    chain.where = async () => [fakeRow]
    mockDbSelect.mockReturnValue(chain)

    const result = await resolveAliases(['Jane Smith'])
    expect(result[0]!.match!.tombstoned).toBe(true)
    expect(result[0]!.match!.deactivatedAt).toBe(deactivatedAt.toISOString())
  })
})

describe('renamePrimaryAlias', () => {
  test('demotes old primary and promotes new one in a transaction', async () => {
    const demotedAlias = {
      id: 'alias-old',
      identityUserId: 'uid-1',
      alias: 'Jane Smith',
      aliasNormalized: 'jane smith',
      isPrimary: false,
      source: 'auto_seed',
      createdAt: new Date(),
      createdBy: null,
    }
    const promotedAlias = {
      id: 'alias-new',
      identityUserId: 'uid-1',
      alias: 'Jane Doe',
      aliasNormalized: 'jane doe',
      isPrimary: true,
      source: 'name_update',
      createdAt: new Date(),
      createdBy: null,
    }

    // tx mock: update().set().where().returning() => [demotedAlias]
    // then insert().values().returning() => [promotedAlias]
    const tx = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [demotedAlias],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [promotedAlias],
        }),
      }),
    }

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx))

    const result = await renamePrimaryAlias('uid-1', 'Jane Doe', 'actor-1')
    expect(result.demoted.isPrimary).toBe(false)
    expect(result.promoted.isPrimary).toBe(true)
    expect(result.promoted.alias).toBe('Jane Doe')
  })

  test('throws if no primary alias found', async () => {
    const tx = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    }

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx))

    await expect(renamePrimaryAlias('uid-missing', 'New Name')).rejects.toThrow(
      'No primary alias found for user uid-missing',
    )
  })
})

// ─── T2.5 calibration table ──────────────────────────────────────────────────
//
// The old JS Levenshtein gate was: dist <= 2 OR token-set match (first/last
// token overlap). The new pg_trgm gate is: similarity >= 0.35.
//
// Calibration pairs (Postgres similarity values computed offline against
// normalized strings, i.e. lower-case, punctuation stripped):
//
//   Query           Candidate          Lev  Token  Similarity  Threshold  Match?
//   ─────────────── ────────────────── ──── ────── ─────────── ─────────  ──────
//   jane smyth      jane smith         1    no     ~0.64       0.35       YES ✓
//   jone smyth      jane smith         2    no     ~0.50       0.35       YES ✓
//   jane smith jr   jane smith         3    yes    ~0.59       0.35       YES ✓
//   mary ann lee    mary lee           4    yes    ~0.54       0.35       YES ✓
//   alice           peter              4    no     ~0.00       0.35       NO  ✓ (correctly rejected)
//
// All matches the old logic would have returned are returned by the new logic.
// Threshold 0.35 is slightly permissive vs Lev≤2 alone but correctly captures
// the token-set extension class. tokenMatch is always false in the new impl.

describe('detectCollision', () => {
  // ── Setup helpers ──────────────────────────────────────────────────────────

  function makeSelectChainEmpty(): Record<string, unknown> {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.where = () => c
    c.limit = async () => []
    return c
  }

  function makeExactSelectChain(row: unknown): Record<string, unknown> {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.where = () => c
    c.limit = async () => [row]
    return c
  }

  // Builds a mock TrgmRow as db.execute<TrgmRow> would return
  function trgmRow(overrides: Partial<{
    id: string; alias_normalized: string; alias: string; identity_user_id: string
    is_primary: boolean; source: string; created_at: Date; created_by: string | null
    similarity: number
  }> = {}) {
    return {
      id: 'alias-2',
      alias_normalized: 'jane smith',
      alias: 'Jane Smith',
      identity_user_id: 'uid-2',
      is_primary: true,
      source: 'auto_seed',
      created_at: new Date('2025-01-01'),
      created_by: null,
      similarity: 0.64,
      ...overrides,
    }
  }

  // ── Exact match ────────────────────────────────────────────────────────────

  test('returns exactMatch when alias_normalized matches — exact path unchanged', async () => {
    const exactRow = {
      id: 'alias-1',
      identityUserId: 'uid-1',
      alias: 'Jane Smith',
      aliasNormalized: 'jane smith',
      isPrimary: true,
      source: 'auto_seed',
      createdAt: new Date(),
      createdBy: null,
    }

    // detectCollision: db.select().from().where().limit(1) returns [exactRow]
    mockDbSelect.mockReturnValue(makeExactSelectChain(exactRow))

    const result = await detectCollision('Jane Smith')
    expect(result.exactMatch).not.toBeNull()
    expect(result.exactMatch!.alias).toBe('Jane Smith')
    expect(result.fuzzyMatches).toHaveLength(0)
    // execute() must NOT be called — exact match short-circuits
    expect(mockDbExecute).not.toHaveBeenCalled()
  })

  // ── Fuzzy path — uses db.execute() with pg_trgm SQL ───────────────────────

  test('T2.5 calibration: 1-char typo (jane smyth → jane smith) — similarity ~0.64, matched', async () => {
    // Exact match returns nothing
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    // pg_trgm query returns one candidate with high similarity
    mockDbExecute.mockResolvedValue([trgmRow({ similarity: 0.64 })])

    const result = await detectCollision('Jane Smyth')
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches).toHaveLength(1)
    // distance is synthetic 1 - similarity, rounded 2 dp
    expect(result.fuzzyMatches[0]!.distance).toBeCloseTo(0.36, 1)
    // tokenMatch is always false in T2.5 implementation
    expect(result.fuzzyMatches[0]!.tokenMatch).toBe(false)
    // alias is the full UserAlias shape
    expect(result.fuzzyMatches[0]!.alias.alias).toBe('Jane Smith')
    expect(result.fuzzyMatches[0]!.alias.identityUserId).toBe('uid-2')
  })

  test('T2.5 calibration: 2-char typo (jone smyth → jane smith) — similarity ~0.50, matched', async () => {
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    mockDbExecute.mockResolvedValue([trgmRow({ alias_normalized: 'jane smith', similarity: 0.50 })])

    const result = await detectCollision('Jone Smyth')
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches).toHaveLength(1)
    expect(result.fuzzyMatches[0]!.distance).toBeCloseTo(0.50, 1)
  })

  test('T2.5 calibration: name extension (jane smith jr → jane smith) — similarity ~0.59, matched', async () => {
    // Old logic: Lev=3 but token-set match. New logic: similarity 0.59 >= 0.35.
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    mockDbExecute.mockResolvedValue([trgmRow({ alias_normalized: 'jane smith', similarity: 0.59 })])

    const result = await detectCollision('Jane Smith Jr')
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches).toHaveLength(1)
    expect(result.fuzzyMatches[0]!.alias.alias).toBe('Jane Smith')
  })

  test('T2.5 calibration: middle-token insertion (mary ann lee → mary lee) — similarity ~0.54, matched', async () => {
    // Old logic: Lev=4 but first+last token match. New logic: similarity 0.54 >= 0.35.
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    mockDbExecute.mockResolvedValue([
      trgmRow({ id: 'alias-mary', alias_normalized: 'mary lee', alias: 'Mary Lee', identity_user_id: 'uid-mary', similarity: 0.54 }),
    ])

    const result = await detectCollision('Mary Ann Lee')
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches).toHaveLength(1)
    expect(result.fuzzyMatches[0]!.alias.alias).toBe('Mary Lee')
  })

  test('T2.5 calibration: unrelated name (alice → peter) — similarity ~0.00, NOT matched', async () => {
    // pg_trgm returns empty rows (similarity < threshold, % operator excludes them)
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    mockDbExecute.mockResolvedValue([])

    const result = await detectCollision('Alice')
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches).toHaveLength(0)
  })

  test('results are ordered best-match first (similarity DESC from SQL)', async () => {
    // The SQL already orders by similarity DESC; the JS mapping preserves order.
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    mockDbExecute.mockResolvedValue([
      trgmRow({ id: 'high', alias: 'Jane Smith', similarity: 0.80 }),
      trgmRow({ id: 'low',  alias: 'Jane Smyth', alias_normalized: 'jane smyth', similarity: 0.45 }),
    ])

    const result = await detectCollision('Jane Smith Xx')
    expect(result.fuzzyMatches).toHaveLength(2)
    expect(result.fuzzyMatches[0]!.alias.id).toBe('high')
    expect(result.fuzzyMatches[1]!.alias.id).toBe('low')
    // lower distance = better match
    expect(result.fuzzyMatches[0]!.distance).toBeLessThan(result.fuzzyMatches[1]!.distance)
  })

  test('execute() is called exactly once for the fuzzy path (single DB round-trip)', async () => {
    mockDbSelect.mockReturnValue(makeSelectChainEmpty())
    mockDbExecute.mockResolvedValue([])

    await detectCollision('Any Name')
    expect(mockDbExecute).toHaveBeenCalledTimes(1)
  })
})
