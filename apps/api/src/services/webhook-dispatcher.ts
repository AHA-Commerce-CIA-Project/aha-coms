/**
 * Webhook dispatcher — delivers portal events to registered app_webhook_endpoints.
 *
 * NOTE: The retry queue is in-process (module-level Map<id, Timer>).
 * If the API runs on multiple instances, deliveries will not be coordinated
 * and retries will be lost on restart. For multi-instance deployments this
 * must be replaced with a durable queue (BullMQ or a Postgres-backed job table).
 */

import { createHmac } from 'node:crypto'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '~/db'
import { appWebhookEndpoints } from '~/db/schema/app-webhook-endpoints'
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
// In-memory retry state
// ---------------------------------------------------------------------------

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000] // 30s, 2min, 10min

/** Tracks pending retry timers keyed by endpoint id. */
const pendingRetries = new Map<string, ReturnType<typeof setTimeout>>()

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

async function deliver(
  endpoint: EndpointRow,
  event: PortalWebhookEvent,
  jsonBody: string,
  eventId: string,
  occurredAt: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const signature = computeSignature(endpoint.secret, occurredAt, jsonBody)

  const response = await fetchImpl(endpoint.url, {
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

async function onDeliverySuccess(endpointId: string, now: Date): Promise<void> {
  pendingRetries.delete(endpointId)
  await db
    .update(appWebhookEndpoints)
    .set({ failureCount: 0, lastDeliveredAt: now })
    .where(eq(appWebhookEndpoints.id, endpointId))
}

async function onDeliveryFailure(
  endpoint: EndpointRow,
  event: PortalWebhookEvent,
  jsonBody: string,
  eventId: string,
  occurredAt: string,
  reason: string,
  attempt: number,
  fetchImpl: typeof fetch,
): Promise<void> {
  const now = new Date()
  const nextAttempt = attempt + 1

  if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
    // Disable endpoint after exhausting retries
    console.error(
      `[webhook-dispatcher] endpoint ${endpoint.id} (${endpoint.url}) disabled after ${MAX_RETRY_ATTEMPTS} failed attempts. Last error: ${reason}`,
    )
    await db
      .update(appWebhookEndpoints)
      .set({
        status: 'disabled',
        failureCount: sql`${appWebhookEndpoints.failureCount} + 1`,
        lastFailureAt: now,
        lastFailureReason: reason.slice(0, 500),
        updatedAt: now,
      })
      .where(eq(appWebhookEndpoints.id, endpoint.id))
    return
  }

  await db
    .update(appWebhookEndpoints)
    .set({
      failureCount: sql`${appWebhookEndpoints.failureCount} + 1`,
      lastFailureAt: now,
      lastFailureReason: reason.slice(0, 500),
      updatedAt: now,
    })
    .where(eq(appWebhookEndpoints.id, endpoint.id))

  const delayMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
  console.warn(
    `[webhook-dispatcher] endpoint ${endpoint.id} delivery failed (attempt ${nextAttempt}/${MAX_RETRY_ATTEMPTS}), retrying in ${delayMs / 1000}s. Reason: ${reason}`,
  )

  // Cancel any existing timer for this endpoint
  const existing = pendingRetries.get(endpoint.id)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pendingRetries.delete(endpoint.id)
    attemptDelivery(endpoint, event, jsonBody, eventId, occurredAt, nextAttempt, fetchImpl)
  }, delayMs)

  pendingRetries.set(endpoint.id, timer)
}

function attemptDelivery(
  endpoint: EndpointRow,
  event: PortalWebhookEvent,
  jsonBody: string,
  eventId: string,
  occurredAt: string,
  attempt: number,
  fetchImpl: typeof fetch,
): void {
  deliver(endpoint, event, jsonBody, eventId, occurredAt, fetchImpl)
    .then(() => onDeliverySuccess(endpoint.id, new Date()))
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err)
      onDeliveryFailure(endpoint, event, jsonBody, eventId, occurredAt, reason, attempt, fetchImpl)
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a portal webhook event to all active, subscribed endpoints.
 *
 * Fire-and-forget: the function returns immediately after kicking off parallel
 * deliveries. Retries happen via in-process setTimeout (see module-level note).
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

      return new Promise<void>((resolve) => {
        attemptDelivery(endpoint, event, jsonBody, eventId, occurredAt, 0, fetchImpl)
        // Resolve immediately — attemptDelivery is fire-and-forget with internal retry
        resolve()
      })
    }),
  ).catch(() => {
    // allSettled never rejects, but satisfy linters
  })
}
