/**
 * Internal HTTP endpoints invoked by Cloud Tasks and Pub/Sub push subscriptions.
 *
 * Both endpoints require a Google-issued OIDC ID token whose audience matches
 * SERVICE_URL and whose `email` claim matches CLOUD_TASKS_SA_EMAIL.
 */
import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { appWebhookEndpoints } from '~/db/schema/app-webhook-endpoints'
import { deliverWebhook } from '~/services/webhook-dispatcher'
import { publishToWebhookDlq } from '~/services/cloud-tasks-client'
import { verifyGoogleOidcToken } from '~/services/oidc-verifier'
import type { PortalWebhookEvent } from '@coms-portal/shared'

// Must match `retry_config.max_attempts` in infra/cloud-tasks.tf. Cloud Tasks
// does not publish to Pub/Sub on its own when the budget is exhausted, so on
// the final attempt the handler fans the signal out to the DLQ topic itself.
const MAX_ATTEMPTS = 3

interface DeliveryPayload {
  endpointId: string
  event: string
  eventId: string
  jsonBody: string
  occurredAt: string
}

interface PubSubPushBody {
  message?: {
    data?: string
    messageId?: string
    publishTime?: string
    attributes?: Record<string, string>
  }
  subscription?: string
}

function logJson(fields: Record<string, unknown>): void {
  // Cloud Logging ingests structured JSON from stdout automatically.
  console.log(JSON.stringify(fields))
}

/**
 * Verify the Authorization header against the expected SA email and audience.
 * Returns null on success, or a `{status, message}` object that the caller
 * should surface as the response.
 */
async function authenticateOidcRequest(
  authHeader: string | null,
  expectedAudience: string,
  expectedEmail: string,
): Promise<{ status: 401 | 403; message: string } | null> {
  if (!authHeader) {
    return { status: 401, message: 'Unauthorized' }
  }
  try {
    const payload = await verifyGoogleOidcToken(authHeader, expectedAudience)
    if (payload.email !== expectedEmail) {
      return { status: 403, message: 'Forbidden' }
    }
    return null
  } catch {
    return { status: 401, message: 'Invalid token' }
  }
}

