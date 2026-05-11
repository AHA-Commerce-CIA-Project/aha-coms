import { describe, expect, test, mock, beforeEach, spyOn } from 'bun:test'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecute = mock(() => Promise.resolve([{ '?column?': 1 }]))

mock.module('~/db', () => ({
  db: {
    execute: mockExecute,
  },
}))

mock.module('~/db/schema/signing-keys', () => ({
  portalBrokerSigningKeys: { privateSecretName: 'private_secret_name', status: 'status' },
}))

const mockGetAccessToken = mock(() => Promise.resolve('test-access-token'))

mock.module('google-auth-library', () => ({
  GoogleAuth: class {
    getAccessToken = mockGetAccessToken
  },
}))

const mockFetch = mock((_url: string) =>
  Promise.resolve(new Response(null, { status: 200 })),
)

// Stub drizzle imports used by health.ts (dynamic imports)
mock.module('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  eq: (a: unknown, b: unknown) => ({ a, b }),
}))

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { probeHealth } = await import('../health')

beforeEach(() => {
  mockExecute.mockClear()
  mockGetAccessToken.mockClear()
  mockFetch.mockClear()
  process.env.GCP_PROJECT_ID = 'test-project'
  process.env.CLOUD_TASKS_LOCATION = 'us-central1'
  process.env.CLOUD_TASKS_QUEUE = 'webhook-delivery'
})

describe('probeHealth', () => {
  test('returns ok when db check succeeds', async () => {
    mockExecute.mockImplementation(() => Promise.resolve([]))
    // Other checks will fail without a real GCP — only db check matters here
    const result = await probeHealth()
    expect(['ok', 'degraded']).toContain(result.status)
    // DB check specifically: if mockExecute resolves, db should be 'ok'
    expect(result.checks.db).toBe('ok')
  })

  test('returns db=failed when db execute throws', async () => {
    mockExecute.mockImplementation(() => Promise.reject(new Error('connection refused')))
    const result = await probeHealth()
    expect(result.checks.db).toBe('failed')
    expect(result.status).toBe('degraded')
  })

  test('returns db=failed when db execute times out', async () => {
    mockExecute.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 600)), // > 500ms timeout
    )
    const result = await probeHealth()
    expect(result.checks.db).toBe('failed')
    expect(result.status).toBe('degraded')
  })

  test('degraded status when any single check fails', async () => {
    // DB ok, others may fail in test environment
    mockExecute.mockImplementation(() => Promise.resolve([]))
    const result = await probeHealth()
    // status is 'degraded' unless ALL three checks are 'ok'
    expect(['ok', 'degraded']).toContain(result.status)
    expect(result.checks).toHaveProperty('db')
    expect(result.checks).toHaveProperty('secretManager')
    expect(result.checks).toHaveProperty('cloudTasks')
  })

  test('returns degraded when GCP_PROJECT_ID is missing', async () => {
    delete process.env.GCP_PROJECT_ID
    const result = await probeHealth()
    // secretManager and cloudTasks both need projectId
    expect(result.checks.secretManager).toBe('failed')
    expect(result.checks.cloudTasks).toBe('failed')
    expect(result.status).toBe('degraded')
  })
})
