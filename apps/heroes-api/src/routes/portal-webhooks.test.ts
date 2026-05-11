import { beforeEach, describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import { portalWebhooksRoute, unwrapWebhookEnvelope } from './portal-webhooks'

const app = new Elysia({ prefix: '/api' }).use(portalWebhooksRoute)

const WEBHOOK_URL = 'http://localhost/api/webhooks/portal'

function makeHeaders(overrides: Record<string, string | null> = {}): Record<string, string> {
  const defaults: Record<string, string> = {
    'X-Portal-Event': 'session.revoked',
    'X-Portal-Event-Id': 'evt-' + Math.random().toString(36).slice(2),
    'authorization': 'Bearer dummy-token',
  }
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v !== null) result[k] = v
  }
  return result
}

function makeRequest(headersOverride: Record<string, string | null> = {}, body?: string): Request {
  const b = body ?? JSON.stringify({ email: 'alice@example.com' })
  return new Request(WEBHOOK_URL, {
    method: 'POST',
    headers: makeHeaders(headersOverride),
    body: b,
  })
}

describe('POST /api/webhooks/portal — header validation (pre-auth)', () => {
  it('returns 400 when X-Portal-Event is missing', async () => {
    const res = await app.handle(makeRequest({ 'X-Portal-Event': null }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.message).toBe('missing header')
  })

  it('returns 400 when X-Portal-Event-Id is missing', async () => {
    const res = await app.handle(makeRequest({ 'X-Portal-Event-Id': null }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.message).toBe('missing header')
  })
})

describe('POST /api/webhooks/portal — OIDC auth config', () => {
  beforeEach(() => {
    delete process.env.PORTAL_SERVICE_ACCOUNT_EMAIL
    delete process.env.SELF_PUBLIC_URL
  })

  it('returns 500 when PORTAL_SERVICE_ACCOUNT_EMAIL is missing', async () => {
    process.env.SELF_PUBLIC_URL = 'https://heroes.example'
    const res = await app.handle(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.message).toBe('webhook auth not configured')
  })

  it('returns 500 when SELF_PUBLIC_URL is missing', async () => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    const res = await app.handle(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.message).toBe('webhook auth not configured')
  })
})

describe('POST /api/webhooks/portal — bearer token validation', () => {
  beforeEach(() => {
    process.env.PORTAL_SERVICE_ACCOUNT_EMAIL = 'portal-sa@example.iam.gserviceaccount.com'
    process.env.SELF_PUBLIC_URL = 'https://heroes.example'
  })

  it('returns 401 when authorization header is absent', async () => {
    const res = await app.handle(makeRequest({ authorization: null }))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.message).toBe('missing bearer token')
  })

  it('returns 401 when authorization header lacks Bearer prefix', async () => {
    const res = await app.handle(makeRequest({ authorization: 'Basic abc123' }))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.message).toBe('missing bearer token')
  })

  it('returns 401 when bearer token fails OIDC verification', async () => {
    const res = await app.handle(makeRequest({ authorization: 'Bearer not-a-real-id-token' }))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.message).toBe('invalid bearer token')
  })
})

// Regression for 2026-05-05: Heroes' route was passing the full
// PortalWebhookEnvelope to handlers, which expect the inner payload only.
// Every webhook event silently no-op'd because handlers' guard clauses tripped
// on undefined fields (e.g. `payload.taxonomyId` lived at `body.payload.taxonomyId`).
// These tests pin the unwrap contract at the helper level.
describe('unwrapWebhookEnvelope', () => {
  it('returns the inner payload from a well-formed envelope', () => {
    const result = unwrapWebhookEnvelope(
      JSON.stringify({
        contractVersion: 1,
        event: 'taxonomy.upserted',
        eventId: 'evt-1',
        occurredAt: '2026-05-05T00:00:00.000Z',
        appSlug: 'heroes',
        payload: { taxonomyId: 'branches', entries: [{ key: 'ID-JKT', value: 'Jakarta', metadata: null }] },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.appSlug).toBe('heroes')
      expect(result.payload).toEqual({
        taxonomyId: 'branches',
        entries: [{ key: 'ID-JKT', value: 'Jakarta', metadata: null }],
      })
    }
  })

  it('does NOT pass the transport envelope through as the payload', () => {
    const result = unwrapWebhookEnvelope(
      JSON.stringify({
        contractVersion: 1,
        event: 'taxonomy.upserted',
        eventId: 'evt-2',
        occurredAt: '2026-05-05T00:00:00.000Z',
        appSlug: 'heroes',
        payload: { taxonomyId: 'branches', entries: [] },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The payload must NOT carry transport-layer fields. If a future change
      // accidentally hands the whole envelope through, this assertion catches it.
      expect(result.payload).not.toHaveProperty('contractVersion')
      expect(result.payload).not.toHaveProperty('event')
      expect(result.payload).not.toHaveProperty('eventId')
    }
  })

  it('rejects malformed JSON', () => {
    const result = unwrapWebhookEnvelope('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('malformed_json')
  })

  it('rejects an envelope missing the payload field', () => {
    const result = unwrapWebhookEnvelope(
      JSON.stringify({ contractVersion: 1, event: 'taxonomy.upserted', eventId: 'evt-3' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing_payload')
  })

  it('rejects a JSON primitive', () => {
    const result = unwrapWebhookEnvelope(JSON.stringify('just a string'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing_payload')
  })
})
