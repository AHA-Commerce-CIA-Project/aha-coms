/**
 * Taxonomy DB service layer.
 * Pure data access — no HTTP, no event emission.
 */

import { db } from '~/db'
import { orgTaxonomies } from '~/db/schema/org-taxonomies'
import { appManifests } from '~/db/schema/app-manifests'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { OrgTaxonomy } from '~/db/schema/org-taxonomies'

export type { OrgTaxonomy }

// ---------------------------------------------------------------------------
// getTaxonomyEntriesForApp
// ---------------------------------------------------------------------------

export interface TaxonomyGroup {
  taxonomyId: string
  entries: Array<{ key: string; value: string; metadata: Record<string, unknown> | null }>
}

export interface TaxonomySyncResult {
  taxonomies: TaxonomyGroup[]
  syncedAt: string
}

/**
 * Returns all taxonomy entries for every taxonomy the given app subscribes to.
 * The app's manifest `taxonomies` field drives which taxonomy_ids are included.
 */
export async function getTaxonomyEntriesForApp(appId: string): Promise<TaxonomySyncResult> {
  const syncedAt = new Date().toISOString()

  // Load the manifest to get subscribed taxonomy IDs
  const [manifest] = await db
    .select({ taxonomies: appManifests.taxonomies })
    .from(appManifests)
    .where(eq(appManifests.appId, appId))
    .limit(1)

  if (!manifest || !manifest.taxonomies || (manifest.taxonomies as string[]).length === 0) {
    return { taxonomies: [], syncedAt }
  }

  const subscribedIds = manifest.taxonomies as string[]

  // Fetch all entries for subscribed taxonomies in one query
  const rows = await db
    .select({
      id: orgTaxonomies.id,
      taxonomyId: orgTaxonomies.taxonomyId,
      key: orgTaxonomies.key,
      value: orgTaxonomies.value,
      metadata: orgTaxonomies.metadata,
      createdAt: orgTaxonomies.createdAt,
      updatedAt: orgTaxonomies.updatedAt,
      updatedBy: orgTaxonomies.updatedBy,
    })
    .from(orgTaxonomies)
    .where(inArray(orgTaxonomies.taxonomyId, subscribedIds))

  // Group by taxonomyId maintaining the subscribed order
  const grouped = new Map<string, TaxonomyGroup>()
  for (const id of subscribedIds) {
    grouped.set(id, { taxonomyId: id, entries: [] })
  }
  for (const row of rows) {
    const group = grouped.get(row.taxonomyId)
    if (group) {
      group.entries.push({
        key: row.key,
        value: row.value,
        metadata: row.metadata as Record<string, unknown> | null,
      })
    }
  }

  return {
    taxonomies: Array.from(grouped.values()),
    syncedAt,
  }
}

// ---------------------------------------------------------------------------
// listAllTaxonomyIds
// ---------------------------------------------------------------------------

/**
 * Returns the distinct union of all taxonomy IDs from all app manifests.
 * Used to populate the admin sidebar.
 */
export async function listAllTaxonomyIds(): Promise<string[]> {
  const rows = await db
    .select({ taxonomies: appManifests.taxonomies })
    .from(appManifests)

  const seen = new Set<string>()
  for (const row of rows) {
    const ids = (row.taxonomies ?? []) as string[]
    for (const id of ids) {
      seen.add(id)
    }
  }
  return Array.from(seen)
}

// ---------------------------------------------------------------------------
// getTaxonomyEntryCounts
// ---------------------------------------------------------------------------

/**
 * Returns one `{ taxonomyId, entryCount }` row per taxonomy ID known to any
 * app manifest. Taxonomies with zero entries are included (count = 0).
 * Replaces the N+1 Promise.all loop in the admin GET / route.
 */
export async function getTaxonomyEntryCounts(): Promise<
  { taxonomyId: string; entryCount: number }[]
