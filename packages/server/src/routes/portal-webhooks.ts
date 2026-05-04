import { Elysia } from 'elysia'
import { db } from '@coms/shared/db'
import { portalWebhookEvents } from '@coms/shared/db/schema'
import { verifyGoogleIdToken } from '../lib/oidc'
import { dispatchPortalEvent } from '../services/portal-events/dispatch'

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

    const body = JSON.parse(rawBody) as unknown
    await dispatchPortalEvent(event, body)
    return { ok: true }
  },
)
