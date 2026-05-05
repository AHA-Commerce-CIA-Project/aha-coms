/**
 * Taxonomy + employment webhook emit helpers.
 *
 * All three emit functions are gated by ENABLE_TAXONOMY_EVENTS env var.
 * When NOT 'true' (the default) they no-op silently.
 *
 * PR 07-2: implementation-only. No callers wired yet — that's PR 07-3.
 */

import { db } from '~/db'
import { appManifests } from '~/db/schema/app-manifests'
import { appRegistry } from '~/db/schema/apps'
import { eq, sql } from 'drizzle-orm'
import { dispatchPortalWebhook } from '~/services/portal-webhook-fanout'
import type { PortalWebhookEvent } from '@coms-portal/shared'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Local payload types (frozen until @coms-portal/shared v1.6.0 in PR 07-4)
// ---------------------------------------------------------------------------

export interface TaxonomyUpsertedPayload {
  taxonomyId: string
  entries: Array<{ key: string; value: string; metadata: Record<string, unknown> | null }>
}

export interface TaxonomyDeletedPayload {
  taxonomyId: string
  keys: string[]
}

export interface EmploymentUpdatedPayload {
  user: { portalSub: string }
  employment: Record<string, unknown>
  previousEmployment: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helper: find app slugs subscribed to a given taxonomyId
// ---------------------------------------------------------------------------

async function getSubscribedAppSlugs(taxonomyId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: appRegistry.slug })
    .from(appManifests)
    .innerJoin(appRegistry, eq(appRegistry.id, appManifests.appId))
    .where(
      // jsonb @> operator: manifests whose taxonomies array contains the given id.
      // jsonb_build_array keeps taxonomyId as a bound parameter (no injection risk).
      // The ::text cast is required — without it Postgres reports
      // "could not determine data type of parameter $1" because
      // jsonb_build_array accepts anyelement.
      // Drizzle's arrayContains targets native PG arrays, not jsonb, so we use sql here.
      sql`${appManifests.taxonomies} @> jsonb_build_array(${taxonomyId}::text)`,
    )

  return rows.map((r) => r.slug)
}

// ---------------------------------------------------------------------------
// emitTaxonomyUpserted
// ---------------------------------------------------------------------------

/**
 * Emit taxonomy.upserted for a batch of entries under one taxonomyId.
 * Per spec §Race window: callers always pass the full entries array —
 * one envelope per (taxonomyId, batchId), never one per entry.
 */
export async function emitTaxonomyUpserted(params: TaxonomyUpsertedPayload): Promise<void> {
  if (process.env.ENABLE_TAXONOMY_EVENTS !== 'true') return

  const appSlugs = await getSubscribedAppSlugs(params.taxonomyId)
  if (appSlugs.length === 0) return

  await dispatchPortalWebhook(
    'taxonomy.upserted' as PortalWebhookEvent,
    {
      taxonomyId: params.taxonomyId,
      entries: params.entries,
    },
    { appSlugs },
  )
}

// ---------------------------------------------------------------------------
// emitTaxonomyDeleted
// ---------------------------------------------------------------------------

export async function emitTaxonomyDeleted(params: TaxonomyDeletedPayload): Promise<void> {
  if (process.env.ENABLE_TAXONOMY_EVENTS !== 'true') return

  const appSlugs = await getSubscribedAppSlugs(params.taxonomyId)
  if (appSlugs.length === 0) return

  await dispatchPortalWebhook(
    'taxonomy.deleted' as PortalWebhookEvent,
    {
      taxonomyId: params.taxonomyId,
      keys: params.keys,
    },
    { appSlugs },
  )
}

// ---------------------------------------------------------------------------
// emitEmploymentUpdated
// ---------------------------------------------------------------------------

/**
 * Emit employment.updated.
 * No per-app filter — every subscribed endpoint receives this event
 * (the dispatcher handles the fan-out via subscribedEvents filtering).
 */
export async function emitEmploymentUpdated(params: EmploymentUpdatedPayload): Promise<void> {
  if (process.env.ENABLE_TAXONOMY_EVENTS !== 'true') return

  await dispatchPortalWebhook(
    'employment.updated' as PortalWebhookEvent,
    {
      user: params.user,
      employment: params.employment,
      previousEmployment: params.previousEmployment,
    },
  )
}

// Prevent unused import warning on randomUUID (used in bulk batch IDs elsewhere)
void randomUUID
