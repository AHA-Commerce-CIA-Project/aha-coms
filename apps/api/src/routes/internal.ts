/**
 * Internal HTTP endpoints invoked by Cloud Tasks.
 *
 * The endpoint requires a Google-issued OIDC ID token whose audience matches
 * SERVICE_URL and whose `email` claim matches CLOUD_TASKS_SA_EMAIL.
 */
import { Elysia, t } from 'elysia'
import { eq, sql } from 'drizzle-orm'
import { db } from '~/db'
import { appWebhookEndpoints } from '~/db/schema/app-webhook-endpoints'
import { otpCodes } from '~/db/schema/otp-codes'
import { otpRequestLog } from '~/db/schema/otp-request-log'
import { deliverWebhook } from '~/services/webhook-dispatcher'
import { verifyGoogleOidcToken } from '~/services/oidc-verifier'
import type { PortalWebhookEvent } from '@coms-portal/shared'
import { logger } from '~/logger'

// Must match `retry_config.max_attempts` in infra/cloud-tasks.tf. On the final
// attempt the handler disables the endpoint directly — Cloud Tasks has no
// native dead-letter forwarder, so without this the task would be silently
// dropped and the broken endpoint would keep being selected on every event.
const MAX_ATTEMPTS = 3

interface DeliveryPayload {
  endpointId: string
  event: string
  eventId: string
  jsonBody: string
  occurredAt: string
  requestId?: string
}

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
   * On the final attempt, also disables the endpoint before returning 5xx.
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
      // Re-use the original request's trace ID so the full chain shares one ID.
      const log = payload.requestId ? logger.child({ requestId: payload.requestId }) : logger

      try {
        const [endpoint] = await db
          .select()
          .from(appWebhookEndpoints)
          .where(eq(appWebhookEndpoints.id, payload.endpointId))

        if (!endpoint || endpoint.status !== 'active') {
          // Endpoint is gone or already disabled — nothing to deliver. Return 200
          // so Cloud Tasks marks the task done; we do not want it retrying a no-op.
          log.warn({
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
          undefined,
          payload.requestId,
        )

        const now = new Date()
        await db
          .update(appWebhookEndpoints)
          .set({
            failureCount: 0,
            lastDeliveredAt: now,
            lastFailureAt: null,
            lastFailureReason: null,
            updatedAt: now,
          })
          .where(eq(appWebhookEndpoints.id, endpoint.id))

        log.info({
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
        log.error({
          message: 'webhook_delivery_attempt',
          endpointId: payload.endpointId,
          eventId: payload.eventId,
          event: payload.event,
          retryCount,
          status: 'failure',
          error: reason.slice(0, 500),
          durationMs: Date.now() - start,
        })

        // On the final attempt (retry count is 0-indexed), disable the endpoint
        // so we stop selecting it on future events. Postgres makes the UPDATE
        // idempotent, so a Cloud-Tasks-redispatch race produces a no-op.
        const retryCountNum = Number.parseInt(retryCount, 10)
        if (Number.isFinite(retryCountNum) && retryCountNum === MAX_ATTEMPTS - 1) {
          const now = new Date()
          try {
            await db
              .update(appWebhookEndpoints)
              .set({
                status: 'disabled',
                lastFailureAt: now,
                lastFailureReason: 'Cloud Tasks retries exhausted',
                updatedAt: now,
              })
              .where(eq(appWebhookEndpoints.id, payload.endpointId))

            log.warn({
              message: 'webhook_endpoint_disabled',
              endpointId: payload.endpointId,
              eventId: payload.eventId,
              event: payload.event,
            })
          } catch (disableErr) {
            const disableReason =
              disableErr instanceof Error ? disableErr.message : String(disableErr)
            log.error({
              message: 'webhook_endpoint_disable_failed',
              endpointId: payload.endpointId,
              eventId: payload.eventId,
              event: payload.event,
              error: disableReason.slice(0, 500),
            })
            // Swallow — we still want to return 502 so Cloud Tasks records the
            // failure in its own metrics, even if the disable UPDATE failed.
          }
        }

        // Return a 5xx so Cloud Tasks retries (or, on the final attempt, drops).
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
        requestId: t.Optional(t.String()),
      }),
    },
  )

  /**
   * POST /api/internal/cleanup/otp
   * Invoked by Cloud Scheduler. Prunes expired OTP data:
   *   - otp_codes rows where expiresAt < NOW() - 7 days
   *   - otp_request_log rows where requestedAt < NOW() - 24 hours
   *
   * Protected by Google OIDC ID token whose email must match
   * OTP_CLEANUP_SCHEDULER_SA_EMAIL (a dedicated Scheduler service account).
   */
  .post(
    '/cleanup/otp',
    async ({ request, set }) => {
      const serviceUrl = process.env.SERVICE_URL ?? ''
      const cleanupSaEmail = process.env.OTP_CLEANUP_SCHEDULER_SA_EMAIL ?? ''
      if (!cleanupSaEmail) {
        set.status = 500
        return { message: 'OTP_CLEANUP_SCHEDULER_SA_EMAIL not configured' }
      }
      const authResult = await authenticateOidcRequest(
        request.headers.get('authorization'),
        serviceUrl,
        cleanupSaEmail,
      )
      if (authResult) {
        set.status = authResult.status
        return { message: authResult.message }
      }
      // Prune expired otp_codes (>7d past expiry) and otp_request_log (>24h old)
      const codesDeleted = await db
        .delete(otpCodes)
        .where(sql`${otpCodes.expiresAt} < now() - interval '7 days'`)
        .returning({ id: otpCodes.id })
      const logDeleted = await db
        .delete(otpRequestLog)
        .where(sql`${otpRequestLog.requestedAt} < now() - interval '24 hours'`)
        .returning({ id: otpRequestLog.id })
      logger.info(
        { otpCodesDeleted: codesDeleted.length, otpRequestLogDeleted: logDeleted.length },
        '[internal] otp cleanup complete',
      )
      return {
        otpCodesDeleted: codesDeleted.length,
        otpRequestLogDeleted: logDeleted.length,
      }
    },
  )
