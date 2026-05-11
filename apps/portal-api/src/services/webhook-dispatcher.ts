/**
 * Webhook dispatcher — delivers portal events to registered app_webhook_endpoints.
 *
 * Retry strategy:
 *   - Attempt 1: inline, synchronous (fire-and-forget from the caller's perspective).
 *   - On failure: a Cloud Task is enqueued via the Cloud Tasks REST API. Cloud Tasks
 *     owns the retry schedule (max_attempts=3, 30s → 2m backoff per queue config).
 *   - Final attempt: When Cloud Tasks has exhausted all retries (retryCount === MAX_ATTEMPTS - 1),
 *     the inline handler at routes/internal.ts:144-182 disables the endpoint by setting
 *     appWebhookEndpoints.status to 'disabled'. This acts as the dead-letter queue —
 *     no external Pub/Sub topic involved.
 *
 * No in-process timers, no DB-backed job table — retries survive Cloud Run
 * scale-to-zero because Cloud Tasks dispatches them.
 */

import { verifyWebhookSignature, signWebhookPayload } from '@coms-portal/sdk'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { GoogleAuth } from 'google-auth-library'
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
import { logger } from '~/logger'

// ---------------------------------------------------------------------------
// OIDC token minting (Rev 2 §03 dual-mode)
// ---------------------------------------------------------------------------

// Module-scoped GoogleAuth instance — getIdTokenClient caches tokens internally
// (~55 min validity). A single instance reuses cached clients across calls.
const auth = new GoogleAuth()

/**
 * Mint a Google OIDC ID token for the given audience using the runtime's
 * service-account identity (metadata server on Cloud Run; ADC locally).
 *
 * Returns the raw JWT string (no "Bearer " prefix), or `null` when the
 * metadata server is unreachable (local dev without ADC / missing GCP env).
 * Callers fall back to HMAC-only when null is returned.
 */
export async function mintWebhookAudienceToken(audience: string): Promise<string | null> {
  try {
    const client = await auth.getIdTokenClient(audience)
    const headers = await client.getRequestHeaders()
    // getRequestHeaders returns a Headers instance (Web fetch API); use .get()
    const authHeader = headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('[webhook-dispatcher] OIDC: unexpected Authorization header format — falling back to HMAC-only')
      return null
    }
    return authHeader.slice('Bearer '.length)
  } catch (err) {
    logger.warn({ err }, '[webhook-dispatcher] OIDC token minting failed — proceeding with HMAC-only')
    return null
  }
}

// ---------------------------------------------------------------------------
// Signing helpers
// ---------------------------------------------------------------------------

/**
 * Pure signing helper — exported so that the test-send route can sign
 * one-off payloads without going through the full dispatch pipeline.
 *
 * Returns the value that should be set on PORTAL_WEBHOOK_SIGNATURE_HEADER.
 */
export function signWebhookBody(secret: string, timestamp: string, jsonBody: string): string {
  return signWebhookPayload(secret, timestamp, jsonBody)
}

export { verifyWebhookSignature }

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

type EndpointRow = typeof appWebhookEndpoints.$inferSelect & { appSlug: string }

/**
 * Perform a single HTTP delivery attempt. Throws on non-2xx or network error.
 * Exported for re-use by the internal /webhook-delivery route.
 *
 * Dual-mode (Rev 2 §03): when `oidcToken` is non-null the request carries both
 * `Authorization: Bearer <token>` (OIDC) and `X-Portal-Signature` (HMAC).
 * Receivers that understand OIDC verify the bearer token; legacy receivers
 * continue to use HMAC. Both headers are dropped together on Day-30 cleanup.
 */
export async function deliverWebhook(
  endpointUrl: string,
  endpointSecret: string,
  event: PortalWebhookEvent,
  jsonBody: string,
  eventId: string,
  occurredAt: string,
  fetchImpl: typeof fetch,
  oidcToken?: string | null,
  requestId?: string,
): Promise<void> {
  const signature = signWebhookPayload(endpointSecret, occurredAt, jsonBody)

  const extraHeaders: Record<string, string> = {}
  if (oidcToken) {
    extraHeaders['Authorization'] = `Bearer ${oidcToken}`
  }
  if (requestId) {
    extraHeaders['X-Coms-Request-Id'] = requestId
  }

  const response = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [PORTAL_WEBHOOK_SIGNATURE_HEADER]: signature,
      [PORTAL_WEBHOOK_EVENT_HEADER]: event,
      [PORTAL_WEBHOOK_EVENT_ID_HEADER]: eventId,
      [PORTAL_WEBHOOK_TIMESTAMP_HEADER]: occurredAt,
      ...extraHeaders,
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
  opts?: { appSlugs?: string[]; fetchImpl?: typeof fetch; requestId?: string },
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
        // Filter to requested app slugs when provided.
        // inArray emits `IN (?, ?, ...)` which postgres-js serialises correctly;
        // `slug = ANY($n)` with a JS array fails because postgres-js sends the
        // array as a comma-joined string and PG rejects it as a malformed array
        // literal.
        opts?.appSlugs?.length
          ? inArray(appRegistry.slug, opts.appSlugs)
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

      return inlineAttempt(endpoint, event, jsonBody, eventId, occurredAt, fetchImpl, opts?.requestId)
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
  requestId?: string,
): Promise<void> {
  const now = new Date()

  // Rev 2 §03: mint an OIDC token for this endpoint's origin (audience).
  // Falls back to null on local dev / metadata-server unavailability — the
  // dispatcher continues with HMAC-only in that case.
  const audience = new URL(endpoint.url).origin
  const oidcToken = await mintWebhookAudienceToken(audience)

  if (!oidcToken) {
    logger.warn({ endpointId: endpoint.id, audience }, '[webhook-dispatcher] OIDC degraded path — sending HMAC-only')
  }

  try {
    await deliverWebhook(endpoint.url, endpoint.secret, event, jsonBody, eventId, occurredAt, fetchImpl, oidcToken, requestId)

    // Success — reset failure state. Clearing lastFailureAt + lastFailureReason
    // (not just resetting failureCount) is what makes a recovered endpoint
    // stop showing the red "Last failed" timestamp in the admin panel.
    await db
      .update(appWebhookEndpoints)
      .set({
        failureCount: 0,
        lastDeliveredAt: now,
        lastFailureAt: null,
        lastFailureReason: null,
      })
      .where(eq(appWebhookEndpoints.id, endpoint.id))
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)

    logger.warn({ endpointId: endpoint.id, url: endpoint.url, reason }, '[webhook-dispatcher] inline delivery failed — enqueueing Cloud Task')

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
        requestId,
      })
    } catch (enqueueErr) {
      logger.error({ err: enqueueErr, endpointId: endpoint.id }, '[webhook-dispatcher] failed to enqueue Cloud Task')
    }
  }
}
