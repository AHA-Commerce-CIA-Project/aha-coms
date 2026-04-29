/**
 * Webhook endpoint management routes for portal apps.
 *
 * All routes require portalRole === 'admin' (enforced by requireRole).
 * Mounted under /api/v1 alongside apps.ts and employees.ts.
 */

import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { appWebhookEndpoints, appRegistry } from '~/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { logAudit } from '../services/audit'
import {
  PORTAL_WEBHOOK_SIGNATURE_HEADER,
  PORTAL_WEBHOOK_EVENT_HEADER,
  PORTAL_WEBHOOK_EVENT_ID_HEADER,
  PORTAL_WEBHOOK_TIMESTAMP_HEADER,
  PORTAL_WEBHOOK_CONTRACT_VERSION,
  PORTAL_WEBHOOK_EVENTS,
} from '@coms-portal/shared'
import type { PortalWebhookEvent, PortalWebhookEnvelope, SessionRevokedPayload } from '@coms-portal/shared'
import { signWebhookBody } from '../services/webhook-dispatcher'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol === 'http:') {
      return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    }
    return false
  } catch {
    return false
  }
}

function areValidEvents(events: string[]): boolean {
  return events.every((e) => (PORTAL_WEBHOOK_EVENTS as readonly string[]).includes(e))
}

// ---------------------------------------------------------------------------
// Response shape (omits secret)
// ---------------------------------------------------------------------------

