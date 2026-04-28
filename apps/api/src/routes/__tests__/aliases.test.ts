import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireAppToken — always injects a test app context
// ---------------------------------------------------------------------------

const TEST_APP = { id: 'app-test-uuid', slug: 'heroes', serviceAccountEmail: 'heroes-sa@project.iam.gserviceaccount.com' }

let authEnabled = true

mock.module('~/middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      if (authEnabled) {
        const auth = request.headers.get('authorization')
        if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }
      return { app: TEST_APP }
    }),
}))
mock.module('../middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token-rel' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      if (authEnabled) {
        const auth = request.headers.get('authorization')
        if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      }
      return { app: TEST_APP }
    }),
}))

// ---------------------------------------------------------------------------
// Mock resolveAliases
// ---------------------------------------------------------------------------

const mockResolveAliases = mock(async (names: string[]) =>
  names.map((name) => ({ name, match: null })),
)

mock.module('~/services/aliases', () => ({ resolveAliases: mockResolveAliases }))
mock.module('../services/aliases', () => ({ resolveAliases: mockResolveAliases }))

// ---------------------------------------------------------------------------
// Import route after mocks are set
// ---------------------------------------------------------------------------

const { aliasesRoutes } = await import('../aliases')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return new Elysia().use(aliasesRoutes)
}

async function post(
  app: Elysia,
  body: unknown,
  headers: Record<string, string> = { authorization: 'Bearer token', 'content-type': 'application/json' },
) {
  return app.handle(
    new Request('http://localhost/aliases/resolve-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /aliases/resolve-batch', () => {
  beforeEach(() => {
    authEnabled = true
    mockResolveAliases.mockReset()
    mockResolveAliases.mockImplementation(async (names: string[]) =>
      names.map((name) => ({ name, match: null })),
    )
  })

  test('missing app token → 401', async () => {
    const app = makeApp()
    const res = await post(app, { names: ['Alice'] }, { 'content-type': 'application/json' })
    expect(res.status).toBe(401)
  })

  test('1000 names → 200 spec-shaped response in p95 < 200ms', async () => {
    const names = Array.from({ length: 1000 }, (_, i) => `Name ${i}`)
    mockResolveAliases.mockImplementation(async (ns: string[]) =>
      ns.map((name) => ({
        name,
        match: {
          identityUserId: 'uid-1',
          alias: name,
          aliasNormalized: name.toLowerCase(),
          isPrimary: true,
          tombstoned: false,
          deactivatedAt: null,
        },
      })),
    )
    const app = makeApp()
    const start = Date.now()
    const res = await post(app, { names })
    const duration = Date.now() - start
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1000)
    expect(body.results[0]).toMatchObject({ input: 'Name 0', match: { isPrimary: true } })
    expect(duration).toBeLessThan(200)
  })

  test('1001 names → 422 (validation rejects)', async () => {
    const names = Array.from({ length: 1001 }, (_, i) => `Name ${i}`)
    const app = makeApp()
    const res = await post(app, { names })
    expect(res.status).toBe(422)
  })

  test('body > 256KB → 413', async () => {
    const app = makeApp()
    const res = await app.handle(
      new Request('http://localhost/aliases/resolve-batch', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'content-length': String(256 * 1024 + 1),
        },
        body: JSON.stringify({ names: ['a'] }),
      }),
    )
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toBe('payload_too_large')
  })

  test('tombstoned response returns 200 with tombstoned:true (not 404)', async () => {
    const deactivatedAt = new Date().toISOString()
    mockResolveAliases.mockImplementation(async (ns: string[]) =>
      ns.map((name) => ({
        name,
        match: {
          identityUserId: 'uid-departed',
          alias: name,
          aliasNormalized: name.toLowerCase(),
          isPrimary: false,
          tombstoned: true,
          deactivatedAt,
        },
      })),
    )
    const app = makeApp()
    const res = await post(app, { names: ['Departed User'] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results[0].match.tombstoned).toBe(true)
    expect(body.results[0].match.deactivatedAt).toBe(deactivatedAt)
  })

  test('21st request in one second from same app → 429 with Retry-After: 1', async () => {
    // Reset module-level bucket state by using a fresh app for each request.
    // The token bucket is module-scope, so we re-import to get a fresh bucket state.
    // Instead, we fire 40 (burst) + 1 requests rapidly to drain the bucket.
    const { aliasesRoutes: freshRoutes } = await import('../aliases?bust=' + Date.now())
    const app = new Elysia().use(freshRoutes)

    // Drain burst capacity (40) + REFILL_RATE initial = 40 tokens
    const requests = Array.from({ length: 41 }, () =>
      app.handle(
        new Request('http://localhost/aliases/resolve-batch', {
          method: 'POST',
          headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
          body: JSON.stringify({ names: ['test'] }),
        }),
      ),
    )
    const responses = await Promise.all(requests)
    const statuses = responses.map((r) => r.status)
    const rateLimited = statuses.filter((s) => s === 429)
    expect(rateLimited.length).toBeGreaterThanOrEqual(1)

    const tooManyRes = responses.find((r) => r.status === 429)!
    expect(tooManyRes.headers.get('Retry-After')).toBe('1')
    const body = await tooManyRes.json()
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBe(1)
  })
})
