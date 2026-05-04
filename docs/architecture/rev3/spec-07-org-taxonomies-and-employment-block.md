# Rev 3 — Spec 07: Org Taxonomies & Employment Block

> Status: **Drafted 2026-05-04 from /grill-with-docs session.** Not yet approved.
> Priority: **Critical-path. Precondition for Spec 08 (Heroes Spec 03 cutover) and for onboarding any second/third H-app.**
> Scope: Portal (`org_taxonomies` schema + admin UI + webhook fan-out + manifest extension + `@coms-portal/shared` v1.6.0 contract bump). Every H-app consumes via the projection pattern documented here.
> Prerequisites: Spec 03 shipped portal-side (already on `main`). Spec 06 shipped (already on `main`).
> Companion ADR: [`coms_aha_heroes/docs/adr/0001-portal-owned-org-taxonomies.md`](../../../../coms_aha_heroes/docs/adr/0001-portal-owned-org-taxonomies.md).

---

## Why this spec exists

Spec 03 made portal the sole writer of identity (`identity_users`) and per-app config (`app_user_config`). It did not address two adjacent surfaces:

1. **Enumerable HR taxonomies** (branches, teams, departments, cost-centers) that every H-app projects locally. Today Heroes maintains its own `branches` and `teams` tables, populated by hand. App #2 and app #3 would each rebuild the same projections from scratch.
2. **Per-identity employment attributes** (branch, team, department, position, phone, employmentStatus, talentaId, attendanceName, leaderName, birthDate) that are portal-managed via `createEmployee` but never delivered to consuming apps via webhook. Today Heroes' webhook handler reads `body.appRole` + `body.branch` (free strings) — fragile and does not scale.

Both gaps are blocking for Spec 08. Spec 07 fixes them generically — every H-app, present and future, consumes through one mechanism.

The taxonomy decision was the result of choosing between "each app rebuilds branches/teams" and "portal absorbs the taxonomies and ships them as projections." See ADR 0001 for the trade-off analysis.

---

## Decisions Up Front

### Portal owns enumerable HR taxonomies in a single generic table

`org_taxonomies` is a `(taxonomy_id, key, value, metadata jsonb)` table. Initial seed: `branches`, `teams`, `departments`, `cost_centers`. New taxonomies are added as rows, not as new tables — apps subscribe by `taxonomy_id`.

`taxonomy_id` is a slug (e.g. `"branches"`). `key` is a stable per-entry identifier portal admin assigns (e.g. `"ID-JKT"`). `value` is the human display name (e.g. `"Indonesia – Jakarta"`). `metadata` carries optional structured data (timezone, country code, etc.).

### H-apps subscribe to taxonomies via manifest

App manifests gain a `taxonomies: string[]` field listing the `taxonomy_id`s the app needs. Heroes' manifest extends to `["branches", "teams", "departments"]`. Portal uses this list at registration time (initial sync) and at webhook fan-out (only fires events for taxonomies the app subscribes to).

### Initial sync via pull-on-boot, deltas via webhook

H-apps call `GET /api/taxonomies/sync` once on boot — portal returns every entry of every taxonomy the app's manifest subscribes to, in one response. Subsequently, portal fires `taxonomy.upserted` / `taxonomy.deleted` per change.

This shape lets a new H-app self-bootstrap without a coordinated cutover — the broker exchange precondition is "manifest registered + service-account access granted," nothing else.

### Employment block is its own envelope-level field on identity webhooks

`user.provisioned` and the new `employment.updated` event carry an `employment` block alongside `user` and `appConfig`:

```json
"employment": {
  "branch":     { "taxonomyId": "branches",    "key": "ID-JKT", "value": "Indonesia – Jakarta" },
  "team":       { "taxonomyId": "teams",       "key": "team-ops-jakarta", "value": "Ops Jakarta" },
  "department": { "taxonomyId": "departments", "key": "ENG", "value": "Engineering" },
  "position": "Senior Engineer",
  "phone": "+62...",
  "employmentStatus": "permanent",
  "talentaId": "...",
  "attendanceName": "...",
  "leaderName": "Jane Smith",
  "birthDate": "1990-..."
}
```

Taxonomy-shaped fields (branch, team, department) reference taxonomies by `(taxonomyId, key)` with `value` as a denormalised display snapshot. Free-form fields (position, phone, etc.) are plain strings.

`employment.updated` is a separate event from `user.updated` because HR edits (promotions, branch transfers) are far more frequent than identity edits (email/name) and shouldn't force consumers to re-materialise identity state on every promotion.

### Email handling: `contactEmail`, not the full `emails[]` array

Spec 06 made portal's email model multi-row (`identity_user_emails`) with workspace + personal kinds. H-apps don't need that taxonomy — they need "the address we'd contact this person at." Webhook payloads carry `contactEmail: string` (workspace if present, else personal). Both workspace-only and personal-only employees flow identically.

