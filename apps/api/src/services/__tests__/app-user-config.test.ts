import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { mockSpecs } from '~/test-helpers/schema-barrel-mock'

const MANIFESTS_SPECS = ['../manifests', '~/services/manifests']

// ---------------------------------------------------------------------------
// Mocks — registered before module import
// ---------------------------------------------------------------------------

// Track inserts per call
const insertedRows: unknown[] = []

const mockInsertChain = {
  values: mock((vals: unknown) => {
    insertedRows.push(vals)
    return mockInsertChain
  }),
  onConflictDoNothing: mock(async () => undefined),
}
const mockInsert = mock(() => mockInsertChain)

// Fake tx that exposes insert
const fakeTx = { insert: mockInsert }

// Mock loadAllManifests to return a controlled set
const mockLoadAllManifests = mock(async () => [
  {
    appId: 'uuid-heroes',
    displayName: 'Heroes',
    schemaVersion: 1,
    configSchema: {
      role: { type: 'enum', values: ['member', 'captain', 'admin'], default: 'member' },
      leaderboard_eligible: { type: 'boolean', default: true },
      starting_points: { type: 'integer', default: 0 },
    },
    registeredAt: new Date(),
    updatedAt: new Date(),
  },
  {
    appId: 'uuid-app-x',
    displayName: 'App X',
    schemaVersion: 2,
    configSchema: {
      tier: { type: 'string', default: 'basic' },
    },
    registeredAt: new Date(),
    updatedAt: new Date(),
  },
])

const mockSeedDefaults = (manifest: { configSchema: Record<string, { default: unknown }> }) => {
  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(manifest.configSchema)) {
    result[key] = field.default
  }
  return result
}

mockSpecs(MANIFESTS_SPECS, () => ({
  loadAllManifests: mockLoadAllManifests,
  seedDefaults: mockSeedDefaults,
}))

mock.module('~/db', () => ({ db: { transaction: mock(async (fn: (tx: unknown) => unknown) => fn(fakeTx)) } }))
mock.module('~/db/schema/app-user-config', () => ({ appUserConfig: { name: 'app_user_config' } }))

const { seedAppUserConfigForUser } = await import('../app-user-config')

function resetMocks() {
  mockInsert.mockClear()
  mockInsertChain.values.mockClear()
  mockInsertChain.onConflictDoNothing.mockClear()
  insertedRows.length = 0
}

// ---------------------------------------------------------------------------
// seedAppUserConfigForUser
// ---------------------------------------------------------------------------

describe('seedAppUserConfigForUser', () => {
  beforeEach(resetMocks)

  test('seeds one row per registered manifest', async () => {
    await seedAppUserConfigForUser(fakeTx as never, 'user-1')
    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect(mockInsertChain.onConflictDoNothing).toHaveBeenCalledTimes(2)
  })

  test('seeds correct defaults for Heroes manifest', async () => {
    await seedAppUserConfigForUser(fakeTx as never, 'user-42')
    const heroesRow = (insertedRows as Array<{ appId: string; config: Record<string, unknown>; schemaVersion: number; portalSub: string }>).find(
      (r) => r.appId === 'uuid-heroes',
    )
    expect(heroesRow).toBeDefined()
    expect(heroesRow?.config).toEqual({
      role: 'member',
      leaderboard_eligible: true,
      starting_points: 0,
    })
    expect(heroesRow?.schemaVersion).toBe(1)
    expect(heroesRow?.portalSub).toBe('user-42')
  })

  test('per-recipient slicing: Heroes row never has App-X config', async () => {
    await seedAppUserConfigForUser(fakeTx as never, 'user-1')
    const heroesRow = (insertedRows as Array<{ appId: string; config: Record<string, unknown> }>).find(
      (r) => r.appId === 'uuid-heroes',
    )
    expect(heroesRow?.config).not.toHaveProperty('tier')
  })

  test('uses onConflictDoNothing for idempotency', async () => {
    await seedAppUserConfigForUser(fakeTx as never, 'user-1')
    // Both rows must use onConflictDoNothing
    expect(mockInsertChain.onConflictDoNothing).toHaveBeenCalledTimes(2)
  })

  test('no-ops when no manifests are registered', async () => {
    mockLoadAllManifests.mockResolvedValueOnce([])
    await seedAppUserConfigForUser(fakeTx as never, 'user-1')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
