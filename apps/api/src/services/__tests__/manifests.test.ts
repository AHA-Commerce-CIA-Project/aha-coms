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

// Import via `manifests-internal` (NOT `manifests`) so this test exercises
// the real implementation regardless of cross-file mock pollution. Other test
// files (e.g. `app-user-config.test.ts`, `app-manifest.test.ts`) call
// `mock.module('../manifests', ...)` / `mock.module('~/services/manifests', ...)`,
// which is process-global in Bun — the cached mocked module would otherwise
// mask `validateConfig` / `validateConfigSchemaShape` / `registerManifest`
// when this test runs after them in the same `bun test` invocation.
const {
  validateConfig,
  seedDefaults,
  registerManifest,
  loadAllManifests,
  validateConfigSchemaShape,
} = await import('../manifests-internal')

// ---------------------------------------------------------------------------
// Fixtures — Heroes-shaped manifest used as a reference. The static
// heroes.json file no longer exists in the codebase (Spec 03d D12); this
// inline fixture preserves the test surface for validateConfig / seedDefaults
// / registerManifest without resurrecting a runtime artefact.
// ---------------------------------------------------------------------------

const heroesManifest: Parameters<typeof registerManifest>[0] = {
  appId: 'heroes',
  displayName: 'Heroes',
  schemaVersion: 2,
  taxonomies: ['branches', 'teams', 'departments'],
  configSchema: {
    leaderboard_eligible: { type: 'boolean', default: true },
    starting_points: { type: 'integer', default: 0 },
  },
}

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
      leaderboard_eligible: false,
      starting_points: 100,
    })
    expect(result.valid).toBe(true)
  })

  test('rejects integer given a string', () => {
    const result = validateConfig(heroesManifest, {
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

describe('Heroes-shaped reference manifest', () => {
  test('configSchema carries only app-specific knobs (role lives on heroes_profiles, not the manifest)', () => {
    expect(heroesManifest.configSchema.leaderboard_eligible).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(heroesManifest.configSchema.starting_points).toMatchObject({
      type: 'integer',
      default: 0,
    })
    // role intentionally NOT in configSchema — Heroes derives role from
    // member_app_role.appRole (broadcast via envelope.appRole) post Heroes
    // role-refactor.
    expect((heroesManifest.configSchema as Record<string, unknown>).role).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// validateConfigSchemaShape — Spec 03d D12 admin-driven onboarding gate
// ---------------------------------------------------------------------------

describe('validateConfigSchemaShape', () => {
  test('accepts a valid configSchema with mixed field types', () => {
    const errors = validateConfigSchemaShape({
      leaderboard_eligible: { type: 'boolean', default: true },
      starting_points: { type: 'integer', default: 0 },
      tier: { type: 'string', default: 'basic' },
      role: { type: 'enum', values: ['member', 'captain'], default: 'member' },
    })
    expect(errors).toEqual([])
  })

  test('rejects non-object root', () => {
    const errors = validateConfigSchemaShape('not-an-object')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.reason).toMatch(/object/i)
  })

  test('rejects array root (arrays are objects in JS but not valid here)', () => {
    const errors = validateConfigSchemaShape([])
    expect(errors.length).toBeGreaterThan(0)
  })

  test('rejects field with unknown type', () => {
    const errors = validateConfigSchemaShape({
      mystery: { type: 'json', default: {} },
    })
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'mystery', reason: expect.stringMatching(/type/i) }),
    )
  })

  test('rejects enum field missing values array', () => {
    const errors = validateConfigSchemaShape({
      role: { type: 'enum', default: 'member' },
    })
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'role', reason: expect.stringMatching(/values/i) }),
    )
  })

  test("rejects enum field whose default is not in values", () => {
    const errors = validateConfigSchemaShape({
      role: { type: 'enum', values: ['a', 'b'], default: 'c' },
    })
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'role', reason: expect.stringMatching(/default/i) }),
    )
  })

  test('rejects boolean field whose default is not a boolean', () => {
    const errors = validateConfigSchemaShape({
      flag: { type: 'boolean', default: 'true' },
    })
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'flag', reason: expect.stringMatching(/boolean/i) }),
    )
  })

  test('rejects integer field with non-integer default', () => {
    const errors = validateConfigSchemaShape({
      count: { type: 'integer', default: 1.5 },
    })
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'count', reason: expect.stringMatching(/integer/i) }),
    )
  })

  test('rejects string field with non-string default', () => {
    const errors = validateConfigSchemaShape({
      label: { type: 'string', default: 42 },
    })
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'label', reason: expect.stringMatching(/string/i) }),
    )
  })

  test('reports every malformed field, not just the first', () => {
    const errors = validateConfigSchemaShape({
      bad1: { type: 'unknown' },
      bad2: { type: 'integer', default: 'nope' },
    })
    expect(errors.length).toBeGreaterThanOrEqual(2)
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
        schemaVersion: 2,
        taxonomies: ['branches', 'teams', 'departments'],
      }),
    )
  })

  test('writes taxonomies array even when manifest omits it (defaults to [])', async () => {
    const manifestWithoutTaxonomies = { ...heroesManifest } as Parameters<
      typeof registerManifest
    >[0]
    delete (manifestWithoutTaxonomies as { taxonomies?: string[] }).taxonomies
    await registerManifest(manifestWithoutTaxonomies)
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ taxonomies: [] }),
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

  // Spec 03d D12 — "manifest is optional" empty-rowset behaviour is exercised
  // end-to-end by the seedAppUserConfigForUser test
  // ("no-ops when no manifests are registered") in app-user-config.test.ts,
  // which is the meaningful consumer contract. The thin db.select().from(...)
  // wrapper here is too small for an isolated mock-flip test that survives
  // bun:test's cross-file mock.module pollution.
})
