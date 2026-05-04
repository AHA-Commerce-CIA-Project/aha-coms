import { describe, expect, mock, test, beforeEach } from 'bun:test'

// ---------------------------------------------------------------------------
// Mock dispatchPortalWebhook (via thin re-export)
// ---------------------------------------------------------------------------

const mockDispatch = mock(async () => {})

mock.module('~/services/webhook-dispatcher', () => ({
  dispatchPortalWebhook: mockDispatch,
}))
mock.module('../webhook-dispatcher', () => ({
  dispatchPortalWebhook: mockDispatch,
}))
mock.module('~/services/portal-webhook-fanout', () => ({
  dispatchPortalWebhook: mockDispatch,
}))
mock.module('../portal-webhook-fanout', () => ({
  dispatchPortalWebhook: mockDispatch,
}))

// ---------------------------------------------------------------------------
// Mock DB for subscribing-apps query
// ---------------------------------------------------------------------------

let subscribedAppSlugs: string[] = []

const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.where = () => chain
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return chain
}

const mockDb = {
  select: () => makeSelectChain(subscribedAppSlugs.map((slug) => ({ slug }))),
}

mock.module('~/db', () => ({ db: mockDb }))

// Mock schema modules so barrel can load without real drizzle
mock.module('~/db/schema/app-manifests', () => ({
  appManifests: { appId: 'appManifests.appId', taxonomies: 'appManifests.taxonomies' },
}))
mock.module('~/db/schema/apps', () => ({
  appRegistry: { id: 'appRegistry.id', slug: 'appRegistry.slug' },
}))
mock.module('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ type: 'eq', l, r }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  sql: new Proxy((s: TemplateStringsArray) => s.join(''), { get: (_t, p) => p }),
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

const {
  emitTaxonomyUpserted,
  emitTaxonomyDeleted,
  emitEmploymentUpdated,
} = await import('../taxonomy-events')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reset() {
  subscribedAppSlugs = []
  mockDispatch.mockReset()
  mockDispatch.mockImplementation(async () => {})
  delete process.env.ENABLE_TAXONOMY_EVENTS
}

// ---------------------------------------------------------------------------
// emitTaxonomyUpserted
// ---------------------------------------------------------------------------

describe('emitTaxonomyUpserted — flag off', () => {
  beforeEach(reset)

  test('no env var → no dispatch, no DB query', async () => {
    await emitTaxonomyUpserted({
      taxonomyId: 'branches',
      entries: [{ key: 'ID-JKT', value: 'Jakarta', metadata: null }],
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  test('flag explicitly false → no dispatch', async () => {
    process.env.ENABLE_TAXONOMY_EVENTS = 'false'
    await emitTaxonomyUpserted({
      taxonomyId: 'branches',
      entries: [{ key: 'ID-JKT', value: 'Jakarta', metadata: null }],
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})

describe('emitTaxonomyUpserted — flag on', () => {
  beforeEach(() => {
    reset()
    process.env.ENABLE_TAXONOMY_EVENTS = 'true'
  })

  test('no apps subscribe to taxonomy → no dispatch', async () => {
    subscribedAppSlugs = []
    await emitTaxonomyUpserted({
      taxonomyId: 'branches',
      entries: [{ key: 'ID-JKT', value: 'Jakarta', metadata: null }],
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  test('two apps subscribe → dispatch called once with both slugs', async () => {
    subscribedAppSlugs = ['heroes', 'another-app']
    await emitTaxonomyUpserted({
      taxonomyId: 'branches',
      entries: [
        { key: 'ID-JKT', value: 'Jakarta', metadata: null },
        { key: 'TH-BKK', value: 'Bangkok', metadata: { country: 'TH' } },
      ],
    })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = mockDispatch.mock.calls[0] as unknown as [string, unknown, { appSlugs: string[] }]
    expect(event).toBe('taxonomy.upserted')
    expect(opts.appSlugs).toEqual(['heroes', 'another-app'])
    expect((payload as { entries: unknown[] }).entries).toHaveLength(2)
  })

  test('bulk upsert with N entries → single envelope, not N envelopes', async () => {
    subscribedAppSlugs = ['heroes']
    const entries = Array.from({ length: 5 }, (_, i) => ({
      key: `key-${i}`,
      value: `Value ${i}`,
      metadata: null,
    }))
    await emitTaxonomyUpserted({ taxonomyId: 'branches', entries })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    const [, payload] = mockDispatch.mock.calls[0] as unknown as [string, { entries: unknown[] }, unknown]
    expect(payload.entries).toHaveLength(5)
  })

  test('taxonomyId passed through in payload', async () => {
    subscribedAppSlugs = ['heroes']
    await emitTaxonomyUpserted({
      taxonomyId: 'teams',
      entries: [{ key: 'ops', value: 'Ops', metadata: null }],
    })
    const [, payload] = mockDispatch.mock.calls[0] as unknown as [string, { taxonomyId: string }, unknown]
    expect(payload.taxonomyId).toBe('teams')
  })
})

// ---------------------------------------------------------------------------
// emitTaxonomyDeleted
// ---------------------------------------------------------------------------

describe('emitTaxonomyDeleted — flag off', () => {
  beforeEach(reset)

  test('no dispatch when flag not set', async () => {
    await emitTaxonomyDeleted({ taxonomyId: 'branches', keys: ['OLD-CODE'] })
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})

describe('emitTaxonomyDeleted — flag on', () => {
  beforeEach(() => {
    reset()
    process.env.ENABLE_TAXONOMY_EVENTS = 'true'
  })

  test('no apps subscribe → no dispatch', async () => {
    subscribedAppSlugs = []
    await emitTaxonomyDeleted({ taxonomyId: 'branches', keys: ['OLD-CODE'] })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  test('one app subscribes → dispatch called with correct payload', async () => {
    subscribedAppSlugs = ['heroes']
    await emitTaxonomyDeleted({ taxonomyId: 'branches', keys: ['OLD-1', 'OLD-2'] })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = mockDispatch.mock.calls[0] as unknown as [string, { keys: string[] }, { appSlugs: string[] }]
    expect(event).toBe('taxonomy.deleted')
    expect(payload.keys).toEqual(['OLD-1', 'OLD-2'])
    expect(opts.appSlugs).toEqual(['heroes'])
  })
})

// ---------------------------------------------------------------------------
// emitEmploymentUpdated
// ---------------------------------------------------------------------------

describe('emitEmploymentUpdated — flag off', () => {
  beforeEach(reset)

  test('no dispatch when flag not set', async () => {
    await emitEmploymentUpdated({
      user: { portalSub: 'user-uuid' },
      employment: { branch: 'ID-JKT' },
      previousEmployment: {},
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})

describe('emitEmploymentUpdated — flag on', () => {
  beforeEach(() => {
    reset()
    process.env.ENABLE_TAXONOMY_EVENTS = 'true'
  })

  test('dispatches always (no per-app filter)', async () => {
    await emitEmploymentUpdated({
      user: { portalSub: 'user-uuid' },
      employment: { branch: 'ID-JKT' },
      previousEmployment: { branch: 'TH-BKK' },
    })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    const [event] = mockDispatch.mock.calls[0] as unknown as [string, unknown, unknown]
    expect(event).toBe('employment.updated')
  })

  test('passes correct payload shape', async () => {
    await emitEmploymentUpdated({
      user: { portalSub: 'user-uuid-123' },
      employment: { branch: 'ID-JKT', position: 'Engineer' },
      previousEmployment: { branch: 'TH-BKK' },
    })
    const [, payload] = mockDispatch.mock.calls[0] as unknown as [
      string,
      { user: { portalSub: string }; employment: Record<string, unknown>; previousEmployment: Record<string, unknown> },
      unknown
    ]
    expect(payload.user.portalSub).toBe('user-uuid-123')
    expect(payload.employment).toMatchObject({ branch: 'ID-JKT' })
    expect(payload.previousEmployment).toMatchObject({ branch: 'TH-BKK' })
  })

  test('dispatches even when subscribedAppSlugs is empty (no taxonomy filter)', async () => {
    subscribedAppSlugs = [] // should not matter
    await emitEmploymentUpdated({
      user: { portalSub: 'u' },
      employment: {},
      previousEmployment: {},
    })
    // No DB query for subscribed apps — employment goes to all endpoints
    expect(mockDispatch).toHaveBeenCalledTimes(1)
  })
})
