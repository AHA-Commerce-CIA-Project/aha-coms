import { describe, expect, it } from 'bun:test'
import { unwrapWebhookEnvelope } from './unwrap-envelope'

// Mirror of the heroes-side regression tests at
// apps/heroes-api/src/routes/portal-webhooks.test.ts. Heroes' 2026-05-05
// regression — passing the full PortalWebhookEnvelope to handlers
// instead of envelope.payload — would silently no-op every handler
// because the inner-payload field reads (taxonomyId, portalSub, etc.)
// landed on undefined. These tests pin the unwrap contract so the
// same crack can't reopen in fast.

describe('unwrapWebhookEnvelope', () => {
  it('returns the inner payload from a well-formed envelope', () => {
    const result = unwrapWebhookEnvelope(
      JSON.stringify({
        contractVersion: 1,
        event: 'taxonomy.upserted',
        eventId: 'evt-1',
        occurredAt: '2026-05-14T00:00:00.000Z',
        appSlug: 'fast',
        payload: { taxonomyId: 'teams', entries: [{ key: 't-bi', value: 'BI', metadata: null }] },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.appSlug).toBe('fast')
      expect(result.payload).toEqual({
        taxonomyId: 'teams',
        entries: [{ key: 't-bi', value: 'BI', metadata: null }],
      })
    }
  })

  it('does NOT pass the transport envelope through as the payload', () => {
    const result = unwrapWebhookEnvelope(
      JSON.stringify({
        contractVersion: 1,
        event: 'taxonomy.upserted',
        eventId: 'evt-2',
        occurredAt: '2026-05-14T00:00:00.000Z',
        appSlug: 'fast',
        payload: { taxonomyId: 'teams', entries: [] },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
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
