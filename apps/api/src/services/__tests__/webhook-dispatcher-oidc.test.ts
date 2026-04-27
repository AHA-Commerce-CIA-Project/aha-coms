/**
 * Rev 2 §03 — Webhook dispatcher OIDC dual-mode tests.
 *
 * Covers:
 * 1. When metadata server is reachable: outbound fetch carries BOTH
 *    `Authorization: Bearer <token>` and `X-Portal-Signature` headers.
 * 2. When getIdTokenClient throws: dispatcher falls back to HMAC-only,
 *    no crash, warning is logged.
 * 3. Audience derivation: getIdTokenClient is called with new URL(endpoint.url).origin.
 * 4. Token caching: getIdTokenClient is called once per dispatchPortalWebhook
 *    invocation (the GoogleAuth instance is module-scoped; caching is internal
 *    to the SDK's IdTokenClient across repeated calls for the same audience).
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Schema stubs (mirrors what webhook-dispatcher.test.ts sets up)
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
// GoogleAuth mock — controllable per test
// ---------------------------------------------------------------------------

// getRequestHeaders returns a Headers-like object (Web fetch Headers API);
// we stub it with a minimal .get() implementation so the implementation's
// headers.get('Authorization') call works correctly.
function makeHeaders(authValue: string): { get: (name: string) => string | null } {
  return {
    get: (name: string) => (name.toLowerCase() === 'authorization' ? authValue : null),
  }
}

let getIdTokenClientImpl: (audience: string) => Promise<{
  getRequestHeaders: () => Promise<{ get: (name: string) => string | null }>
}>

const mockGetIdTokenClient = mock(async (audience: string) => getIdTokenClientImpl(audience))

// Capture the real google-auth-library module BEFORE applying our stub so
// afterAll can restore it. Bun's mock.module is process-global and survives
// across test files; without restoration, downstream files that touch
// signing-keys (which imports GoogleAuth) inherit our class with a fixed
// getIdTokenClient field, breaking their assumptions.
//
// Spread INTO a fresh object: bun's mock.module rebinds the live namespace
// in place, so a captured namespace reference would itself become the stub
// the instant `mock.module` runs. Spreading copies the real export
// references out before the rebind happens.
const realGoogleAuthLibrary = { ...(await import('google-auth-library')) }

mock.module('google-auth-library', () => ({
  GoogleAuth: class {
    getIdTokenClient = mockGetIdTokenClient
  },
  OAuth2Client: class {},
}))

// ---------------------------------------------------------------------------
// Cloud Tasks / DB / drizzle stubs
// ---------------------------------------------------------------------------

const enqueueWebhookDeliveryMock = mock(async () => {})

mock.module('../cloud-tasks-client', () => ({
  enqueueWebhookDelivery: enqueueWebhookDeliveryMock,
}))

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

const db = {
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      innerJoin: (_joined: unknown, _on: unknown) => ({
        where: (_condition: unknown) =>
          Promise.resolve(endpointStore.filter((ep) => ep.status === 'active')),
      }),
    }),
  }),
  update: (_table: unknown) => ({
    set(_payload: Record<string, unknown>) {
      return { where: async () => {} }
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
    { get: (_target, prop) => prop },
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
  PORTAL_WEBHOOK_EVENTS: ['session.revoked', 'user.provisioned'],
}))

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

const { dispatchPortalWebhook, mintWebhookAudienceToken } = await import('../webhook-dispatcher')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENDPOINT_URL = 'https://heroes.ahacommerce.net/webhooks/portal'
const ENDPOINT_ORIGIN = 'https://heroes.ahacommerce.net'
const FAKE_TOKEN = 'ey.fake.oidc.token'

function makeEndpoint(overrides: Partial<EndpointRecord> = {}): EndpointRecord {
  return {
    id: `ep-${Math.random().toString(36).slice(2)}`,
    appId: 'app-1',
    appSlug: 'heroes',
    url: ENDPOINT_URL,
    secret: 'hmac-secret',
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

function okFetch(): typeof fetch {
  return mock(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webhook-dispatcher OIDC dual-mode (Rev 2 §03)', () => {
  // Restore the real google-auth-library after this file's tests so its
  // GoogleAuth stub does not leak into sibling files. Order-independent.
  afterAll(() => {
    mock.module('google-auth-library', () => realGoogleAuthLibrary)
  })

  beforeEach(() => {
    endpointStore = []
    enqueueWebhookDeliveryMock.mockClear()
    mockGetIdTokenClient.mockClear()

    // Default: metadata server is reachable and returns a valid token
    getIdTokenClientImpl = async (_audience: string) => ({
      getRequestHeaders: async () => makeHeaders(`Bearer ${FAKE_TOKEN}`),
    })
  })

  // -------------------------------------------------------------------------
  // 1. Dual-mode: both Authorization and X-Portal-Signature are set
  // -------------------------------------------------------------------------

  test('outbound fetch carries both Authorization: Bearer and X-Portal-Signature headers when OIDC token is available', async () => {
    const ep = makeEndpoint({ id: 'ep-dual' })
    endpointStore.push(ep)

    const fetchSpy = okFetch()
    await dispatchPortalWebhook('session.revoked', { userId: 'u-1' }, { fetchImpl: fetchSpy })
    await new Promise((r) => setTimeout(r, 10))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [_url, init] = (fetchSpy as unknown as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>

    expect(headers['Authorization']).toBe(`Bearer ${FAKE_TOKEN}`)
    expect(headers['X-Portal-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  // -------------------------------------------------------------------------
  // 2. Fallback: metadata-server failure → HMAC-only, no crash
  // -------------------------------------------------------------------------

  test('proceeds with HMAC-only when getIdTokenClient throws, no crash', async () => {
    getIdTokenClientImpl = async (_audience: string) => {
      throw new Error('metadata server not available')
    }

    const ep = makeEndpoint({ id: 'ep-hmac-only' })
    endpointStore.push(ep)

    const warnSpy = mock(console.warn.bind(console))
    const originalWarn = console.warn
    console.warn = warnSpy

    const fetchSpy = okFetch()
    let thrown = false
    try {
      await dispatchPortalWebhook('session.revoked', { userId: 'u-2' }, { fetchImpl: fetchSpy })
      await new Promise((r) => setTimeout(r, 10))
    } catch {
      thrown = true
    } finally {
      console.warn = originalWarn
    }

    expect(thrown).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [_url, init] = (fetchSpy as unknown as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>

    // HMAC header still present
    expect(headers['X-Portal-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
    // Authorization header absent (HMAC-only fallback)
    expect(headers['Authorization']).toBeUndefined()

    // Warning was logged
    expect(warnSpy.mock.calls.some((args) => String(args[0]).includes('OIDC token minting failed'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 3. Audience derivation: getIdTokenClient called with URL origin
  // -------------------------------------------------------------------------

  test('getIdTokenClient is called with the origin of the endpoint URL as audience', async () => {
    const ep = makeEndpoint({ id: 'ep-audience', url: ENDPOINT_URL })
    endpointStore.push(ep)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-3' }, { fetchImpl: okFetch() })
    await new Promise((r) => setTimeout(r, 10))

    expect(mockGetIdTokenClient).toHaveBeenCalledWith(ENDPOINT_ORIGIN)
  })

  // -------------------------------------------------------------------------
  // 4. Token caching: single dispatch = single getIdTokenClient call per endpoint
  // -------------------------------------------------------------------------

  test('getIdTokenClient is called once per endpoint per dispatch invocation', async () => {
    const ep = makeEndpoint({ id: 'ep-cache' })
    endpointStore.push(ep)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-4' }, { fetchImpl: okFetch() })
    await new Promise((r) => setTimeout(r, 10))

    // One endpoint → one getIdTokenClient call in this dispatch
    expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1)
  })

  test('two endpoints with the same origin each call getIdTokenClient once (SDK caches internally)', async () => {
    const ep1 = makeEndpoint({ id: 'ep-cache-a', url: 'https://heroes.ahacommerce.net/webhooks/a', subscribedEvents: ['session.revoked'] })
    const ep2 = makeEndpoint({ id: 'ep-cache-b', url: 'https://heroes.ahacommerce.net/webhooks/b', subscribedEvents: ['session.revoked'] })
    endpointStore.push(ep1, ep2)

    await dispatchPortalWebhook('session.revoked', { userId: 'u-5' }, { fetchImpl: okFetch() })
    await new Promise((r) => setTimeout(r, 10))

    // Both endpoints share the same origin; getIdTokenClient is called once
    // per endpoint (the SDK's IdTokenClient instance handles caching internally).
    // We assert the call count equals the number of endpoints dispatched to.
    expect(mockGetIdTokenClient).toHaveBeenCalledTimes(2)
    expect(mockGetIdTokenClient.mock.calls.every(([aud]) => aud === ENDPOINT_ORIGIN)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // mintWebhookAudienceToken unit tests
  // -------------------------------------------------------------------------

  describe('mintWebhookAudienceToken', () => {
    test('returns the token string (no Bearer prefix) when metadata server is reachable', async () => {
      const token = await mintWebhookAudienceToken(ENDPOINT_ORIGIN)
      expect(token).toBe(FAKE_TOKEN)
    })

    test('returns null when getIdTokenClient throws', async () => {
      getIdTokenClientImpl = async () => {
        throw new Error('no metadata server')
      }
      const token = await mintWebhookAudienceToken(ENDPOINT_ORIGIN)
      expect(token).toBeNull()
    })

    test('returns null when getRequestHeaders returns a non-Bearer Authorization header', async () => {
      getIdTokenClientImpl = async (_audience: string) => ({
        getRequestHeaders: async () => makeHeaders('Basic something'),
      })
      const token = await mintWebhookAudienceToken(ENDPOINT_ORIGIN)
      expect(token).toBeNull()
    })
  })
})
