import { Elysia, t } from 'elysia'
import { eq, and } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry, appWebhookEndpoints } from '~/db/schema'
import { requireAppToken } from '~/middleware/app-token'
import { signWebhookBody, mintWebhookAudienceToken } from '~/services/webhook-dispatcher'
import {
  PORTAL_WEBHOOK_CONTRACT_VERSION,
  PORTAL_WEBHOOK_SIGNATURE_HEADER,
  PORTAL_WEBHOOK_EVENT_HEADER,
  PORTAL_WEBHOOK_EVENT_ID_HEADER,
  PORTAL_WEBHOOK_TIMESTAMP_HEADER,
} from '@coms-portal/shared'
import type { PortalWebhookEvent, PortalWebhookEnvelope } from '@coms-portal/shared'

/**
 * Spec 06 (Rev 4) PR A — onboarding smoketest endpoint.
 *
 * Mirrors `app-manifest.ts`: same OIDC auth path (`requireAppToken`), URL slug
 * captured as `:id` (Elysia's router requires the same param name across
 * sibling routes), caller slug must equal URL slug.
 *
 * Behaviour:
 *   1. Confirms the app is registered (404) and active (409).
 *   2. Synthesises an `app.smoketest` envelope and dispatches it synchronously
 *      to every active webhook endpoint, capturing per-endpoint status and
 *      latency. Disabled endpoints are skipped.
 *   3. Returns the registry summary so the CLI can render step 1 of its output
 *      (`app registered, status=active, handoff_mode=…`) in a single call.
 *
 * The smoketest event is dispatched directly (not via `dispatchPortalWebhook`)
 * because the CLI wants per-endpoint timing in the response, and the standard
 * fan-out path is fire-and-forget. Receiver-side: brownfield handlers
 * recognise `app.smoketest` and ack 2xx without business processing — see the
 * "Spec 07 envelope contract" subsection of the integrator quickstart.
 */
export const appSmoketestRoutes = new Elysia({ prefix: '/apps/:id/smoketest' })
  .use(requireAppToken())
  .post(
    '/',
    async ({ params, status, app }) => {
      // params.id holds the app slug captured from the URL — see app-manifest.ts.
      const slugFromPath = params.id

      if (app.slug !== slugFromPath) {
        throw status(403, { error: 'forbidden', reason: 'app_mismatch' })
      }

      const registryRow = await db.query.appRegistry.findFirst({
        where: eq(appRegistry.slug, slugFromPath),
      })

      if (!registryRow) {
        throw status(404, {
          error: 'app_not_registered',
          reason: `No app_registry row for slug '${slugFromPath}'`,
        })
      }

      if (registryRow.status !== 'active') {
        throw status(409, {
          error: 'app_not_active',
          reason: `app_registry.status is '${registryRow.status}', expected 'active'`,
        })
      }

      const allEndpointRows = await db
        .select()
        .from(appWebhookEndpoints)
        .where(
          and(
            eq(appWebhookEndpoints.appId, registryRow.id),
            eq(appWebhookEndpoints.status, 'active'),
          ),
        )
      // Defensive JS-side filter: dispatchPortalWebhook applies the same
      // belt-and-braces pattern (line 200) for the event-subscription check.
      const endpointRows = allEndpointRows.filter((e) => e.status === 'active')

      const occurredAt = new Date().toISOString()

      const results = await Promise.all(
        endpointRows.map(async (endpoint) => {
          const eventId = crypto.randomUUID()
          // 'app.smoketest' is part of `PORTAL_WEBHOOK_EVENTS` as of
          // `@coms-portal/shared@v1.7.0` (Rev 4 Spec 06 — see the package's
          // CHANGELOG). No cast needed; the literal narrows to
          // PortalWebhookEvent directly.
          const event: PortalWebhookEvent = 'app.smoketest'

          const envelope: PortalWebhookEnvelope<{ note: string }> = {
            contractVersion: PORTAL_WEBHOOK_CONTRACT_VERSION,
            event,
            eventId,
            occurredAt,
            appSlug: registryRow.slug,
            payload: {
              note: 'Spec 06 onboarding smoketest — receivers should ack 2xx and skip business processing.',
            },
          }

          const jsonBody = JSON.stringify(envelope)
          const signature = signWebhookBody(endpoint.secret, occurredAt, jsonBody)

          const audience = new URL(endpoint.url).origin
          const oidcToken = await mintWebhookAudienceToken(audience)

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            [PORTAL_WEBHOOK_SIGNATURE_HEADER]: signature,
            [PORTAL_WEBHOOK_EVENT_HEADER]: event,
            [PORTAL_WEBHOOK_EVENT_ID_HEADER]: eventId,
            [PORTAL_WEBHOOK_TIMESTAMP_HEADER]: occurredAt,
          }
          if (oidcToken) headers['Authorization'] = `Bearer ${oidcToken}`

          const startedAt = performance.now()
          try {
            const response = await fetch(endpoint.url, {
              method: 'POST',
              headers,
              body: jsonBody,
              signal: AbortSignal.timeout(10_000),
            })
            const latencyMs = Math.round(performance.now() - startedAt)
            return response.ok
              ? {
                  endpointId: endpoint.id,
                  url: endpoint.url,
                  status: response.status,
                  latencyMs,
                }
              : {
                  endpointId: endpoint.id,
                  url: endpoint.url,
                  status: response.status,
                  latencyMs,
                  error: `HTTP ${response.status} ${response.statusText}`,
                }
          } catch (err) {
            const latencyMs = Math.round(performance.now() - startedAt)
            return {
              endpointId: endpoint.id,
              url: endpoint.url,
              status: null,
              latencyMs,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )

      return {
        app: {
          id: registryRow.id,
          slug: registryRow.slug,
          name: registryRow.name,
          url: registryRow.url,
          status: registryRow.status,
          handoffMode: registryRow.handoffMode,
        },
        endpoints: results,
        ok: results.every((r) => r.status !== null && r.status >= 200 && r.status < 300),
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          app: t.Object({
            id: t.String(),
            slug: t.String(),
            name: t.String(),
            url: t.String(),
            status: t.String(),
            handoffMode: t.String(),
          }),
          endpoints: t.Array(
            t.Object({
              endpointId: t.String(),
              url: t.String(),
              status: t.Union([t.Number(), t.Null()]),
              latencyMs: t.Number(),
              error: t.Optional(t.String()),
            }),
          ),
          ok: t.Boolean(),
        }),
        403: t.Object({ error: t.String(), reason: t.String() }),
        404: t.Object({ error: t.String(), reason: t.String() }),
        409: t.Object({ error: t.String(), reason: t.String() }),
      },
    },
  )
