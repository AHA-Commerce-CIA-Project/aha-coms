/**
 * Webhook dispatcher — delivers portal events to registered app_webhook_endpoints.
 *
 * Retry strategy:
 *   - Attempt 1: inline, synchronous (fire-and-forget from the caller's perspective).
 *   - On failure: a Cloud Task is enqueued via the Cloud Tasks REST API. Cloud Tasks
 *     owns the retry schedule (max_attempts=3, 30s → 2m backoff per queue config).
 *   - After Cloud Tasks exhausts retries, the dead-letter Pub/Sub topic fires and
 *     /api/internal/webhook-dlq disables the endpoint.
 *
 * No in-process timers, no DB-backed job table — retries survive Cloud Run
 * scale-to-zero because Cloud Tasks dispatches them.
 */

import { createHmac } from 'node:crypto'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '~/db'
import { appWebhookEndpoints } from '~/db/schema/app-webhook-endpoints'
import { appRegistry } from '~/db/schema/apps'
import { enqueueWebhookDelivery } from './cloud-tasks-client'
import type {
  PortalWebhookEvent,
  PortalWebhookEnvelope,
} from '@coms-portal/shared'
import {
  PORTAL_WEBHOOK_CONTRACT_VERSION,
  PORTAL_WEBHOOK_SIGNATURE_HEADER,
  PORTAL_WEBHOOK_EVENT_HEADER,
  PORTAL_WEBHOOK_EVENT_ID_HEADER,
  PORTAL_WEBHOOK_TIMESTAMP_HEADER,
} from '@coms-portal/shared'

// ---------------------------------------------------------------------------
// Signing helpers
// ---------------------------------------------------------------------------

/**
 * Sign a webhook payload.
 *
 * Format: sha256=hex(HMAC-SHA256(secret, timestamp + '.' + jsonBody))
 * Relying parties verify by recomputing the same HMAC over the raw request body
 * using the shared secret and comparing to the header value in constant time.
 */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expected = computeSignature(secret, timestamp, rawBody)
  // Constant-time compare to prevent timing attacks
  if (signatureHeader.length !== expected.length) return false
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && Buffer.compare(a, b) === 0 // timingSafeEqual via compare
}

function computeSignature(secret: string, timestamp: string, jsonBody: string): string {
  const mac = createHmac('sha256', secret)
    .update(`${timestamp}.${jsonBody}`)
    .digest('hex')
  return `sha256=${mac}`
}

/**
 * Pure signing helper — exported so that the test-send route can sign
 * one-off payloads without going through the full dispatch pipeline.
 *
 * Returns the value that should be set on PORTAL_WEBHOOK_SIGNATURE_HEADER.
 */