export const internalRoutes = new Elysia({ prefix: '/internal' })
  /**
   * POST /api/internal/webhook-delivery
   * Invoked by Cloud Tasks. Delivers the payload to the registered endpoint.
   * On 2xx → updates endpoint stats and returns 200.
   * On non-2xx or thrown → returns 5xx so Cloud Tasks retries.
   */
  .post(
    '/webhook-delivery',
    async ({ body, request, set }) => {
      const start = Date.now()
      const serviceUrl = process.env.SERVICE_URL ?? ''
      const taskSaEmail = process.env.CLOUD_TASKS_SA_EMAIL ?? ''

      const authResult = await authenticateOidcRequest(
        request.headers.get('authorization'),
        serviceUrl,
        taskSaEmail,
      )
      if (authResult) {
        set.status = authResult.status
        return { message: authResult.message }
      }

      const payload = body as DeliveryPayload
      const retryCount = request.headers.get('x-cloudtasks-taskretrycount') ?? '0'

      try {
        const [endpoint] = await db
          .select()
          .from(appWebhookEndpoints)
          .where(eq(appWebhookEndpoints.id, payload.endpointId))

        if (!endpoint || endpoint.status !== 'active') {
          // Endpoint is gone or already disabled — nothing to deliver. Return 200
          // so Cloud Tasks marks the task done; we do not want it retrying a no-op.
          logJson({
            severity: 'WARNING',
            message: 'webhook_delivery_skipped',
            reason: !endpoint ? 'endpoint_deleted' : 'endpoint_disabled',
            endpointId: payload.endpointId,
            eventId: payload.eventId,
            event: payload.event,
            retryCount,
          })
          return { ok: true, skipped: true }
        }

        await deliverWebhook(
          endpoint.url,
          endpoint.secret,
          payload.event as PortalWebhookEvent,
          payload.jsonBody,
          payload.eventId,
          payload.occurredAt,
          fetch,
        )

        const now = new Date()
        await db
          .update(appWebhookEndpoints)
          .set({ failureCount: 0, lastDeliveredAt: now, updatedAt: now })
          .where(eq(appWebhookEndpoints.id, endpoint.id))

        logJson({
          severity: 'INFO',
          message: 'webhook_delivery_attempt',
          endpointId: endpoint.id,
          eventId: payload.eventId,
          event: payload.event,
          retryCount,
          status: 'success',
          durationMs: Date.now() - start,
        })

        return { ok: true }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        logJson({
          severity: 'ERROR',
          message: 'webhook_delivery_attempt',
          endpointId: payload.endpointId,
          eventId: payload.eventId,
          event: payload.event,
          retryCount,
          status: 'failure',
          error: reason.slice(0, 500),
          durationMs: Date.now() - start,
        })

        // On the final attempt (retry count is 0-indexed), publish to the DLQ
        // topic ourselves — Cloud Tasks has no native forwarder. Do this BEFORE
        // returning 502 so we don't lose the signal if the task gets dropped
        // between our response and Cloud Tasks incrementing its counter.
        const retryCountNum = Number.parseInt(retryCount, 10)
        if (Number.isFinite(retryCountNum) && retryCountNum === MAX_ATTEMPTS - 1) {
          try {
            await publishToWebhookDlq({
              endpointId: payload.endpointId,
              event: payload.event,
              eventId: payload.eventId,
            })
          } catch (dlqErr) {
            const dlqReason = dlqErr instanceof Error ? dlqErr.message : String(dlqErr)
            logJson({
              severity: 'ERROR',
              message: 'webhook_dlq_publish_failed',
              endpointId: payload.endpointId,
              eventId: payload.eventId,
              event: payload.event,
              error: dlqReason.slice(0, 500),
            })
            // Swallow — Cloud Tasks still retries naturally via the 502 below.
          }
        }

        // Return a 5xx so Cloud Tasks retries (or eventually dead-letters).
        set.status = 502
        return { message: 'Delivery failed', error: reason.slice(0, 200) }
      }
    },
    {
      body: t.Object({
        endpointId: t.String({ minLength: 1 }),
        event: t.String({ minLength: 1 }),
        eventId: t.String({ minLength: 1 }),
        jsonBody: t.String(),
        occurredAt: t.String({ minLength: 1 }),
      }),
    },
  )

  /**
   * POST /api/internal/webhook-dlq
   * Invoked by the Pub/Sub push subscription on the dead-letter topic.
   * Cloud Tasks publishes to this topic after exhausting retries on a task.
   * We disable the endpoint so we stop sending to a known-broken URL.
   */
  .post(
    '/webhook-dlq',
    async ({ body, request, set }) => {
      const serviceUrl = process.env.SERVICE_URL ?? ''
      const taskSaEmail = process.env.CLOUD_TASKS_SA_EMAIL ?? ''

      const authResult = await authenticateOidcRequest(
        request.headers.get('authorization'),
        serviceUrl,
        taskSaEmail,
      )
      if (authResult) {
        set.status = authResult.status
        return { message: authResult.message }
      }

      const envelope = body as PubSubPushBody
      const dataB64 = envelope.message?.data
      if (!dataB64) {
        set.status = 400
        return { message: 'Pub/Sub message missing data' }
      }

      let originalPayload: Partial<DeliveryPayload>
      try {
        const decoded = Buffer.from(dataB64, 'base64').toString('utf8')
        originalPayload = JSON.parse(decoded) as Partial<DeliveryPayload>
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        logJson({
          severity: 'ERROR',
          message: 'webhook_dlq_decode_failed',
          error: reason,
          messageId: envelope.message?.messageId,
        })
        // Return 200 to acknowledge — there is nothing useful Pub/Sub can do by
        // retrying an undecodable message.
        return { ok: true, skipped: 'decode_failed' }
      }

      const endpointId = originalPayload.endpointId
      if (!endpointId) {
        logJson({
          severity: 'ERROR',
          message: 'webhook_dlq_missing_endpoint_id',
          messageId: envelope.message?.messageId,
        })
        return { ok: true, skipped: 'no_endpoint_id' }
      }

      // Read prior status BEFORE the update so we can distinguish first-time
      // disable from a duplicate DLQ publish (the handler now publishes from
      // /webhook-delivery on the final attempt, so two messages for the same
      // endpoint within a Cloud-Tasks-retry window is possible). Postgres
      // makes the update itself idempotent; we just need observability.
      const [priorRow] = await db
        .select({ status: appWebhookEndpoints.status })
        .from(appWebhookEndpoints)
        .where(eq(appWebhookEndpoints.id, endpointId))

      const now = new Date()
      await db
        .update(appWebhookEndpoints)
        .set({
          status: 'disabled',
          lastFailureAt: now,
          lastFailureReason: 'Cloud Tasks dead-letter: max retries exhausted',
          updatedAt: now,
        })
        .where(eq(appWebhookEndpoints.id, endpointId))

      if (priorRow?.status === 'disabled') {
        logJson({
          severity: 'INFO',
          message: 'webhook_dlq_duplicate',
          endpointId,
          eventId: originalPayload.eventId,
          event: originalPayload.event,
          messageId: envelope.message?.messageId,
        })
      } else {
        logJson({
          severity: 'WARNING',
          message: 'webhook_endpoint_disabled_via_dlq',
          endpointId,
          eventId: originalPayload.eventId,
          event: originalPayload.event,
          messageId: envelope.message?.messageId,
        })
      }

      return { ok: true }
    },
    {
      // Pub/Sub push body shape — we can't validate `data` strictly because it's
      // base64 of an arbitrary payload.
      body: t.Object({
        message: t.Object({
          data: t.Optional(t.String()),
          messageId: t.Optional(t.String()),
          publishTime: t.Optional(t.String()),
          attributes: t.Optional(t.Record(t.String(), t.String())),
        }),
        subscription: t.Optional(t.String()),
      }),
    },
  )