> {
  const ids = await listAllTaxonomyIds()
  if (ids.length === 0) return []

  // drizzle-orm 0.45.x doesn't re-export `count` from the main entry point
  // (it lives under drizzle-orm/sql/functions/aggregate.js), so the typed
  // import passes `tsc --noEmit` but explodes at Bun's runtime ESM load.
  // Raw SQL is the portable shape used elsewhere in the repo (cf. the
  // correlated subquery in apps/heroes-api/src/repositories/teams.ts).
  const rows = await db
    .select({
      taxonomyId: orgTaxonomies.taxonomyId,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(orgTaxonomies)
    .where(inArray(orgTaxonomies.taxonomyId, ids))
    .groupBy(orgTaxonomies.taxonomyId)

  const counted = new Map(rows.map((r) => [r.taxonomyId, r.entryCount]))
  return ids.map((taxonomyId) => ({ taxonomyId, entryCount: counted.get(taxonomyId) ?? 0 }))
}

// ---------------------------------------------------------------------------
// listTaxonomyEntries
// ---------------------------------------------------------------------------

export async function listTaxonomyEntries(taxonomyId: string): Promise<OrgTaxonomy[]> {
  return db
    .select()
    .from(orgTaxonomies)
    .where(eq(orgTaxonomies.taxonomyId, taxonomyId))
    .orderBy(orgTaxonomies.key)
}

// ---------------------------------------------------------------------------
// upsertTaxonomyEntry
// ---------------------------------------------------------------------------

export interface UpsertTaxonomyEntryInput {
  taxonomyId: string
  key: string
  value: string
  metadata?: Record<string, unknown> | null
  updatedBy: string
}

export async function upsertTaxonomyEntry(input: UpsertTaxonomyEntryInput): Promise<OrgTaxonomy> {
  const [row] = await db
    .insert(orgTaxonomies)
    .values({
      taxonomyId: input.taxonomyId,
      key: input.key,
      value: input.value,
      metadata: input.metadata ?? null,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [orgTaxonomies.taxonomyId, orgTaxonomies.key],
      set: {
        value: input.value,
        metadata: input.metadata ?? null,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning()

  return row
}

// ---------------------------------------------------------------------------
// bulkUpsertTaxonomyEntries
// ---------------------------------------------------------------------------

export interface BulkEntry {
  key: string
  value: string
  metadata?: Record<string, unknown> | null
}

export async function bulkUpsertTaxonomyEntries(
  taxonomyId: string,
  entries: BulkEntry[],
  updatedBy: string,
): Promise<{ upserted: number; entries: OrgTaxonomy[] }> {
  if (entries.length === 0) {
    return { upserted: 0, entries: [] }
  }

  const now = new Date()
  // Single batched upsert — one round-trip regardless of entries.length (T1.5)
  const rows = await db
    .insert(orgTaxonomies)
    .values(
      entries.map((entry) => ({
        taxonomyId,
        key: entry.key,
        value: entry.value,
        metadata: entry.metadata ?? null,
        updatedBy,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [orgTaxonomies.taxonomyId, orgTaxonomies.key],
      set: {
        value: sql`excluded.value`,
        metadata: sql`excluded.metadata`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning()

  return { upserted: rows.length, entries: rows }
}

// ---------------------------------------------------------------------------
// deleteTaxonomyEntries
// ---------------------------------------------------------------------------

export interface DeletedTaxonomyEntry {
  id: string
  key: string
  value: string
}

export async function deleteTaxonomyEntries(
  taxonomyId: string,
  keys: string[],
): Promise<{ deleted: number; entries: DeletedTaxonomyEntry[] }> {
  if (keys.length === 0) return { deleted: 0, entries: [] }

  const rows = await db
    .delete(orgTaxonomies)
    .where(
      and(
        eq(orgTaxonomies.taxonomyId, taxonomyId),
        inArray(orgTaxonomies.key, keys),
      ),
    )
    .returning({
      id: orgTaxonomies.id,
      key: orgTaxonomies.key,
      value: orgTaxonomies.value,
    })

  return { deleted: rows.length, entries: rows }
}
