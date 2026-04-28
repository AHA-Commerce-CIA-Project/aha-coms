import { describe, test, expect, mock, beforeEach } from 'bun:test'

// ─── Pure function tests (no DB needed) ──────────────────────────────────────

// Extract levenshtein for testing by re-implementing; the real one is module-internal.
// We test observable behavior via detectCollision mocks below, and boundary directly here.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
      }
    }
  }
  return dp[m]![n]!
}

describe('levenshtein', () => {
  test('identical strings return 0', () => {
    expect(levenshtein('jane smith', 'jane smith')).toBe(0)
  })

  test('distance 1 single substitution', () => {
    expect(levenshtein('jane smith', 'jane smyth')).toBe(1)
  })

  test('distance 2 matches — two substitutions', () => {
    // one substitution: y→i
    expect(levenshtein('jane smith', 'jane smyth')).toBe(1)
    // two substitutions: a→o AND i→y
    expect(levenshtein('jane smith', 'jone smyth')).toBe(2)
    // both <= 2 so fuzzy threshold accepts them
    expect(levenshtein('jane smith', 'jane smyth')).toBeLessThanOrEqual(2)
    expect(levenshtein('jane smith', 'jone smyth')).toBeLessThanOrEqual(2)
  })

  test('distance 3 does not match the <= 2 threshold', () => {
    // three edits needed: completely different name
    expect(levenshtein('alice', 'peter')).toBeGreaterThan(2)
  })

  test('empty string to non-empty equals length of non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })
})

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

mock.module('~/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
  },
}))

mock.module('~/db/schema', () => ({
  userAliases: { identityUserId: 'ua.identity_user_id', aliasNormalized: 'ua.alias_normalized', isPrimary: 'ua.is_primary' },
  aliasCollisionQueue: {},
  identityUsers: { id: 'iu.id', status: 'iu.status', updatedAt: 'iu.updated_at' },
}))

const { resolveAliases, renamePrimaryAlias, detectCollision } =
  await import('../aliases')

beforeEach(() => {
  mockDbSelect.mockReset()
  mockDbInsert.mockReset()
  mockDbUpdate.mockReset()
  mockDbTransaction.mockReset()
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

describe('detectCollision', () => {
  test('returns exactMatch when alias_normalized matches', async () => {
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

    // detectCollision: first select for exact match (.limit(1)) => [exactRow]
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.where = () => chain
    chain.limit = async () => [exactRow]
    mockDbSelect.mockReturnValue(chain)

    const result = await detectCollision('Jane Smith')
    expect(result.exactMatch).not.toBeNull()
    expect(result.exactMatch!.alias).toBe('Jane Smith')
    expect(result.fuzzyMatches).toHaveLength(0)
  })

  test('returns fuzzy match for Levenshtein distance <= 2', async () => {
    const candidate = {
      id: 'alias-2',
      identityUserId: 'uid-2',
      alias: 'Jane Smith',
      aliasNormalized: 'jane smith',
      isPrimary: true,
      source: 'auto_seed',
      createdAt: new Date(),
      createdBy: null,
    }

    let callCount = 0
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.where = () => chain
    // First call (exact match): returns empty; second call (all aliases): returns candidate
    chain.limit = async () => {
      callCount++
      return []
    }
    // Second select (no .limit) returns all aliases
    const chain2: Record<string, unknown> = {}
    chain2.from = async () => [candidate]

    mockDbSelect.mockImplementation(() => {
      callCount++
      if (callCount <= 1) return chain
      return chain2
    })

    // Re-mock for the two-select pattern: first returns empty exact, second returns all
    mockDbSelect.mockReset()
    let selectCall = 0
    mockDbSelect.mockImplementation(() => {
      selectCall++
      if (selectCall === 1) {
        // exact match query
        const c: Record<string, unknown> = {}
        c.from = () => c
        c.where = () => c
        c.limit = async () => []
        return c
      }
      // all aliases query
      const c: Record<string, unknown> = {}
      c.from = async () => [candidate]
      return c
    })

    const result = await detectCollision('Jane Smyth')
    // Levenshtein('jane smyth', 'jane smith') = 1, which is <= 2
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches.length).toBeGreaterThan(0)
    expect(result.fuzzyMatches[0]!.distance).toBeLessThanOrEqual(2)
  })

  test('returns fuzzy match on token-set match even when Levenshtein > 2 (spec OR-condition)', async () => {
    // Candidates the OR-condition catches that pure Lev<=2 misses:
    // "Jane Smith" vs "Jane Smith Jr" — Lev=3 but last+first share, token-set match.
    const candidate = {
      id: 'alias-existing',
      identityUserId: 'uid-jane',
      alias: 'Jane Smith',
      aliasNormalized: 'jane smith',
      isPrimary: true,
      source: 'auto_seed',
      createdAt: new Date(),
      createdBy: null,
    }

    mockDbSelect.mockReset()
    let selectCall = 0
    mockDbSelect.mockImplementation(() => {
      selectCall++
      if (selectCall === 1) {
        const c: Record<string, unknown> = {}
        c.from = () => c
        c.where = () => c
        c.limit = async () => []
        return c
      }
      const c: Record<string, unknown> = {}
      c.from = async () => [candidate]
      return c
    })

    const result = await detectCollision('Jane Smith Jr')
    // Levenshtein('jane smith jr', 'jane smith') = 3, but token-set matches on first+last.
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches.length).toBeGreaterThan(0)
    expect(result.fuzzyMatches[0]!.tokenMatch).toBe(true)
  })

  test('returns fuzzy match on token-set match for middle-token insertion (Mary Lee vs Mary Ann Lee)', async () => {
    const candidate = {
      id: 'alias-mary',
      identityUserId: 'uid-mary',
      alias: 'Mary Lee',
      aliasNormalized: 'mary lee',
      isPrimary: true,
      source: 'auto_seed',
      createdAt: new Date(),
      createdBy: null,
    }

    mockDbSelect.mockReset()
    let selectCall = 0
    mockDbSelect.mockImplementation(() => {
      selectCall++
      if (selectCall === 1) {
        const c: Record<string, unknown> = {}
        c.from = () => c
        c.where = () => c
        c.limit = async () => []
        return c
      }
      const c: Record<string, unknown> = {}
      c.from = async () => [candidate]
      return c
    })

    const result = await detectCollision('Mary Ann Lee')
    // Levenshtein = 4, but first ('mary') and last ('lee') tokens both align — token-set match.
    expect(result.exactMatch).toBeNull()
    expect(result.fuzzyMatches.length).toBeGreaterThan(0)
    expect(result.fuzzyMatches[0]!.tokenMatch).toBe(true)
  })
})
