import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { mockSpecs } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock requireAppToken — mirrors aliases.test.ts pattern
// ---------------------------------------------------------------------------

const TEST_APP = {
  id: 'app-uuid-heroes',
  slug: 'heroes',
  serviceAccountEmail: 'heroes-sa@project.iam.gserviceaccount.com',
}

let authEnabled = true

mock.module('~/middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token-tx' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      if (authEnabled) {
        const auth = request.headers.get('authorization')
        if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }
      return { app: TEST_APP }
    }),
}))
mock.module('../middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token-tx-rel' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      if (authEnabled) {
        const auth = request.headers.get('authorization')
        if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }
      return { app: TEST_APP }
    }),
}))

// ---------------------------------------------------------------------------
// Mock taxonomies service
// ---------------------------------------------------------------------------

type TaxonomyGroup = { taxonomyId: string; entries: Array<{ key: string; value: string; metadata: unknown }> }

let mockTaxonomiesResult: TaxonomyGroup[] = []

const mockGetTaxonomyEntriesForApp = mock(async (_appId: string) => ({
  taxonomies: mockTaxonomiesResult,
  syncedAt: new Date().toISOString(),
}))

const TAXO_SPECS = ['~/services/taxonomies', '../services/taxonomies']
mockSpecs(TAXO_SPECS, () => ({
  getTaxonomyEntriesForApp: mockGetTaxonomyEntriesForApp,
  listAllTaxonomyIds: mock(async () => []),
  listTaxonomyEntries: mock(async () => []),
  upsertTaxonomyEntry: mock(async () => ({})),
  bulkUpsertTaxonomyEntries: mock(async () => ({ upserted: 0, entries: [] })),
  deleteTaxonomyEntries: mock(async () => ({ deleted: 0 })),
}))

// ---------------------------------------------------------------------------
// Import route under test
// ---------------------------------------------------------------------------

const { taxonomiesRoutes } = await import('../taxonomies')

function makeApp() {
  return new Elysia().use(taxonomiesRoutes)
}
type TestApp = ReturnType<typeof makeApp>

async function get(app: TestApp, path: string, headers: Record<string, string> = { authorization: 'Bearer token' }) {
  return app.handle(new Request(`http://localhost${path}`, { headers }))
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function reset() {
  authEnabled = true
  mockTaxonomiesResult = []
  mockGetTaxonomyEntriesForApp.mockReset()
  mockGetTaxonomyEntriesForApp.mockImplementation(async () => ({
    taxonomies: mockTaxonomiesResult,
    syncedAt: new Date().toISOString(),
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /taxonomies/sync', () => {
  beforeEach(reset)

  test('missing token → 401', async () => {
    const app = makeApp()
    const res = await get(app, '/taxonomies/sync', {})
    expect(res.status).toBe(401)
  })

  test('app with empty taxonomies → { taxonomies: [], syncedAt }', async () => {
    mockTaxonomiesResult = []
    const app = makeApp()
    const res = await get(app, '/taxonomies/sync')
    expect(res.status).toBe(200)
    const body = await res.json() as { taxonomies: unknown[]; syncedAt: string }
    expect(body.taxonomies).toHaveLength(0)
    expect(typeof body.syncedAt).toBe('string')
  })

  test('app subscribes to branches → response contains branches group', async () => {
    mockTaxonomiesResult = [
      {
        taxonomyId: 'branches',
        entries: [
          { key: 'ID-JKT', value: 'Indonesia – Jakarta', metadata: { country: 'ID' } },
          { key: 'TH-BKK', value: 'Thailand – Bangkok', metadata: null },
        ],
      },
    ]
    const app = makeApp()
    const res = await get(app, '/taxonomies/sync')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      taxonomies: Array<{ taxonomyId: string; entries: Array<{ key: string; value: string; metadata: unknown }> }>
      syncedAt: string
    }
    expect(body.taxonomies).toHaveLength(1)
    expect(body.taxonomies[0].taxonomyId).toBe('branches')
    expect(body.taxonomies[0].entries).toHaveLength(2)
    expect(body.taxonomies[0].entries[0].key).toBe('ID-JKT')
  })

  test('response shape matches spec §API contract', async () => {
    mockTaxonomiesResult = [
      {
        taxonomyId: 'branches',
        entries: [
          { key: 'ID-JKT', value: 'Indonesia – Jakarta', metadata: { country: 'ID' } },
        ],
      },
      {
        taxonomyId: 'teams',
        entries: [],
      },
    ]
    const app = makeApp()
    const res = await get(app, '/taxonomies/sync')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      taxonomies: Array<{ taxonomyId: string; entries: unknown[] }>
      syncedAt: string
    }
    expect(body.taxonomies).toHaveLength(2)
    expect(body.taxonomies[0]).toMatchObject({ taxonomyId: 'branches' })
    expect(body.taxonomies[1]).toMatchObject({ taxonomyId: 'teams' })
    // syncedAt is ISO 8601
    expect(new Date(body.syncedAt).toISOString()).toBe(body.syncedAt)
  })

  test('calls getTaxonomyEntriesForApp with calling app id', async () => {
    const app = makeApp()
    await get(app, '/taxonomies/sync')
    expect(mockGetTaxonomyEntriesForApp).toHaveBeenCalledWith(TEST_APP.id)
  })
})
