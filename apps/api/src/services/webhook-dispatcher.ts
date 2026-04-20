/**
 * Webhook dispatcher — delivers portal events to registered app_webhook_endpoints.
 *
 * Retry strategy (durable, Postgres-backed):
 *   - Attempt 1: inline, synchronous (fire-and-forget from the caller's perspective).
 *   - On failure: a `webhook_delivery_jobs` row is inserted with attemptCount=1 and
 *     nextAttemptAt = now + 30s. The webhook-delivery-worker polls and processes it.
 *   - Attempt 2 (worker): on failure, nextAttemptAt = +2min (attemptCount=2).
 *   - Attempt 3 (worker): on failure, endpoint disabled (attemptCount=3).
 *
 * No in-process timers — retries survive Cloud Run restarts and scale-to-zero.
 */

import { createHmac } from 'node:crypto'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '~/db'
import { appWebhookEndpoints } from '~/db/schema/app-webhook-endpoints'
import { webhookDeliveryJobs } from '~/db/schema/webhook-delivery-jobs'
import { appRegistry } from '~/db/schema/apps'
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
// Retry constants — shared with webhook-delivery-worker.ts
//
// Retry cadence (from the user's perspective, T=0 is when the event fires):
//   T+0     inline attempt (attempt 1)  — this file
//   T+30s   job retry     (attempt 2)  — worker
//   T+2m30s job retry     (attempt 3)  — worker → on failure, disable endpoint
//
// RETRY_DELAYS_MS[i] is the delay before attempt (i+2), i.e. indexed by the
// current attemptCount after the failure:
//   attemptCount=1 after inline fail  → delay[0] = 30s  → schedules attempt 2
//   attemptCount=2 after retry fail   → delay[1] = 120s → schedules attempt 3
//   attemptCount=3                    → MAX reached, disable (no further retry)
// ---------------------------------------------------------------------------

export const MAX_RETRY_ATTEMPTS = 3
export const RETRY_DELAYS_MS = [30_000, 120_000] as const // 30s, 2min

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
 * Exported for re-use by the worker.
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
 * On first-attempt failure, a durable `webhook_delivery_jobs` row is inserted
 * for the worker to pick up and retry (30s, 2min cadence; disabled after 3 total
 * failures).
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
 * On failure: insert a webhook_delivery_jobs row for durable retry.
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
      `[webhook-dispatcher] endpoint ${endpoint.id} (${endpoint.url}) inline delivery failed. Enqueueing for retry. Reason: ${reason}`,
    )

    // Update endpoint failure stats
    await db
      .update(appWebhookEndpoints)
      .set({
        failureCount: sql`${appWebhookEndpoints.failureCount} + 1`,
        lastFailureAt: now,
        lastFailureReason: reason.slice(0, 500),
        updatedAt: now,
      })
      .where(eq(appWebhookEndpoints.id, endpoint.id))

    // Enqueue a durable job for the worker to pick up.
    // attemptCount=1: the inline attempt counts as attempt 1.
    // nextAttemptAt=+30s: first worker retry is 30s from now.
    const nextAttemptAt = new Date(now.getTime() + RETRY_DELAYS_MS[0])
    await db.insert(webhookDeliveryJobs).values({
      endpointId: endpoint.id,
      event,
      eventId,
      jsonBody,
      occurredAt: new Date(occurredAt),
      attemptCount: 1,
      nextAttemptAt,
      status: 'pending',
      lastError: reason.slice(0, 500),
    })
  }
}
