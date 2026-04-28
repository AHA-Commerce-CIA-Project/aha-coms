import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// DB mock — must be registered before importing the module under test
// ---------------------------------------------------------------------------

const mockSelect = mock(() => ({
  from: mock(() => ({
    where: mock(() => ({
      limit: mock(async () => [{ id: 'app-uuid-heroes' }]),
    })),
  })),
}))

const mockInsertChain = {
  values: mock(() => mockInsertChain),
  onConflictDoUpdate: mock(async () => undefined),
}
const mockInsert = mock(() => mockInsertChain)

const mockSelectAll = {
  from: mock(async () => [
    {
      appId: 'app-uuid-heroes',
      displayName: 'Heroes',
      configSchema: {
        role: { type: 'enum', values: ['member', 'captain', 'admin'], default: 'member' },
        leaderboard_eligible: { type: 'boolean', default: true },
        starting_points: { type: 'integer', default: 0 },
      },
      schemaVersion: 1,
      registeredAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
}

// We need db.select to handle two call shapes: one returns a chain with
// .from().where().limit() (for registerManifest slug lookup), another returns
// a chain with just .from() (for loadAllManifests). We track call count.
let selectCallCount = 0
mock.module('~/db', () => ({
  db: {
    select: mock(() => {
      selectCallCount++
      if (selectCallCount % 2 === 1) {
        // registerManifest: slug lookup chain
        return mockSelect()
      }
      // loadAllManifests: full table scan
      return mockSelectAll
    }),
    insert: mockInsert,
  },
}))

const { validateConfig, seedDefaults, registerManifest, loadAllManifests } = await import(
  '../manifests'
)
import heroesJson from '../manifests/heroes.json'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const heroesManifest = heroesJson as Parameters<typeof registerManifest>[0]

function resetMocks() {
  mockSelect.mockClear()
  mockInsert.mockClear()
  mockInsertChain.values.mockClear()
  mockInsertChain.onConflictDoUpdate.mockClear()
  selectCallCount = 0
}

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  test('accepts a fully valid config', () => {
    const result = validateConfig(heroesManifest, {
      role: 'captain',
      leaderboard_eligible: false,
      starting_points: 100,
    })
    expect(result.valid).toBe(true)
  })

  test('rejects enum value not in values list', () => {
    const result = validateConfig(heroesManifest, {
      role: 'superadmin',
      leaderboard_eligible: true,
      starting_points: 0,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.key === 'role')).toBe(true)
    }
  })

  test('rejects integer given a string', () => {
    const result = validateConfig(heroesManifest, {
      role: 'member',
      leaderboard_eligible: true,
      starting_points: 'zero',
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.key === 'starting_points')).toBe(true)
    }
  })

  test('rejects boolean given a string', () => {
    const result = validateConfig(heroesManifest, {
      role: 'member',
      leaderboard_eligible: 'yes',
      starting_points: 0,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.key === 'leaderboard_eligible')).toBe(true)
    }
  })

  test('rejects missing required key', () => {
    const result = validateConfig(heroesManifest, {
      role: 'member',
      leaderboard_eligible: true,
      // starting_points omitted
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.key === 'starting_points')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// seedDefaults
// ---------------------------------------------------------------------------

describe('seedDefaults', () => {
  test('returns default values for all fields', () => {
    const defaults = seedDefaults(heroesManifest)
    expect(defaults).toEqual({
      role: 'member',
      leaderboard_eligible: true,
      starting_points: 0,
    })
  })

  test('is a pure function — repeated calls return identical output', () => {
    expect(seedDefaults(heroesManifest)).toEqual(seedDefaults(heroesManifest))
  })
})

// ---------------------------------------------------------------------------
// Heroes manifest shape
// ---------------------------------------------------------------------------

describe('heroes.json manifest shape', () => {
  test('matches spec exactly', () => {
    expect(heroesManifest.appId).toBe('heroes')
    expect(heroesManifest.configSchema.role).toMatchObject({
      type: 'enum',
      values: ['member', 'captain', 'admin'],
      default: 'member',
    })
    expect(heroesManifest.configSchema.leaderboard_eligible).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(heroesManifest.configSchema.starting_points).toMatchObject({
      type: 'integer',
      default: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// registerManifest — idempotent upsert
// ---------------------------------------------------------------------------

describe('registerManifest', () => {
  beforeEach(resetMocks)

  test('calls insert with correct values', async () => {
    await registerManifest(heroesManifest)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Heroes',
        schemaVersion: 1,
      }),
    )
  })

  test('calls onConflictDoUpdate (idempotent path)', async () => {
    await registerManifest(heroesManifest)
    expect(mockInsertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// loadAllManifests
// ---------------------------------------------------------------------------

describe('loadAllManifests', () => {
  test('returns an array of manifest rows', async () => {
    const rows = await loadAllManifests()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })
})
