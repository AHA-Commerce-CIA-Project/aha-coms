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
// Comprehensive barrel mock so later test files that import ~/db/schema don't get a stale incomplete mock
mock.module('~/db/schema', () => ({
  appRegistry: { id: 'appRegistry.id', slug: 'appRegistry.slug', serviceAccountEmail: 'appRegistry.serviceAccountEmail', status: 'appRegistry.status' },
  identityUsers: { id: 'iu.id', gipUid: 'iu.gipUid', email: 'iu.email', name: 'iu.name', portalRole: 'iu.portalRole', status: 'iu.status', portalSub: 'iu.portalSub', provisioningStatus: 'iu.provisioningStatus', provisioningError: 'iu.provisioningError', createdAt: 'iu.createdAt', updatedAt: 'iu.updatedAt' },
  sessionRevocations: { id: 'sr.id', userId: 'sr.userId', notBefore: 'sr.notBefore', reason: 'sr.reason', createdAt: 'sr.createdAt' },
  teamMembers: { teamId: 'tm.teamId', userId: 'tm.userId' },
  teamAppAccess: { teamId: 'ta.teamId', appId: 'ta.appId' },
  appWebhookEndpoints: { id: 'awe.id', appId: 'awe.appId', url: 'awe.url', signingKey: 'awe.signingKey', status: 'awe.status' },
  appUserConfig: { portalSub: 'auc.portalSub', appId: 'auc.appId', config: 'auc.config', schemaVersion: 'auc.schemaVersion', updatedAt: 'auc.updatedAt', updatedBy: 'auc.updatedBy' },
  appManifests: { appId: 'am.appId', displayName: 'am.displayName', schemaVersion: 'am.schemaVersion', configSchema: 'am.configSchema', registeredAt: 'am.registeredAt', updatedAt: 'am.updatedAt' },
  bulkEditLocks: { appId: 'bel.appId', acquiredBy: 'bel.acquiredBy', acquiredAt: 'bel.acquiredAt' },
  aliasCollisionQueue: { id: 'acq.id', rawName: 'acq.rawName', rawNameNormalized: 'acq.rawNameNormalized', suggestedIdentityUserId: 'acq.suggestedIdentityUserId', source: 'acq.source', context: 'acq.context', status: 'acq.status', createdAt: 'acq.createdAt', resolvedAt: 'acq.resolvedAt', resolvedBy: 'acq.resolvedBy', resolutionAction: 'acq.resolutionAction' },
  userAliases: { id: 'ua.id', identityUserId: 'ua.identityUserId', alias: 'ua.alias', aliasNormalized: 'ua.aliasNormalized', isPrimary: 'ua.isPrimary', source: 'ua.source', createdAt: 'ua.createdAt', tombstoned: 'ua.tombstoned' },
  accessAuditLog: { actorId: 'aal.actorId', action: 'aal.action', targetId: 'aal.targetId', details: 'aal.details', createdAt: 'aal.createdAt' },
  teams: { id: 'teams.id', name: 'teams.name' },
  signingKeys: { kid: 'sk.kid', publicKey: 'sk.publicKey', privateKey: 'sk.privateKey', algorithm: 'sk.algorithm', status: 'sk.status', createdAt: 'sk.createdAt' },
  authHandoffs: { id: 'ah.id', nonce: 'ah.nonce', state: 'ah.state', createdAt: 'ah.createdAt', expiresAt: 'ah.expiresAt' },
  webhookDeliveryJobs: { id: 'wdj.id', endpointId: 'wdj.endpointId', payload: 'wdj.payload', status: 'wdj.status', createdAt: 'wdj.createdAt', scheduledAt: 'wdj.scheduledAt' },
}))
mock.module('drizzle-orm', () => ({
  eq: (_left: unknown, _right: unknown) => ({}),
  and: (..._args: unknown[]) => ({}),
  asc: (_col: unknown) => ({}),
  desc: (_col: unknown) => ({}),
  ilike: (_col: unknown, _val: unknown) => ({}),
  or: (..._args: unknown[]) => ({}),
  ne: (_l: unknown, _r: unknown) => ({}),
  inArray: (_l: unknown, _r: unknown) => ({}),
  gte: (_l: unknown, _r: unknown) => ({}),
  lte: (_l: unknown, _r: unknown) => ({}),
  gt: (_l: unknown, _r: unknown) => ({}),
  lt: (_l: unknown, _r: unknown) => ({}),
  isNull: (_col: unknown) => ({}),
  isNotNull: (_col: unknown) => ({}),
  not: (_expr: unknown) => ({}),
  count: (_col?: unknown) => ({}),
  sql: new Proxy((_s: TemplateStringsArray) => '', { get: (_t, p) => (_: unknown) => p }),
  relations: () => ({}),
  uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
  index: () => ({ on: () => ({}) }),
  unique: () => ({ on: () => ({}) }),
  pgTable: (_name: string, cols: unknown) => cols,
  uuid: () => ({ primaryKey: () => ({}) }),
  text: () => ({ notNull: () => ({ default: () => ({}) }) }),
  boolean: () => ({ notNull: () => ({ default: () => ({}) }) }),
  integer: () => ({ notNull: () => ({ default: () => ({}) }) }),
  jsonb: () => ({ notNull: () => ({ default: () => ({}) }) }),
  timestamp: () => ({ notNull: () => ({ defaultNow: () => ({}) }) }),
  foreignKey: () => ({ references: () => ({}) }),
  varchar: () => ({ notNull: () => ({ default: () => ({}) }) }),
  serial: () => ({ primaryKey: () => ({}) }),
  bigint: () => ({ notNull: () => ({}) }),
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
