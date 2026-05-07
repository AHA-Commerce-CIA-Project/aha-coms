import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

// ---------------------------------------------------------------------------
// Mock requireAppToken — same pattern as users.test.ts
// ---------------------------------------------------------------------------

const DEFAULT_APP = {
  id: 'app-uuid-1',
  slug: 'heroes',
  serviceAccountEmail: 'heroes@example.iam.gserviceaccount.com',
}

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
// Mock services/manifests — track register calls + return canned schemaVersion
// ---------------------------------------------------------------------------

let registerCalls: unknown[] = []
let registerThrows: Error | null = null
let manifestRow: { schemaVersion: number; updatedAt: Date } | null = {
  schemaVersion: 2,
  updatedAt: new Date('2026-05-07T12:00:00.000Z'),
}

mock.module('~/services/manifests', () => ({
  registerManifest: mock(async (manifest: unknown) => {
    if (registerThrows) throw registerThrows
    registerCalls.push(manifest)
  }),
  validateConfigSchemaShape: (schema: unknown) => {
    if (
      schema === null ||
      typeof schema !== 'object' ||
      Array.isArray(schema)
    ) {
      return [{ key: '<root>', reason: 'configSchema must be a JSON object' }]
    }
    const errors: { key: string; reason: string }[] = []
    for (const [key, raw] of Object.entries(schema as Record<string, unknown>)) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push({ key, reason: 'field definition must be an object' })
        continue
      }
      const field = raw as Record<string, unknown>
      const ok = ['enum', 'boolean', 'integer', 'string'].includes(field.type as string)
      if (!ok) errors.push({ key, reason: 'invalid type' })
    }
    return errors
  },
}))
mock.module('../services/manifests', () => ({
  registerManifest: mock(async (manifest: unknown) => {
    if (registerThrows) throw registerThrows
    registerCalls.push(manifest)
  }),
  validateConfigSchemaShape: (schema: unknown) => {
    if (
      schema === null ||
      typeof schema !== 'object' ||
      Array.isArray(schema)
    ) {
      return [{ key: '<root>', reason: 'configSchema must be a JSON object' }]
    }
    const errors: { key: string; reason: string }[] = []
    for (const [key, raw] of Object.entries(schema as Record<string, unknown>)) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push({ key, reason: 'field definition must be an object' })
        continue
      }
      const field = raw as Record<string, unknown>
      const ok = ['enum', 'boolean', 'integer', 'string'].includes(field.type as string)
      if (!ok) errors.push({ key, reason: 'invalid type' })
    }
    return errors
  },
}))

// MIN_MANIFEST_SCHEMA_VERSION lives in services/apps.ts
mock.module('~/services/apps', () => ({ MIN_MANIFEST_SCHEMA_VERSION: 2 }))
mock.module('../services/apps', () => ({ MIN_MANIFEST_SCHEMA_VERSION: 2 }))

// db.query.appManifests.findFirst — returns the row after upsert
const db = {
  query: {
    appManifests: {
      findFirst: async () => manifestRow,
    },
  },
}
mock.module('~/db', () => ({ db }))
mock.module('../../db', () => ({ db }))

// app-manifests schema is referenced for the findFirst type — a minimal stub
mock.module('~/db/schema/app-manifests', () => ({
  appManifests: { schemaVersion: 'app_manifests.schema_version' },
}))
mock.module('~/db/schema/apps', () => ({
  appRegistry: { id: 'app_registry.id', slug: 'app_registry.slug' },
}))

const { appManifestRoutes } = await import('../app-manifest')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  return new Elysia().use(appManifestRoutes)
}
type TestApp = ReturnType<typeof makeApp>

async function postManifest(app: TestApp, slug: string, body: unknown, headers: Record<string, string> = {}) {
  return app.handle(
    new Request(`http://localhost/apps/${slug}/manifest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

const validBody = {
  appId: 'heroes',
  displayName: 'Heroes',
  schemaVersion: 2,
  configSchema: {
    leaderboardEligible: { type: 'boolean', default: true },
  },
  taxonomies: ['team'],
}

function reset() {
  mockApp = { ...DEFAULT_APP }
  authFail = null
  registerCalls = []
  registerThrows = null
  manifestRow = { schemaVersion: 2, updatedAt: new Date('2026-05-07T12:00:00.000Z') }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /apps/:id/manifest', () => {
  beforeEach(reset)

  test('200 on a valid manifest matching the caller app', async () => {
    const app = makeApp()
    const res = await postManifest(app, 'heroes', validBody, { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.schemaVersion).toBe(2)
    expect(body.registeredAt).toBe('2026-05-07T12:00:00.000Z')
    expect(registerCalls.length).toBe(1)
  })

  test('401 when Authorization is missing', async () => {
    const app = makeApp()
    const res = await postManifest(app, 'heroes', validBody)
    expect(res.status).toBe(401)
  })

  test('403 app_mismatch when caller is a different app', async () => {
    mockApp = { id: 'other', slug: 'orbit', serviceAccountEmail: 'orbit@example.iam' }
    const app = makeApp()
    const res = await postManifest(app, 'heroes', validBody, { Authorization: 'Bearer t' })
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.reason).toBe('app_mismatch')
    expect(registerCalls.length).toBe(0)
  })

  test('409 when body.appId does not match the slug captured from the URL', async () => {
    const app = makeApp()
    const res = await postManifest(
      app,
      'heroes',
      { ...validBody, appId: 'orbit' },
      { Authorization: 'Bearer t' },
    )
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('app_slug_mismatch')
    expect(registerCalls.length).toBe(0)
  })

  test('422 when configSchema shape is malformed', async () => {
    const app = makeApp()
    const bad = {
      ...validBody,
      configSchema: { foo: { type: 'magical', default: 'x' } },
    }
    const res = await postManifest(app, 'heroes', bad, { Authorization: 'Bearer t' })
    expect(res.status).toBe(422)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('validation_failed')
    expect(Array.isArray(body.details)).toBe(true)
    expect(registerCalls.length).toBe(0)
  })

  test('422 when schemaVersion is below MIN_MANIFEST_SCHEMA_VERSION', async () => {
    const app = makeApp()
    const res = await postManifest(
      app,
      'heroes',
      { ...validBody, schemaVersion: 1 },
      { Authorization: 'Bearer t' },
    )
    expect(res.status).toBe(422)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('validation_failed')
    expect(registerCalls.length).toBe(0)
  })

  test('idempotent — second call returns the GREATEST schemaVersion already on the row', async () => {
    manifestRow = { schemaVersion: 5, updatedAt: new Date('2026-05-08T00:00:00.000Z') }
    const app = makeApp()
    const res = await postManifest(app, 'heroes', validBody, { Authorization: 'Bearer t' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.schemaVersion).toBe(5)
  })
})
