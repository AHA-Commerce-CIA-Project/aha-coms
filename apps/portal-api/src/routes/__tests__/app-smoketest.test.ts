/**
 * Tests for POST /apps/:id/smoketest — Spec 06 (Rev 4) PR A.
 *
 * The route lives next to app-manifest.ts: same OIDC auth path
 * (`requireAppToken`), URL slug captured as `:id`, returns the registry
 * summary alongside per-endpoint dispatch results.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireAppToken — same shape as app-manifest.test.ts
// ---------------------------------------------------------------------------

const DEFAULT_APP = {
  id: 'app-uuid-1',
  slug: 'fast',
  serviceAccountEmail: 'fast@example.iam.gserviceaccount.com',
}

let mockApp = { ...DEFAULT_APP }
let authFail: { status: number; body: Record<string, unknown> } | null = null

mock.module('~/middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token-smoketest' }).derive(
      { as: 'scoped' },
      async ({ request, status }) => {
        if (authFail) throw status(authFail.status, authFail.body)
        const auth = request.headers.get('authorization')
        if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
        return { app: mockApp }
      },
    ),
}))
mock.module('../middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token-smoketest-rel' }).derive(
      { as: 'scoped' },
      async ({ request, status }) => {
        if (authFail) throw status(authFail.status, authFail.body)
        const auth = request.headers.get('authorization')
        if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
        return { app: mockApp }
      },
    ),
}))

// ---------------------------------------------------------------------------
// Mock webhook-dispatcher — capture the signed body + headers
// ---------------------------------------------------------------------------

mock.module('~/services/webhook-dispatcher', () => ({
  signWebhookBody: (_secret: string, _ts: string, body: string) =>
    `sha256=test-${body.length}`,
  mintWebhookAudienceToken: async () => null, // local-dev fallback, no Authorization header
}))
mock.module('../services/webhook-dispatcher', () => ({
  signWebhookBody: (_secret: string, _ts: string, body: string) =>
    `sha256=test-${body.length}`,
  mintWebhookAudienceToken: async () => null,
}))

// ---------------------------------------------------------------------------
// Mock @coms-portal/shared — only constants the route reads at runtime
// ---------------------------------------------------------------------------

mock.module('@coms-portal/shared', () => ({
  PORTAL_WEBHOOK_CONTRACT_VERSION: 1 as const,
  PORTAL_WEBHOOK_SIGNATURE_HEADER: 'X-Portal-Signature',
  PORTAL_WEBHOOK_EVENT_HEADER: 'X-Portal-Event',
  PORTAL_WEBHOOK_EVENT_ID_HEADER: 'X-Portal-Event-Id',
  PORTAL_WEBHOOK_TIMESTAMP_HEADER: 'X-Portal-Timestamp',
}))

// ---------------------------------------------------------------------------
// Mock db — table schema sentinels + a simulated drizzle query/select surface
// ---------------------------------------------------------------------------

interface AppRow {
  id: string
  slug: string
  name: string
  url: string
  status: string
  handoffMode: string
}

interface EndpointRow {
  id: string
  appId: string
  url: string
  secret: string
  status: 'active' | 'disabled'
  subscribedEvents: string[]
}

let appRow: AppRow | null = {
  id: DEFAULT_APP.id,
  slug: DEFAULT_APP.slug,
  name: 'Fast',
  url: 'https://fast.example.com',
  status: 'active',
  handoffMode: 'one_time_code',
}
let endpointRows: EndpointRow[] = []

const mockDb = {
  query: {
    appRegistry: {
      findFirst: async () => appRow,
    },
  },
  select: () => ({
    from: () => ({
      where: () => ({
        // No further chaining — the route awaits this directly.
        then: (resolve: (v: EndpointRow[]) => unknown) => resolve(endpointRows),
      }),
    }),
  }),
}

mock.module('~/db', () => ({ db: mockDb }))
mock.module('../../db', () => ({ db: mockDb }))

mock.module('~/db/schema', () => ({
  appRegistry: {
    id: 'appRegistry.id',
    slug: 'appRegistry.slug',
    name: 'appRegistry.name',
    url: 'appRegistry.url',
    status: 'appRegistry.status',
    handoffMode: 'appRegistry.handoffMode',
  },
  appWebhookEndpoints: {
    id: 'appWebhookEndpoints.id',
    appId: 'appWebhookEndpoints.appId',
    url: 'appWebhookEndpoints.url',
    secret: 'appWebhookEndpoints.secret',
    status: 'appWebhookEndpoints.status',
    subscribedEvents: 'appWebhookEndpoints.subscribedEvents',
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
}))

const { appSmoketestRoutes } = await import('../app-smoketest')

// ---------------------------------------------------------------------------
// Capture outbound fetches — the route's per-endpoint dispatcher
// ---------------------------------------------------------------------------

interface CapturedFetch {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

let captured: CapturedFetch[] = []
let fetchResponses: (() => Response | Promise<Response>)[] = []

const originalFetch = globalThis.fetch
function installFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const headerEntries: [string, string][] = []
    const h = init?.headers
    if (h) {
      if (h instanceof Headers) {
        h.forEach((v, k) => headerEntries.push([k, v]))
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headerEntries.push([k, v])
      } else {
        for (const [k, v] of Object.entries(h)) headerEntries.push([k, String(v)])
      }
    }
    const headers = Object.fromEntries(
      headerEntries.map(([k, v]) => [k.toLowerCase(), v]),
    )
    captured.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : '',
    })
    const next = fetchResponses.shift()
    return next ? await next() : new Response('', { status: 200 })
  }) as typeof fetch
}
function restoreFetch() {
  globalThis.fetch = originalFetch
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return new Elysia().use(appSmoketestRoutes)
}

async function postSmoketest(
  app: ReturnType<typeof makeApp>,
  slug: string,
  headers: Record<string, string> = {},
) {
  return app.handle(
    new Request(`http://localhost/apps/${slug}/smoketest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  )
}

function reset() {
  mockApp = { ...DEFAULT_APP }
  authFail = null
  appRow = {
    id: DEFAULT_APP.id,
    slug: DEFAULT_APP.slug,
    name: 'Fast',
    url: 'https://fast.example.com',
    status: 'active',
    handoffMode: 'one_time_code',
  }
  endpointRows = []
  captured = []
  fetchResponses = []
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /apps/:id/smoketest', () => {
  beforeEach(() => {
    reset()
    installFetch()
  })

  test('401 when Authorization is missing', async () => {
    const app = makeApp()
    const res = await postSmoketest(app, 'fast')
    expect(res.status).toBe(401)
    restoreFetch()
  })

  test('403 app_mismatch when caller slug differs from URL slug', async () => {
    mockApp = { ...DEFAULT_APP, slug: 'orbit', id: 'orbit-id' }
    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.reason).toBe('app_mismatch')
    restoreFetch()
  })

  test('404 when the app slug is not in the registry', async () => {
    appRow = null
    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('app_not_registered')
    restoreFetch()
  })

  test("409 when the app's registry row is not active (e.g. deprecated)", async () => {
    appRow = { ...appRow!, status: 'deprecated' }
    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('app_not_active')
    restoreFetch()
  })

  test('200 with empty endpoints[] when no webhook endpoints are registered', async () => {
    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.app).toMatchObject({
      id: DEFAULT_APP.id,
      slug: 'fast',
      status: 'active',
      handoffMode: 'one_time_code',
      url: 'https://fast.example.com',
    })
    expect(body.endpoints).toEqual([])
    expect(body.ok).toBe(true)
    expect(captured.length).toBe(0)
    restoreFetch()
  })

  test('200 dispatches a signed app.smoketest envelope to every active endpoint', async () => {
    endpointRows = [
      {
        id: 'ep-1',
        appId: DEFAULT_APP.id,
        url: 'https://fast.example.com/webhook',
        secret: 'secret-1',
        status: 'active',
        subscribedEvents: [],
      },
      {
        id: 'ep-2',
        appId: DEFAULT_APP.id,
        url: 'https://fast.example.com/other-hook',
        secret: 'secret-2',
        status: 'active',
        subscribedEvents: ['user.provisioned'],
      },
    ]
    fetchResponses = [
      () => new Response('', { status: 200 }),
      () => new Response('', { status: 200 }),
    ]

    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; endpoints: Array<Record<string, unknown>> }
    expect(body.ok).toBe(true)
    expect(body.endpoints.length).toBe(2)
    expect(body.endpoints.every((e) => e.status === 200)).toBe(true)
    expect(body.endpoints.every((e) => typeof e.latencyMs === 'number')).toBe(true)

    // Both endpoints received a request.
    expect(captured.length).toBe(2)
    const urls = captured.map((c) => c.url).sort()
    expect(urls).toEqual([
      'https://fast.example.com/other-hook',
      'https://fast.example.com/webhook',
    ])

    // Headers + body match the envelope contract.
    const first = captured[0]
    expect(first.method).toBe('POST')
    expect(first.headers['content-type']).toBe('application/json')
    expect(first.headers['x-portal-event']).toBe('app.smoketest')
    expect(first.headers['x-portal-event-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(first.headers['x-portal-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(first.headers['x-portal-signature']).toMatch(/^sha256=test-/)

    const envelope = JSON.parse(first.body) as Record<string, unknown>
    expect(envelope.contractVersion).toBe(1)
    expect(envelope.event).toBe('app.smoketest')
    expect(envelope.appSlug).toBe('fast')
    expect(typeof envelope.eventId).toBe('string')
    expect(typeof envelope.occurredAt).toBe('string')
    expect(envelope.payload).toBeDefined()

    restoreFetch()
  })

  test('200 with ok=false when an endpoint returns non-2xx', async () => {
    endpointRows = [
      {
        id: 'ep-1',
        appId: DEFAULT_APP.id,
        url: 'https://fast.example.com/broken',
        secret: 's',
        status: 'active',
        subscribedEvents: [],
      },
    ]
    fetchResponses = [() => new Response('boom', { status: 500, statusText: 'Server Error' })]

    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; endpoints: Array<Record<string, unknown>> }
    expect(body.ok).toBe(false)
    expect(body.endpoints.length).toBe(1)
    expect(body.endpoints[0].status).toBe(500)
    expect(body.endpoints[0].error).toContain('500')
    restoreFetch()
  })

  test('200 with ok=false when an endpoint throws (network error / timeout)', async () => {
    endpointRows = [
      {
        id: 'ep-1',
        appId: DEFAULT_APP.id,
        url: 'https://fast.example.com/unreachable',
        secret: 's',
        status: 'active',
        subscribedEvents: [],
      },
    ]
    fetchResponses = [
      () => {
        throw new Error('ECONNREFUSED')
      },
    ]

    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; endpoints: Array<Record<string, unknown>> }
    expect(body.ok).toBe(false)
    expect(body.endpoints.length).toBe(1)
    expect(body.endpoints[0].status).toBeNull()
    expect(body.endpoints[0].error).toContain('ECONNREFUSED')
    restoreFetch()
  })

  test('skips disabled endpoints (only active ones receive a smoketest envelope)', async () => {
    endpointRows = [
      {
        id: 'ep-active',
        appId: DEFAULT_APP.id,
        url: 'https://fast.example.com/active',
        secret: 's',
        status: 'active',
        subscribedEvents: [],
      },
      {
        id: 'ep-disabled',
        appId: DEFAULT_APP.id,
        url: 'https://fast.example.com/disabled',
        secret: 's',
        status: 'disabled',
        subscribedEvents: [],
      },
    ]
    fetchResponses = [() => new Response('', { status: 200 })]

    const app = makeApp()
    const res = await postSmoketest(app, 'fast', { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { endpoints: Array<Record<string, unknown>> }
    expect(body.endpoints.length).toBe(1)
    expect(body.endpoints[0].endpointId).toBe('ep-active')
    expect(captured.length).toBe(1)
    expect(captured[0].url).toBe('https://fast.example.com/active')
    restoreFetch()
  })
})
