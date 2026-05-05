import { Elysia } from 'elysia'
import type { PortalWebhookEnvelope } from '@coms-portal/shared'
import { db } from '@coms/shared/db'
import { portalWebhookEvents } from '@coms/shared/db/schema'
import { verifyGoogleIdToken } from '../lib/oidc'
import { dispatchPortalEvent } from '../services/portal-events/dispatch'

/**
 * Unwrap the PortalWebhookEnvelope<T> Portal sends over the wire and return
 * the inner payload that handlers expect. Returns a discriminated result so
 * the route can map failures to a 400 with a useful message.
 *
 * Pure / no I/O — exported so unit tests can pin the unwrap contract without
 * mocking OIDC, DB, or dispatch.
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

export const portalWebhooksRoute = new Elysia().post(
  '/webhooks/portal',
  async ({ request, set }) => {
    const event = request.headers.get('X-Portal-Event')
    const eventId = request.headers.get('X-Portal-Event-Id')

    if (!event || !eventId) {
      set.status = 400
      return { message: 'missing header' }
    }

    const portalSAEmail = process.env.PORTAL_SERVICE_ACCOUNT_EMAIL
    const selfAudience = process.env.SELF_PUBLIC_URL
    if (!portalSAEmail || !selfAudience) {
      console.error('[portal-webhook] PORTAL_SERVICE_ACCOUNT_EMAIL and SELF_PUBLIC_URL must be set')
      set.status = 500
      return { message: 'webhook auth not configured' }
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      set.status = 401
      return { message: 'missing bearer token' }
    }

    try {
      await verifyGoogleIdToken({
        idToken: authHeader.slice('Bearer '.length),
        expectedAudience: selfAudience,
        expectedSAEmail: portalSAEmail,
      })
    } catch (err) {
      console.warn(`[portal-webhook] OIDC verification failed: ${(err as Error).message}`)
      set.status = 401
      return { message: 'invalid bearer token' }
    }

    const rawBody = await request.text()

    const inserted = await db
      .insert(portalWebhookEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning({ eventId: portalWebhookEvents.eventId })

    if (inserted.length === 0) {
      console.log(`[portal-webhook] duplicate event ${eventId} — skipping`)
      return { ok: true }
    }

    const unwrapped = unwrapWebhookEnvelope(rawBody)
    if (!unwrapped.ok) {
      console.warn(
        `[portal-webhook] envelope rejected reason=${unwrapped.reason} event=${event} eventId=${eventId}` +
          (unwrapped.detail ? ` detail=${unwrapped.detail}` : ''),
      )
      set.status = 400
      return {
        message:
          unwrapped.reason === 'malformed_json'
            ? 'malformed json body'
            : 'envelope missing payload',
      }
    }

    console.log(`[portal-webhook] dispatching event=${event} eventId=${eventId} appSlug=${unwrapped.appSlug ?? '<none>'}`)
    await dispatchPortalEvent(event, unwrapped.payload)
    return { ok: true }
  },
)
