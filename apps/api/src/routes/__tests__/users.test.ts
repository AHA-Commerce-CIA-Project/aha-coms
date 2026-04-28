import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireAppToken — controls app context and auth failure via mutable state
// ---------------------------------------------------------------------------

const DEFAULT_APP = { id: 'app-uuid-1', slug: 'heroes', serviceAccountEmail: 'heroes@example.iam.gserviceaccount.com' }

let mockApp = { ...DEFAULT_APP }
let authFail: { status: number; body: Record<string, unknown> } | null = null

mock.module('~/middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      if (authFail) throw status(authFail.status, authFail.body)
      const auth = request.headers.get('authorization')
      if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      return { app: mockApp }
    }),
}))
mock.module('../middleware/app-token', () => ({
  requireAppToken: () =>
    new Elysia({ name: 'mock-require-app-token-rel' }).derive({ as: 'scoped' }, async ({ request, status }) => {
      if (authFail) throw status(authFail.status, authFail.body)
      const auth = request.headers.get('authorization')
      if (!auth) throw status(401, { error: 'unauthorized', reason: 'missing_token' })
      return { app: mockApp }
    }),
}))

// ---------------------------------------------------------------------------
// Mock DB and schema
// ---------------------------------------------------------------------------

const appRegistry = { id: 'appRegistry.id', slug: 'appRegistry.slug' }
const appUserConfig = {
  portalSub: 'appUserConfig.portalSub',
  appId: 'appUserConfig.appId',
  config: 'appUserConfig.config',
  schemaVersion: 'appUserConfig.schemaVersion',
  updatedAt: 'appUserConfig.updatedAt',
}

interface ConfigRow {
  portalSub: string
  appId: string
  config: Record<string, unknown>
  schemaVersion: number
  updatedAt: Date
}

let mockConfigRow: ConfigRow | null = null

const db = {
  select: (_fields: unknown) => ({
    from: (_table: unknown) => ({
      innerJoin: (_table2: unknown, _cond: unknown) => ({
        where: (_cond: unknown) => ({
          limit: async () => (mockConfigRow ? [mockConfigRow] : []),
        }),
      }),
    }),
  }),
}

mock.module('~/db', () => ({ db }))
mock.module('~/db/schema/apps', () => ({ appRegistry }))
mock.module('~/db/schema/app-user-config', () => ({ appUserConfig }))
mock.module('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ l, r }),
  and: (...args: unknown[]) => ({ args }),
  sql: new Proxy((s: TemplateStringsArray) => s.join(''), { get: (_t, p) => p }),
  relations: () => ({}),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  index: () => ({ on: () => ({}) }),
  unique: () => ({ on: () => ({}) }),
  inArray: (l: unknown, r: unknown) => ({ l, r }),
}))

// ---------------------------------------------------------------------------
// Import route after mocks
// ---------------------------------------------------------------------------

const { userRoutes } = await import('../users')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return new Elysia().use(userRoutes)
}

type TestApp = ReturnType<typeof makeApp>

async function get(app: TestApp, path: string, headers: Record<string, string> = {}) {
  return app.handle(new Request(`http://localhost${path}`, { headers }))
}

function resetState() {
  mockApp = { ...DEFAULT_APP }
  authFail = null
  mockConfigRow = null
}

const validConfigRow: ConfigRow = {
  portalSub: 'user-uuid-1',
  appId: 'heroes',
  config: { role: 'member', leaderboard_eligible: true },
  schemaVersion: 1,
  updatedAt: new Date('2026-04-28T10:00:00.000Z'),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /users/:portalSub/config/:appId', () => {
  beforeEach(resetState)

  test('returns spec-shaped response on hit', async () => {
    mockConfigRow = validConfigRow
    const app = makeApp()

    const res = await get(app, '/users/user-uuid-1/config/heroes', { Authorization: 'Bearer valid-token' })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.portalSub).toBe('user-uuid-1')
    expect(body.appId).toBe('heroes')
    expect(body.config).toEqual({ role: 'member', leaderboard_eligible: true })
    expect(body.schemaVersion).toBe(1)
    expect(body.updatedAt).toBe('2026-04-28T10:00:00.000Z')
  })

  test('returns 404 when config row not found', async () => {
    mockConfigRow = null
    const app = makeApp()

    const res = await get(app, '/users/user-uuid-1/config/heroes', { Authorization: 'Bearer valid-token' })

    expect(res.status).toBe(404)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('not_found')
  })

  test('returns 403 when appId param does not match caller app slug', async () => {
    mockConfigRow = validConfigRow
    mockApp = { id: 'app-uuid-2', slug: 'orbit', serviceAccountEmail: 'orbit@example.iam.gserviceaccount.com' }
    const app = makeApp()

    const res = await get(app, '/users/user-uuid-1/config/heroes', { Authorization: 'Bearer valid-token' })

    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.reason).toBe('app_mismatch')
  })

  test('returns 401 when Authorization header is missing', async () => {
    const app = makeApp()

    const res = await get(app, '/users/user-uuid-1/config/heroes')

    expect(res.status).toBe(401)
  })
})
