import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock verifyGoogleOidcToken before importing the module under test
// ---------------------------------------------------------------------------

const mockVerifyGoogleOidcToken = mock(async (_header: string, _audience: string) => ({
  email: 'heroes-sa@project.iam.gserviceaccount.com',
  sub: 'some-sub',
}))

mock.module('~/services/oidc-verifier', () => ({
  verifyGoogleOidcToken: mockVerifyGoogleOidcToken,
}))

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

type AppRow = {
  id: string
  slug: string
  serviceAccountEmail: string
  status: string
}

let appStore: AppRow[] = []

const mockDb = {
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => ({
        limit: (_n: number) =>
          Promise.resolve(
            appStore.filter(
              (a) =>
                a.serviceAccountEmail === currentEmail && a.status === 'active',
            ),
          ),
      }),
    }),
  }),
}

mock.module('~/db', () => ({ db: mockDb }))
mock.module('~/db/schema/apps', () => ({
  appRegistry: {
    id: 'appRegistry.id',
    slug: 'appRegistry.slug',
    serviceAccountEmail: 'appRegistry.serviceAccountEmail',
    status: 'appRegistry.status',
  },
}))
mock.module('drizzle-orm', () => ({
  eq: (_left: unknown, _right: unknown) => ({}),
  and: (..._args: unknown[]) => ({}),
}))

// ---------------------------------------------------------------------------
// State shared between mock implementations
// ---------------------------------------------------------------------------

let currentEmail = 'heroes-sa@project.iam.gserviceaccount.com'

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

const { requireAppToken } = await import('../app-token')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return new Elysia()
    .use(requireAppToken())
    .get('/test', ({ app }) => ({ ok: true, app }))
}

type TestApp = ReturnType<typeof makeApp>

async function request(app: TestApp, headers: Record<string, string> = {}) {
  return app.handle(
    new Request('http://localhost/test', { headers }),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireAppToken', () => {
  beforeEach(() => {
    appStore = []
    currentEmail = 'heroes-sa@project.iam.gserviceaccount.com'
    mockVerifyGoogleOidcToken.mockReset()
    mockVerifyGoogleOidcToken.mockImplementation(async () => ({
      email: currentEmail,
      sub: 'sub-123',
    }))
  })

  test('missing Authorization header → 401 with reason missing_token', async () => {
    const app = makeApp()
    const res = await request(app)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
    expect(body.reason).toBe('missing_token')
  })

  test('valid OIDC token but email not in app_registry → 403 app_not_registered', async () => {
    appStore = [] // no matching app
    const app = makeApp()
    const res = await request(app, { authorization: 'Bearer valid-token' })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
    expect(body.reason).toBe('app_not_registered')
    expect(body.email).toBe(currentEmail)
  })

  test('valid OIDC token with matching active app → handler runs with app context', async () => {
    appStore = [
      {
        id: 'app-uuid-1',
        slug: 'heroes',
        serviceAccountEmail: currentEmail,
        status: 'active',
      },
    ]
    const app = makeApp()
    const res = await request(app, { authorization: 'Bearer valid-token' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.app.id).toBe('app-uuid-1')
    expect(body.app.slug).toBe('heroes')
    expect(body.app.serviceAccountEmail).toBe(currentEmail)
  })

  test('valid OIDC token but app status=inactive → 403', async () => {
    currentEmail = 'inactive-sa@project.iam.gserviceaccount.com'
    mockVerifyGoogleOidcToken.mockImplementation(async () => ({
      email: currentEmail,
      sub: 'sub-inactive',
    }))
    appStore = [
      {
        id: 'app-uuid-2',
        slug: 'inactive-app',
        serviceAccountEmail: currentEmail,
        status: 'inactive',
      },
    ]
    const app = makeApp()
    const res = await request(app, { authorization: 'Bearer valid-token' })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.reason).toBe('app_not_registered')
  })

  test('OIDC verification throws → 401', async () => {
    mockVerifyGoogleOidcToken.mockImplementation(async () => {
      throw new Error('Invalid signature')
    })
    const app = makeApp()
    const res = await request(app, { authorization: 'Bearer bad-token' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.reason).toBe('missing_token')
  })

  test('valid token + active app with different slug → correct app returned', async () => {
    currentEmail = 'orbit-sa@project.iam.gserviceaccount.com'
    mockVerifyGoogleOidcToken.mockImplementation(async () => ({
      email: currentEmail,
      sub: 'sub-orbit',
    }))
    appStore = [
      {
        id: 'app-uuid-3',
        slug: 'orbit',
        serviceAccountEmail: currentEmail,
        status: 'active',
      },
    ]
    const app = makeApp()
    const res = await request(app, { authorization: 'Bearer valid-token' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.app.slug).toBe('orbit')
  })
})
