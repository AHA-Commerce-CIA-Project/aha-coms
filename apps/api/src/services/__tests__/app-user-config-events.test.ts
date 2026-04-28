import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Stubs — registered before importing the module under test
// ---------------------------------------------------------------------------

const appRegistry = { id: 'appRegistry.id', slug: 'appRegistry.slug' }

let currentApp: { slug: string } | null = null

const db = {
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => ({
        limit: async () => (currentApp ? [currentApp] : []),
      }),
    }),
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/apps', () => ({ appRegistry }))
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ left, right }),
  sql: new Proxy(
    (strings: TemplateStringsArray) => strings.join(''),
    { get: (_t, prop) => prop },
  ),
  relations: () => ({}),
  and: (...conditions: unknown[]) => ({ conditions }),
  inArray: (left: unknown, right: unknown) => ({ left, right }),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  index: () => ({ on: () => ({}) }),
}))

const dispatchPortalWebhook = mock(async () => undefined)
mock.module('../portal-webhook-fanout', () => ({ dispatchPortalWebhook }))

const { emitAppConfigUpdated } = await import('../app-user-config-events')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseParams = {
  portalSub: 'user-1',
  appId: 'app-uuid-1',
  config: { role: 'member' },
  previousConfig: { role: 'employee' },
  schemaVersion: 1,
  batchId: null,
}

function resetState() {
  currentApp = null
  dispatchPortalWebhook.mockClear()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('emitAppConfigUpdated', () => {
  beforeEach(resetState)

  test('dispatches app_config.updated with correct payload and per-app slug filter', async () => {
    currentApp = { slug: 'heroes' }

    await emitAppConfigUpdated(baseParams)

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [event, payload, opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { appSlugs: string[] },
    ]
    expect(event).toBe('app_config.updated')
    expect(payload.portalSub).toBe('user-1')
    expect(payload.config).toEqual({ role: 'member' })
    expect(payload.previousConfig).toEqual({ role: 'employee' })
    expect(payload.schemaVersion).toBe(1)
    expect(payload.batchId).toBeNull()
    expect(opts.appSlugs).toEqual(['heroes'])
  })

  test('single edit emits one event with batchId: null', async () => {
    currentApp = { slug: 'heroes' }

    await emitAppConfigUpdated({ ...baseParams, batchId: null })

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(1)
    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.batchId).toBeNull()
  })

  test('bulk edit emits event with shared batchId', async () => {
    currentApp = { slug: 'heroes' }
    const batchId = 'batch-uuid-abc'

    await emitAppConfigUpdated({ ...baseParams, batchId })

    const [, payload] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(payload.batchId).toBe(batchId)
  })

  test('N-row bulk emits N events all sharing the same batchId', async () => {
    currentApp = { slug: 'heroes' }
    const batchId = 'batch-uuid-xyz'
    const users = ['user-1', 'user-2', 'user-3']

    for (const portalSub of users) {
      await emitAppConfigUpdated({ ...baseParams, portalSub, batchId })
    }

    expect(dispatchPortalWebhook).toHaveBeenCalledTimes(3)
    for (const call of dispatchPortalWebhook.mock.calls) {
      const [, payload] = call as unknown as [string, Record<string, unknown>]
      expect(payload.batchId).toBe(batchId)
    }
  })

  test('per-app filtering: only the affected app slug is passed in appSlugs', async () => {
    currentApp = { slug: 'orbit' }

    await emitAppConfigUpdated({ ...baseParams, appId: 'app-uuid-2' })

    const [, , opts] = dispatchPortalWebhook.mock.calls[0] as unknown as [string, unknown, { appSlugs: string[] }]
    expect(opts.appSlugs).toEqual(['orbit'])
    expect(opts.appSlugs).not.toContain('heroes')
  })

  test('does not dispatch when app is not found', async () => {
    currentApp = null

    await emitAppConfigUpdated(baseParams)

    expect(dispatchPortalWebhook).not.toHaveBeenCalled()
  })
})