export function signWebhookBody(secret: string, timestamp: string, jsonBody: string): string {
  return computeSignature(secret, timestamp, jsonBody)
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

type EndpointRow = typeof appWebhookEndpoints.$inferSelect & { appSlug: string }

/**
 * Perform a single HTTP delivery attempt. Throws on non-2xx or network error.
 * Exported for re-use by the internal /webhook-delivery route.
 */
export async function deliverWebhook(
  endpointUrl: string,
  endpointSecret: string,
  event: PortalWebhookEvent,
  jsonBody: string,
  eventId: string,
  occurredAt: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const signature = computeSignature(endpointSecret, occurredAt, jsonBody)

  const response = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [PORTAL_WEBHOOK_SIGNATURE_HEADER]: signature,
      [PORTAL_WEBHOOK_EVENT_HEADER]: event,
      [PORTAL_WEBHOOK_EVENT_ID_HEADER]: eventId,
      [PORTAL_WEBHOOK_TIMESTAMP_HEADER]: occurredAt,
    },
    body: jsonBody,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a portal webhook event to all active, subscribed endpoints.
 *
 * Fire-and-forget: the function returns immediately after kicking off parallel
 * deliveries. On first-attempt success, the endpoint stats are updated inline.
 * On first-attempt failure, a Cloud Task is enqueued for retry; Cloud Tasks
 * owns the schedule and dead-lettering.
 *
 * @param event     - The event name (must be in PORTAL_WEBHOOK_EVENTS)
 * @param payload   - Event-specific payload object
 * @param opts.appSlugs - If provided, only deliver to endpoints whose app slug is
 *                        in this list. Omit to fan out to all subscribed apps.
 * @param fetchImpl - Override the fetch implementation (useful for testing).
 */
export async function dispatchPortalWebhook<T>(
  event: PortalWebhookEvent,
  payload: T,
  opts?: { appSlugs?: string[]; fetchImpl?: typeof fetch },
): Promise<void> {
  const fetchImpl = opts?.fetchImpl ?? fetch

  // Fetch active endpoints that subscribe to this event.
  // We join to appRegistry to get the app slug for the envelope.
  const rows = await db
    .select({
      id: appWebhookEndpoints.id,
      appId: appWebhookEndpoints.appId,
      url: appWebhookEndpoints.url,
      secret: appWebhookEndpoints.secret,
      subscribedEvents: appWebhookEndpoints.subscribedEvents,
      status: appWebhookEndpoints.status,
      failureCount: appWebhookEndpoints.failureCount,
      lastDeliveredAt: appWebhookEndpoints.lastDeliveredAt,
      lastFailureAt: appWebhookEndpoints.lastFailureAt,
      lastFailureReason: appWebhookEndpoints.lastFailureReason,
      createdAt: appWebhookEndpoints.createdAt,
      updatedAt: appWebhookEndpoints.updatedAt,
      appSlug: appRegistry.slug,
    })
    .from(appWebhookEndpoints)
    .innerJoin(appRegistry, eq(appWebhookEndpoints.appId, appRegistry.id))
    .where(
      and(
        eq(appWebhookEndpoints.status, 'active'),
        // Filter to requested app slugs when provided
        opts?.appSlugs?.length
          ? sql`${appRegistry.slug} = ANY(${opts.appSlugs})`
          : undefined,
      ),
    )

  // Filter in JS for the event subscription (JSONB contains check)
  const subscribed = rows.filter((row) =>
    (row.subscribedEvents as string[]).includes(event),
  )

  if (subscribed.length === 0) return

  const occurredAt = new Date().toISOString()

  // Kick off all deliveries in parallel; don't await — fire and forget
  Promise.allSettled(
    subscribed.map((endpoint) => {
      const eventId = crypto.randomUUID()
      const envelope: PortalWebhookEnvelope<T> = {
        contractVersion: PORTAL_WEBHOOK_CONTRACT_VERSION,
        event,
        eventId,
        occurredAt,
        appSlug: endpoint.appSlug,
        payload,
      }
      const jsonBody = JSON.stringify(envelope)

      return inlineAttempt(endpoint, event, jsonBody, eventId, occurredAt, fetchImpl)
    }),
  ).catch(() => {
    // allSettled never rejects, but satisfy linters
  })
}

/**
 * Perform the inline (first) delivery attempt.
 * On success: update endpoint stats (failureCount=0, lastDeliveredAt).
 * On failure: increment endpoint failure stats and enqueue a Cloud Task that
 * will hit /api/internal/webhook-delivery after the queue's configured backoff.
 * Cloud Tasks handles further retries; the DLQ handler disables the endpoint
 * once retries are exhausted.
 */
async function inlineAttempt(
  endpoint: EndpointRow,
  event: PortalWebhookEvent,
  jsonBody: string,
  eventId: string,
  occurredAt: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const now = new Date()
  try {
    await deliverWebhook(endpoint.url, endpoint.secret, event, jsonBody, eventId, occurredAt, fetchImpl)

    // Success — reset failure state
    await db
      .update(appWebhookEndpoints)
      .set({ failureCount: 0, lastDeliveredAt: now })
      .where(eq(appWebhookEndpoints.id, endpoint.id))
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)

    console.warn(
      `[webhook-dispatcher] endpoint ${endpoint.id} (${endpoint.url}) inline delivery failed. Enqueueing Cloud Task. Reason: ${reason}`,
    )

    // Update endpoint failure stats — same as before, the dispatcher always owns
    // the inline-failure stats write.
    await db
      .update(appWebhookEndpoints)
      .set({
        failureCount: sql`${appWebhookEndpoints.failureCount} + 1`,
        lastFailureAt: now,
        lastFailureReason: reason.slice(0, 500),
        updatedAt: now,
      })
      .where(eq(appWebhookEndpoints.id, endpoint.id))

    // Hand retry off to Cloud Tasks. The queue config (max_attempts=3,
    // min_backoff=30s, max_backoff=300s, max_doublings=2) drives the schedule.
    try {
      await enqueueWebhookDelivery({
        endpointId: endpoint.id,
        event,
        eventId,
        jsonBody,
        occurredAt,
      })
    } catch (enqueueErr) {
      console.error(
        `[webhook-dispatcher] Failed to enqueue Cloud Task for endpoint ${endpoint.id}:`,
        enqueueErr,
      )
    }
  }
}
