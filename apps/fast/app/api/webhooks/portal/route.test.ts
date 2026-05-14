/**
 * Unit tests for /fast/api/webhooks/portal — the portal-webhook
 * consumer route (Spec 05 Phase 7 / T77).
 *
 * The route mixes four concerns: header validation, OIDC env config,
 * Bearer token verification, and dedup-then-dispatch. The tests
 * cover each band in the order the route checks them, plus the
 * happy-path dispatch and the duplicate-event short-circuit.
 *
 * Mocks land on `@/lib/db`, `@/lib/portal/oidc`, and `@/lib/portal/
 * dispatch` so the test stays free of DB-server, Google-cert, and
 * handler-side dependencies.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const verifyGoogleIdTokenMock = mock(async () => undefined)
const createManyMock = mock(async () => ({ count: 1 }))
const dispatchPortalEventMock = mock(async () => undefined)

mock.module('@/lib/db', () => ({
  prisma: {
    portalWebhookEvent: {
      createMany: createManyMock,
    },
  },
}))

mock.module('@/lib/portal/oidc', () => ({
  verifyGoogleIdToken: verifyGoogleIdTokenMock,
}))

mock.module('@/lib/portal/dispatch', () => ({
  dispatchPortalEvent: dispatchPortalEventMock,
}))

const { POST } = await import('./route')

const PORTAL_WEBHOOK_URL = 'https://aha-coms.web.app/fast/api/webhooks/portal'

function makeHeaders(overrides: Record<string, string | null> = {}): Headers {
  const defaults: Record<string, string> = {
    'x-portal-event': 'user.provisioned',
    'x-portal-event-id': 'evt-' + Math.random().toString(36).slice(2),
    authorization: 'Bearer dummy-token',
  }
  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v !== null) merged[k] = v
  }
  return new Headers(merged)
}

function makeRequest(
  headerOverrides: Record<string, string | null> = {},
  body?: unknown,
): Request {
  const rawBody =
    body === undefined
      ? JSON.stringify({
          contractVersion: 1,
          event: 'user.provisioned',
          eventId: 'evt-1',
          occurredAt: '2026-05-14T00:00:00.000Z',
          appSlug: 'fast',
          payload: { userId: 'sub-1', name: 'Alice', email: 'alice@example.com' },
        })
      : typeof body === 'string'
        ? body
        : JSON.stringify(body)
  return new Request(PORTAL_WEBHOOK_URL, {
    method: 'POST',
    headers: makeHeaders(headerOverrides),
    body: rawBody,
  })
}

describe('POST /api/webhooks/portal — header validation', () => {
  beforeEach(() => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    process.env.SELF_PUBLIC_URL = 'https://aha-coms.web.app/fast'
    verifyGoogleIdTokenMock.mockClear()
    createManyMock.mockClear()
    dispatchPortalEventMock.mockClear()
  })

  it('returns 400 when X-Portal-Event is missing', async () => {
    const req = makeRequest({ 'x-portal-event': null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'missing header' })
  })

  it('returns 400 when X-Portal-Event-Id is missing', async () => {
    const req = makeRequest({ 'x-portal-event-id': null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'missing header' })
  })
})

describe('POST /api/webhooks/portal — OIDC env config', () => {
  afterEach(() => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    process.env.SELF_PUBLIC_URL = 'https://aha-coms.web.app/fast'
  })

  it('returns 500 when PORTAL_SERVICE_ACCOUNT_EMAIL is missing', async () => {
    delete process.env.PORTAL_SERVICE_ACCOUNT_EMAIL
    process.env.SELF_PUBLIC_URL = 'https://aha-coms.web.app/fast'
    const req = makeRequest()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ message: 'webhook auth not configured' })
  })

  it('returns 500 when SELF_PUBLIC_URL is missing', async () => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    delete process.env.SELF_PUBLIC_URL
    const req = makeRequest()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ message: 'webhook auth not configured' })
  })
})

describe('POST /api/webhooks/portal — Bearer token validation', () => {
  beforeEach(() => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    process.env.SELF_PUBLIC_URL = 'https://aha-coms.web.app/fast'
    verifyGoogleIdTokenMock.mockClear()
    createManyMock.mockClear()
    dispatchPortalEventMock.mockClear()
  })

  it('returns 401 when authorization header is absent', async () => {
    const req = makeRequest({ authorization: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ message: 'missing bearer token' })
  })

  it('returns 401 when authorization header lacks Bearer prefix', async () => {
    const req = makeRequest({ authorization: 'Basic abc123' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ message: 'missing bearer token' })
  })

  it('returns 401 when verifyGoogleIdToken throws', async () => {
    verifyGoogleIdTokenMock.mockImplementationOnce(async () => {
      throw new Error('signature mismatch')
    })
    const req = makeRequest()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ message: 'invalid bearer token' })
    expect(createManyMock).not.toHaveBeenCalled()
    expect(dispatchPortalEventMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/portal — dedup + dispatch', () => {
  beforeEach(() => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    process.env.SELF_PUBLIC_URL = 'https://aha-coms.web.app/fast'
    verifyGoogleIdTokenMock.mockClear()
    createManyMock.mockClear()
    dispatchPortalEventMock.mockClear()
  })

  it('short-circuits 200 on duplicate event without dispatching', async () => {
    verifyGoogleIdTokenMock.mockImplementationOnce(async () => undefined)
    createManyMock.mockImplementationOnce(async () => ({ count: 0 }))

    const req = makeRequest({ 'x-portal-event-id': 'evt-dup-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(createManyMock).toHaveBeenCalledTimes(1)
    expect(dispatchPortalEventMock).not.toHaveBeenCalled()
  })

  it('dispatches the inner payload, not the envelope, on first arrival', async () => {
    verifyGoogleIdTokenMock.mockImplementationOnce(async () => undefined)
    createManyMock.mockImplementationOnce(async () => ({ count: 1 }))

    const innerPayload = { userId: 'sub-42', name: 'Bob', email: 'bob@example.com' }
    const req = makeRequest(
      { 'x-portal-event': 'user.provisioned', 'x-portal-event-id': 'evt-42' },
      {
        contractVersion: 1,
        event: 'user.provisioned',
        eventId: 'evt-42',
        occurredAt: '2026-05-14T00:00:00.000Z',
        appSlug: 'fast',
        payload: innerPayload,
      },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)

    expect(res.status).toBe(200)
    expect(dispatchPortalEventMock).toHaveBeenCalledTimes(1)
    const [event, payload] = dispatchPortalEventMock.mock.calls[0]
    expect(event).toBe('user.provisioned')
    expect(payload).toEqual(innerPayload)
  })

  it('returns 400 on malformed JSON body (after dedup row already lands)', async () => {
    verifyGoogleIdTokenMock.mockImplementationOnce(async () => undefined)
    createManyMock.mockImplementationOnce(async () => ({ count: 1 }))

    const req = makeRequest({}, '{ not json')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'malformed json body' })
    expect(dispatchPortalEventMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the envelope is missing payload', async () => {
    verifyGoogleIdTokenMock.mockImplementationOnce(async () => undefined)
    createManyMock.mockImplementationOnce(async () => ({ count: 1 }))

    const req = makeRequest(
      {},
      { contractVersion: 1, event: 'user.provisioned', eventId: 'evt-no-payload' },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ message: 'envelope missing payload' })
    expect(dispatchPortalEventMock).not.toHaveBeenCalled()
  })
})
