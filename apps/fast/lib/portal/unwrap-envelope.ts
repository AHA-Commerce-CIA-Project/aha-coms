import type { PortalWebhookEnvelope } from '@coms-portal/sdk'

/**
 * Unwrap the PortalWebhookEnvelope<T> Portal sends over the wire and
 * return the inner payload that handlers expect. Pure, no I/O — kept
 * separate from the route so the unwrap contract is unit-testable
 * without OIDC or DB mocks.
 *
 * Discriminated result so the route can map failures to a 400 with a
 * useful message. The 2026-05-05 regression on heroes' side (route
 * was passing the full envelope to handlers; every webhook silently
 * no-op'd because handlers' guard clauses tripped on undefined
 * fields) anchors this helper's existence.
 */
export type UnwrapResult =
  | { ok: true; payload: unknown; appSlug: string | undefined }
  | { ok: false; reason: 'malformed_json' | 'missing_payload'; detail?: string }

export function unwrapWebhookEnvelope(rawBody: string): UnwrapResult {
  let envelope: PortalWebhookEnvelope
  try {
    envelope = JSON.parse(rawBody) as PortalWebhookEnvelope
  } catch (err) {
    return { ok: false, reason: 'malformed_json', detail: (err as Error).message }
  }
  if (!envelope || typeof envelope !== 'object' || !('payload' in envelope)) {
    return { ok: false, reason: 'missing_payload' }
  }
  return { ok: true, payload: envelope.payload, appSlug: envelope.appSlug }
}