H-apps that need email-by-kind (rare) can pull from `GET /api/users/:portalSub/emails`. Default consumption pattern is `contactEmail`-only.

### Contract bump rides `@coms-portal/shared` v1.6.0

The shared package gains:
- `EmploymentBlock` type
- `TaxonomyEvent` (upserted + deleted variants)
- `AppConfigEvent` (already drafted in Spec 03; finalised here)
- `ContactEmail` typedef + `WebhookUserEnvelope`
- `AppManifest.taxonomies: string[]` extension

Heroes pins v1.6.0 as the dependency handshake — that's the contract version boundary. No runtime feature flag for "new vs old payload shape" — wire format is versioned by package release.

### Portal dual-emits during the gap window

For one release after Spec 07 ships portal-side, portal emits BOTH the legacy top-level fields (`email`, `appRole`, `branch` — which today's Heroes handler reads) AND the new envelope (`user`, `employment`, `appConfig`, `contactEmail`). Heroes Deploy A (Spec 08) drops the legacy reader; portal Deploy 07b removes the legacy emit shortly after.

This preserves Spec 03's "no fallback path" rule on the *consumer* side. The dual-emit lives portal-side only.

---

## Schema

### Portal: `org_taxonomies`

```ts
export const orgTaxonomies = pgTable('org_taxonomies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  taxonomyId: varchar('taxonomy_id', { length: 64 }).notNull(),
  key: varchar('key', { length: 128 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => identityUsers.id),
}, (t) => ({
  uniqByTaxonomyKey: uniqueIndex('org_taxonomies_taxonomy_key_uniq').on(t.taxonomyId, t.key),
  byTaxonomy: index('org_taxonomies_taxonomy_id_idx').on(t.taxonomyId),
}))
```

Initial seed via Drizzle migration: every existing `branches.code` from Heroes' current state copied as `(taxonomy_id='branches', key=<code>, value=<displayName>)`. Same for teams.

### Portal: `app_manifests` extension

Add `taxonomies jsonb NOT NULL DEFAULT '[]'` column. Stores `string[]` of taxonomy_ids the app subscribes to. Heroes' manifest JSON updated to include `["branches", "teams", "departments"]`.

### Portal: extended `app_webhook_endpoints` event types

The events the dispatcher accepts now include (additive — does not affect existing events):
- `taxonomy.upserted`
- `taxonomy.deleted`
- `employment.updated`

---

## API contract (portal-side)

### `GET /api/taxonomies/sync`

Returns every entry of every taxonomy the calling app's manifest subscribes to.

Auth: app SA token (existing `requireAppToken` middleware).

Response:
```json
{
  "taxonomies": [
    {
      "taxonomyId": "branches",
      "entries": [
        { "key": "ID-JKT", "value": "Indonesia – Jakarta", "metadata": { "country": "ID" } },
        { "key": "TH-BKK", "value": "Thailand – Bangkok", "metadata": { "country": "TH" } }
      ]
    },
    { "taxonomyId": "teams", "entries": [...] }
  ],
  "syncedAt": "2026-05-04T..."
}
```

Idempotent. Safe to call repeatedly. Apps call on every cold start.

### `POST /webhooks/portal/taxonomy-upserted`

Fires when a `org_taxonomies` row is created or its `value`/`metadata` is updated.

Payload:
```json
{
  "eventId": "uuid",
  "type": "taxonomy.upserted",
  "occurredAt": "2026-05-04T...",
  "taxonomyId": "branches",
  "entries": [
    { "key": "ID-JKT", "value": "Indonesia – Jakarta", "metadata": { "country": "ID" } }
  ]
}
```

Bulk upserts (admin batch edit) batch into a single event (one event per `(taxonomyId, batchId)`).

Apps fire only for `taxonomyId`s in their manifest's `taxonomies` list.

### `POST /webhooks/portal/taxonomy-deleted`

Fires when a `org_taxonomies` row is deleted.

```json
{
  "eventId": "uuid",
  "type": "taxonomy.deleted",
  "occurredAt": "2026-05-04T...",
  "taxonomyId": "branches",
  "keys": ["OLD-CODE-1", "OLD-CODE-2"]
}
```

### `POST /webhooks/portal/employment-updated`

Fires when any HR-shaped field on a portal user changes.

Payload:
```json
{
  "eventId": "uuid",
  "type": "employment.updated",
  "occurredAt": "2026-05-04T...",
  "user": { "portalSub": "uuid" },
  "employment": { /* only changed fields, full block on first update */ },
  "previousEmployment": { /* only changed fields' previous values */ }
}
```

Full block always emitted on `user.provisioned`; only deltas on `employment.updated`.

### Extended `POST /webhooks/portal/user-provisioned`

Existing event extended with three blocks:

```json
{
  "eventId": "uuid",
  "type": "user.provisioned",
  "occurredAt": "...",
  "user": { "portalSub": "uuid", "name": "Jane Smith", "primaryAliasId": "uuid" },
  "contactEmail": "jane@example.com",
  "employment": { /* full block per §Decisions */ },
  "appConfig": { "config": { ... }, "schemaVersion": 1 }
}
```

Legacy top-level fields (`email`, `appRole`, `branch`) ALSO emitted during the dual-emit window. Removed in Spec 07b.

---

## Manifest extension

Heroes' manifest at `apps/api/src/services/manifests/heroes.json` becomes:

```json
{
  "appId": "heroes",
  "displayName": "Heroes",
  "schemaVersion": 2,
  "taxonomies": ["branches", "teams", "departments"],
  "configSchema": {
    "role": { "type": "enum", "values": ["member", "captain", "admin"], "default": "member" },
    "leaderboard_eligible": { "type": "boolean", "default": true },
    "starting_points": { "type": "integer", "default": 0 }
  }
}
```

`schemaVersion` bumps to 2 because the manifest contract itself changed (added `taxonomies`). Portal validates the additive shape on registration.

---

## Admin UI (portal)

Add `/admin/taxonomies` panel:
- Sidebar lists `taxonomy_id`s (sourced from registered manifests' union).
- Right panel shows entries for the selected taxonomy with inline edit + add-entry + delete-entry actions.
- Bulk: CSV download/upload (same shape as `/admin/app-config`'s bulk path), `bulk_edit_locks` per `taxonomy_id`.
- Diff preview before commit. Audit log captures the full diff.

Reuse existing `BatchToolbar` + manifest-rendered editor primitives from `/admin/app-config`.

---

## Race window: employment event referencing a taxonomy key the consumer hasn't cached

Possible if `taxonomy.upserted` and `employment.updated` arrive out of order (at-least-once delivery, no cross-event ordering guarantee).

**Consumer invariant:** if the employment handler hits a `(taxonomyId, key)` pair not in `taxonomy_cache`, it MUST reschedule the employment event for retry (re-throw → DLQ retry), NOT silently drop the field or fall back to a default value.

**Portal-side mitigation:** when admin creates a brand-new taxonomy entry that's about to be referenced by a user's employment, the admin UI flow is "create taxonomy entry → wait for confirmation → only then save the employment edit." Bulk operations: portal emits `taxonomy.upserted` first, then the affected `employment.updated` events.

This bounds the race to "DLQ retry consumes the taxonomy event in between" — typically <1s.

---

## Out of Scope

- Per-tenant taxonomy isolation. Single-tenant today; multi-tenant when external tenants join.
- Self-service taxonomy editing by H-apps (admin-only).
- Compound taxonomy types (hierarchical branches, multi-parent teams) — flat key/value only in v1.
- Employment-history retention (today: portal stores current state; "what was Jane's branch on 2026-01-15?" requires a separate audit-log spec).

---

## Success Criteria

1. `org_taxonomies` exists, seeded with current branches + teams + departments.
2. `app_manifests` carries `taxonomies` array; Heroes manifest registers `["branches", "teams", "departments"]`.
3. `GET /api/taxonomies/sync` returns the full set for the calling app's subscribed taxonomies.
4. `taxonomy.upserted` / `taxonomy.deleted` webhooks fire on admin edits.
5. `employment.updated` webhook fires on `createEmployee` / `updateEmployee` HR-field changes.
6. `user.provisioned` payload carries `employment`, `contactEmail`, `appConfig` blocks.
7. Portal dual-emits legacy + new payload shape during gap window.
8. `@coms-portal/shared` v1.6.0 published with new types.
9. Heroes can consume the new contract end-to-end (proven by Spec 08 Phase 3 cutover).

---

## Phasing

- **PR 07-1:** Schema migration via `drizzle-kit generate` — `org_taxonomies` + manifest `taxonomies` column + seed from Heroes' current branches/teams.
- **PR 07-2:** `GET /api/taxonomies/sync` endpoint + admin UI for taxonomies + webhook events emit (initially gated off).
- **PR 07-3:** Wire `createEmployee` / `updateEmployee` to fire `employment.updated`. Extend `user.provisioned` payload. Begin dual-emit (legacy + new fields).
- **PR 07-4:** Publish `@coms-portal/shared` v1.6.0 with new types.
- (Spec 08 Heroes-side work happens in parallel after PR 07-4 lands.)
- **PR 07-5:** After Spec 08 Phase 3 verifies, drop legacy emit fields. Manifest schema version bumps to 2 forced.

Estimated portal scope: ~5-7 days.
