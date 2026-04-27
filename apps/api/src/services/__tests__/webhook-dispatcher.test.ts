import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Schema stubs (must be set up before importing the module under test)
// ---------------------------------------------------------------------------

const appWebhookEndpoints = {
  id: 'app_webhook_endpoints.id',
  appId: 'app_webhook_endpoints.app_id',
  url: 'app_webhook_endpoints.url',
  secret: 'app_webhook_endpoints.secret',
  subscribedEvents: 'app_webhook_endpoints.subscribed_events',
  status: 'app_webhook_endpoints.status',
  failureCount: 'app_webhook_endpoints.failure_count',
  lastDeliveredAt: 'app_webhook_endpoints.last_delivered_at',
  lastFailureAt: 'app_webhook_endpoints.last_failure_at',
  lastFailureReason: 'app_webhook_endpoints.last_failure_reason',
  createdAt: 'app_webhook_endpoints.created_at',
  updatedAt: 'app_webhook_endpoints.updated_at',
}

const appRegistry = {
  id: 'app_registry.id',
  slug: 'app_registry.slug',
}

// ---------------------------------------------------------------------------
// google-auth-library mock — GoogleAuth used by webhook-dispatcher (Rev 2 §03)
// The default stub returns a fake OIDC token so existing tests are unaffected.
// ---------------------------------------------------------------------------

// getRequestHeaders returns a Headers-like object; stub with .get() method
// to match the implementation's headers.get('Authorization') call.
const mockGetRequestHeaders = mock(async () => ({
  get: (name: string) =>
    name.toLowerCase() === 'authorization' ? 'Bearer fake-oidc-token-for-existing-tests' : null,
}))
const mockGetIdTokenClient = mock(async (_audience: string) => ({
  getRequestHeaders: mockGetRequestHeaders,
}))

mock.module('google-auth-library', () => ({
  GoogleAuth: class {
    getIdTokenClient = mockGetIdTokenClient
  },
  OAuth2Client: class {
    verifyIdToken() {}
  },
}))

// ---------------------------------------------------------------------------
// Cloud Tasks enqueue mock — spied on in the failure-path test below
// ---------------------------------------------------------------------------

const enqueueWebhookDeliveryMock = mock(async () => {})

mock.module('../cloud-tasks-client', () => ({
  enqueueWebhookDelivery: enqueueWebhookDeliveryMock,
}))

// ---------------------------------------------------------------------------
// In-memory DB simulation
// ---------------------------------------------------------------------------

type EndpointRecord = {
  id: string
  appId: string
  appSlug: string
  url: string
  secret: string
  subscribedEvents: string[]
  status: string
  failureCount: number
  lastDeliveredAt: Date | null
  lastFailureAt: Date | null
  lastFailureReason: string | null
  createdAt: Date
  updatedAt: Date
}

let endpointStore: EndpointRecord[] = []
const dbUpdates: Array<Record<string, unknown>> = []

// Tracks the WHERE condition values passed to update().where() so we can
// identify which endpoint was updated.
let lastUpdatePayload: Record<string, unknown> = {}
let lastUpdateWhereId: string | null = null