function toPublicEndpoint(row: typeof appWebhookEndpoints.$inferSelect) {
  return {
    id: row.id,
    appId: row.appId,
    url: row.url,
    subscribedEvents: row.subscribedEvents as string[],
    status: row.status,
    failureCount: row.failureCount,
    lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: row.lastFailureReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

// Prefix uses ':id' (not ':appId') because Elysia's router does not allow two
// different parameter names at the same path position, and apps.ts already
// registers '/apps/:id'. The inner endpoint param is renamed to ':endpointId'
// to avoid colliding with the outer ':id' from this prefix.
export const appWebhookRoutes = new Elysia({ prefix: '/apps/:id/webhooks' })
  .use(requireRole('admin'))

  // GET /api/v1/apps/:id/webhooks
  .get('/', async ({ params, set }) => {
    // Verify app exists
    const app = await db.query.appRegistry.findFirst({
      where: eq(appRegistry.id, params.id),
    })
    if (!app) {
      set.status = 404
      return { message: 'App not found' }
    }

    const rows = await db
      .select()
      .from(appWebhookEndpoints)
      .where(eq(appWebhookEndpoints.appId, params.id))

    return rows.map(toPublicEndpoint)
  }, { response: { 200: t.Array(t.Any()), 404: t.Object({ message: t.String() }) } })

  // POST /api/v1/apps/:id/webhooks
  .post(
    '/',
    async ({ params, body, authUser, requestId, actorIp, set }) => {
      // Validate app exists
      const app = await db.query.appRegistry.findFirst({
        where: eq(appRegistry.id, params.id),
      })
      if (!app) {
        set.status = 404
        return { message: 'App not found' }
      }

      // Validate URL
      if (!isValidWebhookUrl(body.url)) {
        set.status = 400
        return {
          message:
            'URL must use https:// (or http://localhost / http://127.0.0.1 for dev testing)',
        }
      }

      // Validate events
      if (!areValidEvents(body.subscribedEvents)) {
        set.status = 400
        return {
          message: `subscribedEvents contains unknown events. Valid values: ${PORTAL_WEBHOOK_EVENTS.join(', ')}`,
        }
      }

      // Generate secret: 32 random bytes as base64url
      const secretBytes = crypto.getRandomValues(new Uint8Array(32))
      const secret = Buffer.from(secretBytes).toString('base64url')

      const [row] = await db
        .insert(appWebhookEndpoints)
        .values({
          appId: params.id,
          url: body.url,
          secret,
          subscribedEvents: body.subscribedEvents,
          status: 'active',
        })
        .returning()

      await logAudit({
        actorId: authUser.id,
        action: 'create_webhook_endpoint',
        targetType: 'app',
        targetId: params.id,
        details: { endpointId: row.id, url: body.url, subscribedEvents: body.subscribedEvents },
        requestId,
        actorIp,
        targetAppId: params.id,
      })

      // Return the full row including secret — the ONLY time it is exposed
      return {
        ...toPublicEndpoint(row),
        secret,
      }
    },
    {
      body: t.Object({
        url: t.String({ minLength: 1 }),
        subscribedEvents: t.Array(t.String(), { minItems: 1 }),
      }),
      response: {
        200: t.Any(),
        400: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
    },
  )

  // PATCH /api/v1/apps/:id/webhooks/:endpointId
  .patch(
    '/:endpointId',
    async ({ params, body, set }) => {
      const existing = await db.query.appWebhookEndpoints.findFirst({
        where: and(
          eq(appWebhookEndpoints.id, params.endpointId),
          eq(appWebhookEndpoints.appId, params.id),
        ),
      })
      if (!existing) {
        set.status = 404
        return { message: 'Webhook endpoint not found' }
      }

      if (body.url !== undefined && !isValidWebhookUrl(body.url)) {
        set.status = 400
        return {
          message:
            'URL must use https:// (or http://localhost / http://127.0.0.1 for dev testing)',
        }
      }

      if (body.subscribedEvents !== undefined && !areValidEvents(body.subscribedEvents)) {
        set.status = 400
        return {
          message: `subscribedEvents contains unknown events. Valid values: ${PORTAL_WEBHOOK_EVENTS.join(', ')}`,
        }
      }

      const updates: Partial<typeof appWebhookEndpoints.$inferInsert> = {
        updatedAt: new Date(),
      }
      if (body.url !== undefined) updates.url = body.url
      if (body.subscribedEvents !== undefined) updates.subscribedEvents = body.subscribedEvents
      if (body.status !== undefined) updates.status = body.status

      const [updated] = await db
        .update(appWebhookEndpoints)
        .set(updates)
        .where(
          and(
            eq(appWebhookEndpoints.id, params.endpointId),
            eq(appWebhookEndpoints.appId, params.id),
          ),
        )
        .returning()

      return toPublicEndpoint(updated)
    },
    {
      body: t.Partial(
        t.Object({
          url: t.String({ minLength: 1 }),
          subscribedEvents: t.Array(t.String(), { minItems: 1 }),
          status: t.Union([t.Literal('active'), t.Literal('disabled')]),
        }),
      ),
      response: {
        200: t.Any(),
        400: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
    },
  )

  // POST /api/v1/apps/:id/webhooks/:endpointId/rotate-secret
  .post('/:endpointId/rotate-secret', async ({ params, authUser, requestId, actorIp, set }) => {
    const existing = await db.query.appWebhookEndpoints.findFirst({
      where: and(
        eq(appWebhookEndpoints.id, params.endpointId),
        eq(appWebhookEndpoints.appId, params.id),
      ),
    })
    if (!existing) {
      set.status = 404
      return { message: 'Webhook endpoint not found' }
    }

    const secretBytes = crypto.getRandomValues(new Uint8Array(32))
    const secret = Buffer.from(secretBytes).toString('base64url')

    await db
      .update(appWebhookEndpoints)
      .set({ secret, updatedAt: new Date() })
      .where(
        and(
          eq(appWebhookEndpoints.id, params.endpointId),
          eq(appWebhookEndpoints.appId, params.id),
        ),
      )

    await logAudit({
      actorId: authUser.id,
      action: 'rotate_webhook_secret',
      targetType: 'app',
      targetId: params.id,
      details: { endpointId: params.endpointId },
      requestId,
      actorIp,
      targetAppId: params.id,
    })

    return { secret }
  }, { response: { 200: t.Object({ secret: t.String() }), 404: t.Object({ message: t.String() }) } })

  // DELETE /api/v1/apps/:id/webhooks/:endpointId
  .delete('/:endpointId', async ({ params, authUser, requestId, actorIp, set }) => {
    const existing = await db.query.appWebhookEndpoints.findFirst({
      where: and(
        eq(appWebhookEndpoints.id, params.endpointId),
        eq(appWebhookEndpoints.appId, params.id),
      ),
    })
    if (!existing) {
      set.status = 404
      return { message: 'Webhook endpoint not found' }
    }

    await db
      .delete(appWebhookEndpoints)
      .where(
        and(
          eq(appWebhookEndpoints.id, params.endpointId),
          eq(appWebhookEndpoints.appId, params.id),
        ),
      )

    await logAudit({
      actorId: authUser.id,
      action: 'delete_webhook_endpoint',
      targetType: 'app',
      targetId: params.id,
      details: { endpointId: params.endpointId, url: existing.url },
      requestId,
      actorIp,
      targetAppId: params.id,
    })

    return { ok: true }
  }, { response: { 200: t.Object({ ok: t.Literal(true) }), 404: t.Object({ message: t.String() }) } })

  // POST /api/v1/apps/:id/webhooks/:endpointId/test
  .post('/:endpointId/test', async ({ params, set }) => {
    const existing = await db.query.appWebhookEndpoints.findFirst({
      where: and(
        eq(appWebhookEndpoints.id, params.endpointId),
        eq(appWebhookEndpoints.appId, params.id),
      ),
    })
    if (!existing) {
      set.status = 404
      return { message: 'Webhook endpoint not found' }
    }

    const now = new Date().toISOString()
    const eventId = crypto.randomUUID()

    // Synthetic session.revoked payload — does NOT write a revocation row
    const testPayload: SessionRevokedPayload = {
      userId: '00000000-0000-0000-0000-000000000000',
      gipUid: 'test',
      email: 'test@example.com',
      reason: 'admin',
      notBefore: now,
    }

    const envelope: PortalWebhookEnvelope<SessionRevokedPayload> = {
      contractVersion: PORTAL_WEBHOOK_CONTRACT_VERSION,
      event: 'session.revoked' as PortalWebhookEvent,
      eventId,
      occurredAt: now,
      appSlug: '', // filled by dispatcher in real sends; test sends go directly
      payload: testPayload,
    }

    const jsonBody = JSON.stringify(envelope)
    const signature = signWebhookBody(existing.secret, now, jsonBody)

    try {
      const response = await fetch(existing.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [PORTAL_WEBHOOK_SIGNATURE_HEADER]: signature,
          [PORTAL_WEBHOOK_EVENT_HEADER]: 'session.revoked',
          [PORTAL_WEBHOOK_EVENT_ID_HEADER]: eventId,
          [PORTAL_WEBHOOK_TIMESTAMP_HEADER]: now,
        },
        body: jsonBody,
        // 10 second timeout via AbortSignal
        signal: AbortSignal.timeout(10_000),
      })

      return {
        delivered: response.ok,
        status: response.status,
        ...(response.ok ? {} : { error: `HTTP ${response.status} ${response.statusText}` }),
      }
    } catch (err) {
      return {
        delivered: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }, { response: { 200: t.Object({ delivered: t.Boolean(), status: t.Optional(t.Number()), error: t.Optional(t.String()) }), 404: t.Object({ message: t.String() }) } })
