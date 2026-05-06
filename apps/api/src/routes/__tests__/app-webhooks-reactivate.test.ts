import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { fullDrizzleOrmMock, fullSchemaBarrelMock } from '~/test-helpers/schema-barrel-mock'

// ---------------------------------------------------------------------------
// Mock requireRole — default: admin allowed
// ---------------------------------------------------------------------------

let isAdmin = true

mock.module('~/middleware/rbac', () => ({
  requireRole: (..._roles: string[]) =>
    new Elysia({ name: 'mock-require-role-webhook-reactivate' }).derive({ as: 'scoped' }, async ({ status }) => {
      if (!isAdmin) throw status(403, { message: 'Insufficient portal role' })
      return {
        authUser: {
          id: '00000000-0000-0000-0000-00000000ad00',
          email: 'admin@test.com',
          name: 'Admin',
          portalRole: 'admin',
          gipUid: 'gip-admin',
          teamIds: [],
          apps: [],
        },
      }
    }),
}))

// ---------------------------------------------------------------------------
// Mock db — minimal surface for the reactivate route only.
// ---------------------------------------------------------------------------

const APP_ID = '11111111-1111-4111-8111-111111111111'
const ENDPOINT_ID = '22222222-2222-4222-8222-222222222222'

interface EndpointRow {
  id: string
  appId: string
  url: string
  secret: string
  subscribedEvents: string[]
  status: 'active' | 'disabled'
  failureCount: number
  lastDeliveredAt: Date | null
  lastFailureAt: Date | null
  lastFailureReason: string | null
  createdAt: Date
  updatedAt: Date
}

let endpoint: EndpointRow | null = null
const updateCalls: Array<Record<string, unknown>> = []
const auditCalls: Array<Record<string, unknown>> = []

const mockDb = {
  query: {
    appWebhookEndpoints: {
      findFirst: async () => endpoint,
    },
  },
  update: (_table: unknown) => ({
    set(payload: Record<string, unknown>) {
      updateCalls.push(payload)
      if (endpoint) {
        endpoint = { ...endpoint, ...(payload as Partial<EndpointRow>) }
      }
      return {
        where: (_cond: unknown) => ({
          returning: async () => (endpoint ? [endpoint] : []),
        }),
      }
    },
  }),
}

mock.module('~/db', () => ({ db: mockDb }))

// Full schema-barrel surface required because mock.module is process-global —
// see test-helpers/schema-barrel-mock.ts for the pattern history.
mock.module('~/db/schema', () => fullSchemaBarrelMock())
mock.module('drizzle-orm', () => fullDrizzleOrmMock())

mock.module('~/services/audit', () => ({
  logAudit: async (params: Record<string, unknown>) => {
    auditCalls.push(params)
  },
}))

// Mint stub keeps the OIDC path inert so the test doesn't need GCP creds.
mock.module('~/services/webhook-dispatcher', () => ({
  signWebhookBody: () => 'sig',
  mintWebhookAudienceToken: async () => null,
}))

mock.module('@coms-portal/shared', () => ({
  PORTAL_WEBHOOK_SIGNATURE_HEADER: 'X-Portal-Signature',
  PORTAL_WEBHOOK_EVENT_HEADER: 'X-Portal-Event',
  PORTAL_WEBHOOK_EVENT_ID_HEADER: 'X-Portal-Event-Id',
  PORTAL_WEBHOOK_TIMESTAMP_HEADER: 'X-Portal-Timestamp',
  PORTAL_WEBHOOK_CONTRACT_VERSION: 1,
  PORTAL_WEBHOOK_EVENTS: [
    'session.revoked',
    'user.provisioned',
    'user.updated',
    'user.offboarded',
  ],
}))

const { appWebhookRoutes } = await import('../app-webhooks')

const app = new Elysia({ prefix: '/v1' }).use(appWebhookRoutes)

function disabledEndpoint(): EndpointRow {
  return {
    id: ENDPOINT_ID,
    appId: APP_ID,
    url: 'https://heroes.example.com/webhooks/portal',
    secret: 's',
    subscribedEvents: ['session.revoked'],
    status: 'disabled',
    failureCount: 5,
    lastDeliveredAt: new Date('2026-05-04T00:00:00Z'),
    lastFailureAt: new Date('2026-05-05T13:57:44Z'),
    lastFailureReason: 'Cloud Tasks retries exhausted',
    createdAt: new Date('2026-04-30T00:00:00Z'),
    updatedAt: new Date('2026-05-05T13:57:44Z'),
  }
}

function postReactivate(appId: string, endpointId: string) {
  return app.handle(
    new Request(
      `http://localhost/v1/apps/${appId}/webhooks/${endpointId}/reactivate`,
      { method: 'POST' },
    ),
  )
}

describe('POST /api/v1/apps/:id/webhooks/:endpointId/reactivate', () => {
  beforeEach(() => {
    endpoint = disabledEndpoint()
    updateCalls.length = 0
    auditCalls.length = 0
    isAdmin = true
  })

  test('flips status=active, zeroes failureCount, clears failure metadata, and audits', async () => {
    const response = await postReactivate(APP_ID, ENDPOINT_ID)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('active')
    expect(body.failureCount).toBe(0)
    expect(body.lastFailureAt).toBeNull()
    expect(body.lastFailureReason).toBeNull()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toMatchObject({
      status: 'active',
      failureCount: 0,
      lastFailureAt: null,
      lastFailureReason: null,
    })

    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({
      action: 'reactivate_webhook_endpoint',
      targetType: 'app',
      targetId: APP_ID,
      details: expect.objectContaining({
        endpointId: ENDPOINT_ID,
        previousStatus: 'disabled',
        previousFailureCount: 5,
      }),
    })
  })

  test('returns 404 when endpoint does not exist', async () => {
    endpoint = null
    const response = await postReactivate(APP_ID, ENDPOINT_ID)
    expect(response.status).toBe(404)
    expect(updateCalls).toHaveLength(0)
    expect(auditCalls).toHaveLength(0)
  })

  test('rejects non-admin callers with 403', async () => {
    isAdmin = false
    const response = await postReactivate(APP_ID, ENDPOINT_ID)
    expect(response.status).toBe(403)
    expect(updateCalls).toHaveLength(0)
    expect(auditCalls).toHaveLength(0)
  })

  test('idempotent: reactivating an already-active endpoint succeeds and still audits', async () => {
    endpoint = { ...disabledEndpoint(), status: 'active', failureCount: 0, lastFailureAt: null, lastFailureReason: null }
    const response = await postReactivate(APP_ID, ENDPOINT_ID)
    expect(response.status).toBe(200)
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({
      details: expect.objectContaining({ previousStatus: 'active' }),
    })
  })
})