const db = {
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      innerJoin: (_joined: unknown, _on: unknown) => ({
        where: (_condition: unknown) => {
          // Return all active endpoints (filtering is done by the dispatcher in JS)
          return Promise.resolve(
            endpointStore.filter((ep) => ep.status === 'active'),
          )
        },
      }),
    }),
  }),
  update: (_table: unknown) => ({
    set(payload: Record<string, unknown>) {
      lastUpdatePayload = { ...payload }
      return {
        where: async (condition: { right?: string }) => {
          lastUpdateWhereId = condition.right ?? null
          const ep = endpointStore.find((e) => e.id === lastUpdateWhereId)
          if (ep) {
            if ('failureCount' in payload) {
              // Handle the sql`failureCount + 1` sentinel — the dispatcher passes
              // a drizzle sql tag object. We simulate increment here.
              ep.failureCount += 1
            }
            if ('status' in payload) ep.status = payload.status as string
            if ('lastDeliveredAt' in payload) ep.lastDeliveredAt = payload.lastDeliveredAt as Date
            if ('lastFailureAt' in payload) ep.lastFailureAt = payload.lastFailureAt as Date
            if ('lastFailureReason' in payload) ep.lastFailureReason = payload.lastFailureReason as string
            if ('updatedAt' in payload) ep.updatedAt = payload.updatedAt as Date
          }
          dbUpdates.push({ id: lastUpdateWhereId, ...payload })
        },
      }
    },
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/app-webhook-endpoints', () => ({ appWebhookEndpoints }))
mock.module('~/db/schema/apps', () => ({ appRegistry }))
mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
  sql: new Proxy(
    (strings: TemplateStringsArray, ..._values: unknown[]) => strings.join(''),
    {
      get: (_target, prop) => prop,
    },
  ),
  relations: () => ({}),
  inArray: (left: unknown, right: unknown) => ({ left, right }),
}))
mock.module('@coms-portal/shared', () => ({
  PORTAL_WEBHOOK_CONTRACT_VERSION: 1,
  PORTAL_WEBHOOK_SIGNATURE_HEADER: 'X-Portal-Signature',
  PORTAL_WEBHOOK_EVENT_HEADER: 'X-Portal-Event',
  PORTAL_WEBHOOK_EVENT_ID_HEADER: 'X-Portal-Event-Id',
  PORTAL_WEBHOOK_TIMESTAMP_HEADER: 'X-Portal-Timestamp',
  PORTAL_WEBHOOK_EVENTS: ['session.revoked', 'user.provisioned', 'user.updated', 'user.offboarded'],
}))

const { verifyWebhookSignature, signWebhookBody, dispatchPortalWebhook } =
  await import('../webhook-dispatcher')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides: Partial<EndpointRecord> = {}): EndpointRecord {
  return {
    id: `ep-${Math.random().toString(36).slice(2)}`,
    appId: 'app-1',
    appSlug: 'heroes',
    url: 'https://heroes.ahacommerce.net/webhooks',
    secret: 'super-secret',
    subscribedEvents: ['session.revoked'],
    status: 'active',
    failureCount: 0,
    lastDeliveredAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. Signing / verification (pure unit)
// ---------------------------------------------------------------------------

describe('signWebhookBody', () => {
  test('produces the sha256=<hex> format', () => {
    const sig = signWebhookBody('my-secret', '2026-04-20T00:00:00.000Z', '{"hello":"world"}')
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  test('round-trip: sign then verify returns true for same inputs', () => {
    const secret = 'round-trip-secret'
    const timestamp = new Date().toISOString()
    const body = JSON.stringify({ event: 'session.revoked', userId: 'u-1' })

    const sig = signWebhookBody(secret, timestamp, body)
    expect(verifyWebhookSignature(secret, timestamp, body, sig)).toBe(true)
  })
})

describe('verifyWebhookSignature', () => {
  const secret = 'verify-secret'
  const timestamp = '2026-04-20T00:00:00.000Z'
  const body = '{"event":"user.provisioned"}'

  test('returns true for a correctly signed body', () => {
    const sig = signWebhookBody(secret, timestamp, body)
    expect(verifyWebhookSignature(secret, timestamp, body, sig)).toBe(true)
  })

  test('returns false when the secret is wrong', () => {
    const sig = signWebhookBody(secret, timestamp, body)
    expect(verifyWebhookSignature('wrong-secret', timestamp, body, sig)).toBe(false)
  })

  test('returns false when the timestamp is tampered', () => {
    const sig = signWebhookBody(secret, timestamp, body)
    expect(verifyWebhookSignature(secret, '2026-01-01T00:00:00.000Z', body, sig)).toBe(false)
  })

  test('returns false when the body is tampered', () => {
    const sig = signWebhookBody(secret, timestamp, body)
    expect(verifyWebhookSignature(secret, timestamp, '{"event":"tampered"}', sig)).toBe(false)
  })

  test('returns false when the signature is missing the sha256= prefix', () => {
    const sig = signWebhookBody(secret, timestamp, body)
    // Strip the "sha256=" prefix to simulate a malformed header
    const malformed = sig.replace('sha256=', '')
    expect(verifyWebhookSignature(secret, timestamp, body, malformed)).toBe(false)
  })

  test('returns false when the signature has wrong length', () => {
    expect(verifyWebhookSignature(secret, timestamp, body, 'sha256=abc')).toBe(false)
  })

  test('returns false for an empty signature header', () => {
    expect(verifyWebhookSignature(secret, timestamp, body, '')).toBe(false)
  })

  // Constant-time-ish: we cannot measure timing in a unit test, but we verify
  // that a length-mismatched header still returns false (not an early true).
  test('returns false on length mismatch without short-circuit equality', () => {
    const sig = signWebhookBody(secret, timestamp, body)
    // Append a char so the lengths differ
    expect(verifyWebhookSignature(secret, timestamp, body, sig + 'x')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Dispatcher DB filtering (integration-ish, mock fetch)
// ---------------------------------------------------------------------------

describe('dispatchPortalWebhook', () => {
  beforeEach(() => {
    endpointStore = []
    dbUpdates.length = 0
    lastUpdatePayload = {}
    lastUpdateWhereId = null
    enqueueWebhookDeliveryMock.mockClear()
  })

  // Helper: build a fetch stub that always returns 2xx
  function okFetch(): typeof fetch {
    return mock(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
  }

  // Helper: build a fetch stub that always returns an error status
  function failFetch(status = 500): typeof fetch {
    return mock(
      async () => new Response(null, { status, statusText: 'Internal Server Error' }),
    ) as unknown as typeof fetch
  }

  test('delivers only to endpoints subscribed to the event', async () => {
    const subscribedFetch = okFetch()
    const subscribedEp = makeEndpoint({
      id: 'ep-subscribed',
      subscribedEvents: ['session.revoked'],
    })
    const unsubscribedEp = makeEndpoint({
      id: 'ep-unsubscribed',
      subscribedEvents: ['user.provisioned'], // does NOT include session.revoked
    })
    endpointStore.push(subscribedEp, unsubscribedEp)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-1' }, { fetchImpl: subscribedFetch })

    // Allow microtasks from fire-and-forget promises to settle
    await new Promise((r) => setTimeout(r, 0))

    expect(subscribedFetch).toHaveBeenCalledTimes(1)
    const calledUrl = (subscribedFetch as unknown as ReturnType<typeof mock>).mock.calls[0][0]
    expect(calledUrl).toBe(subscribedEp.url)
  })

  test('delivers only to active endpoints', async () => {
    const fetchImpl = okFetch()
    const activeEp = makeEndpoint({ id: 'ep-active', status: 'active', subscribedEvents: ['session.revoked'] })
    const disabledEp = makeEndpoint({ id: 'ep-disabled', status: 'disabled', subscribedEvents: ['session.revoked'] })
    endpointStore.push(activeEp, disabledEp)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-2' }, { fetchImpl })
    await new Promise((r) => setTimeout(r, 0))

    // Only the active endpoint should have been contacted
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('filters to specified appSlugs when opts.appSlugs is provided', async () => {
    const fetchImpl = okFetch()
    const heroesEp = makeEndpoint({ id: 'ep-heroes', appSlug: 'heroes', subscribedEvents: ['session.revoked'] })
    const orbitEp = makeEndpoint({ id: 'ep-orbit', appSlug: 'orbit', subscribedEvents: ['session.revoked'] })
    endpointStore.push(heroesEp, orbitEp)

    // The DB mock always returns all active rows; appSlugs filtering is delegated to
    // the SQL WHERE clause which we cannot easily emulate in the stub — override the
    // select stub just for this test to respect the slugs filter.
    const originalSelect = db.select
    db.select = (_fields: unknown) => ({
      from: (_table: unknown) => ({
        innerJoin: (_joined: unknown, _on: unknown) => ({
          where: (_condition: unknown) => {
            // Simulate what the SQL WHERE appSlugs filter would do
            return Promise.resolve(
              endpointStore.filter((ep) => ep.status === 'active' && ep.appSlug === 'heroes'),
            )
          },
        }),
      }),
    })

    await dispatchPortalWebhook('session.revoked', { userId: 'u-3' }, {
      fetchImpl,
      appSlugs: ['heroes'],
    })
    await new Promise((r) => setTimeout(r, 0))

    db.select = originalSelect

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const calledUrl = (fetchImpl as unknown as ReturnType<typeof mock>).mock.calls[0][0]
    expect(calledUrl).toBe(heroesEp.url)
  })

  test('on 2xx response, updates lastDeliveredAt and resets failureCount to 0', async () => {
    const ep = makeEndpoint({ id: 'ep-ok', subscribedEvents: ['session.revoked'], failureCount: 3 })
    endpointStore.push(ep)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-4' }, { fetchImpl: okFetch() })
    await new Promise((r) => setTimeout(r, 0))

    // The success handler sets failureCount: 0 and lastDeliveredAt
    const successUpdate = dbUpdates.find(
      (u) => u.id === ep.id && u.failureCount === 0,
    )
    expect(successUpdate).toBeDefined()
    expect(successUpdate!.lastDeliveredAt).toBeInstanceOf(Date)
  })

  test('on non-2xx, increments failureCount and sets lastFailureReason', async () => {
    const ep = makeEndpoint({ id: 'ep-fail', subscribedEvents: ['session.revoked'], failureCount: 0 })
    endpointStore.push(ep)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-5' }, { fetchImpl: failFetch(503) })
    await new Promise((r) => setTimeout(r, 10))

    // failureCount should have been incremented in the store
    expect(ep.failureCount).toBeGreaterThanOrEqual(1)
    expect(ep.lastFailureReason).toContain('503')
  })

  // On first-attempt failure the dispatcher hands retry off to Cloud Tasks
  // instead of inserting a DB job. The queue config (max_attempts, backoff)
  // owns the retry schedule; the delivery handler disables the endpoint
  // inline on the final failed attempt.
  test('on failure, enqueues a Cloud Task with the original event payload', async () => {
    const ep = makeEndpoint({
      id: 'ep-enqueue',
      subscribedEvents: ['session.revoked'],
      failureCount: 0,
    })
    endpointStore.push(ep)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-6' }, { fetchImpl: failFetch(500) })
    await new Promise((r) => setTimeout(r, 10))

    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledTimes(1)
    const calls = (enqueueWebhookDeliveryMock as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const payload = calls[0][0] as {
      endpointId: string
      event: string
      eventId: string
      jsonBody: string
      occurredAt: string
    }
    expect(payload.endpointId).toBe(ep.id)
    expect(payload.event).toBe('session.revoked')
    expect(typeof payload.eventId).toBe('string')
    expect(typeof payload.occurredAt).toBe('string')
    // The jsonBody is the same envelope that was attempted inline — preserving
    // it byte-for-byte is required for HMAC signature stability.
    expect(payload.jsonBody).toContain('"event":"session.revoked"')
    expect(payload.jsonBody).toContain('"userId":"u-6"')
  })

  test('on first failure, endpoint status remains active (delivery handler disables only on the final retry)', async () => {
    const ep = makeEndpoint({
      id: 'ep-no-disable',
      subscribedEvents: ['session.revoked'],
      failureCount: 0,
    })
    endpointStore.push(ep)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-7' }, { fetchImpl: failFetch(500) })
    await new Promise((r) => setTimeout(r, 10))

    // The dispatcher never disables the endpoint on inline failure — disable
    // happens inside the Cloud Tasks delivery handler on the final attempt.
    expect(ep.status).toBe('active')
  })
})
