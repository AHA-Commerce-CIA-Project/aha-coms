# Rev 3 — Spec 03: User Identity Ownership & Alias Layer

> Priority: **Critical-path. Must land before Heroes (or any H-app) takes real users.**
> Scope: Portal (alias table, resolve API, webhook fan-out, admin UI, DB-role lockdown) + every H-app (drop user-creation paths, add ingestion queue, consume webhook).
> Prerequisites: Rev 2 closed (portal owns identity end-to-end). Rev 3 Spec 01 in flight (the account widget surfaces identity; this spec hardens the writer side of identity).

---

## Overview

Rev 2 made the portal the **sole authenticator** of users. This spec makes the portal the **sole writer** of users.

Today, Heroes' Google Sheet ingestion can implicitly create user records when it encounters an unfamiliar name. That is fine pre-real-users. The moment real customers arrive, name typos, "Jane Smith" vs "Jane S.", marriages, and duplicates will silently mint duplicate users that the portal never authorized — and reconciliation gets exponentially harder the longer it runs.

The fix is two layers:

1. **Lock down user creation** — only the portal mints `identity_users` rows. Every other service's DB role loses `INSERT/UPDATE/DELETE` on that table. Application discipline is advisory; the database enforces.
2. **Alias layer** — portal owns a `user_aliases` table mapping display-name strings (and historical variants) to a stable `identity_users.id`. Apps' batch ingestion (sheets, CSVs, etc.) resolves names through this table instead of creating users.

Heroes proposed this; the architectural bones are theirs. The decisions and contract below come out of a portal/Heroes thread, with Heroes' migration plan attached as Appendix A.

---

## The identity-vs-projection split (the framing that matters)

This spec only works if both teams hold the same mental model:

- **Portal owns identity.** `identity_users` rows are *who someone is*: `id`, `gip_uid`, `email`, canonical `name`, `portal_role`, lifecycle status. Aliases are an attribute of identity.
- **Each H-app owns its domain projection.** Heroes has a row per user with points, rank, leaderboard position. That row is *not* a user — it is Heroes' projection of a user. The link is `portal_sub` (= `identity_users.id`), used as a foreign key.

Today Heroes happens to call its projection table `users`. That naming is the leak — it makes the table look like an identity table when it isn't, which is exactly why ingestion code felt entitled to `INSERT INTO users`. The rename to `heroes_profiles` (or similar) is part of this spec's deliverables on the Heroes side. Same applies to every future H-app.

Concretely:

| Concern | Owner | Table |
|---------|-------|-------|
| Who someone is | Portal | `identity_users` |
| Names a user is known by | Portal | `user_aliases` |
| Heroes points / rank / leaderboard | Heroes | `heroes_profiles` (renamed from `users`) |
| Pending sheet rows awaiting alias | Heroes | `pending_alias_resolution` |
| Ingestion of rows belonging to deactivated users | Heroes | `deactivated_user_ingest_audit` |

Portal never sees Heroes' rank data; Heroes never writes portal identity. The only crossing point is the alias-resolve API call and the `alias.resolved` webhook.

---

## Decisions Up Front

### Portal owns the alias table; each H-app owns its own queue

The alias table itself (`user_aliases`) lives in the portal. Aliases are an identity attribute — keeping them in portal keeps identity and its naming layer together, lets every app share one canonical resolver, and avoids fan-out of the same data across apps.

The **unresolved-name queue**, however, stays app-side. Each app's batch ingestion has app-specific context (sheet IDs, row numbers, retry semantics, source files) that does not belong in portal. Heroes' queue is `pending_alias_resolution` in Heroes' DB. Future apps add their own. Portal does not maintain a global queue — that would make portal a chokepoint and force every queue evolution to ship in lockstep with portal.

The handoff is async: portal exposes a `POST /webhooks/portal/alias-resolved` event that each app subscribes to. When ops resolves an alias in portal admin, portal fires the webhook, every app drains its own queue independently.

### Alias-update behavior: append, with `is_primary`

When portal updates a user's canonical display name, the **old name stays as an alias** and the new name is added with `is_primary = true` (the previous primary flips to `false`). Reasons:

- Sheet rows uploaded last quarter still resolve. Old data does not silently break.
- Display rendering picks `is_primary = true` (single canonical name shown in UI).
- Auditability — we can see the full history of names a user was known by.

Hard-replace is wrong. It guarantees retroactive breakage of historical data the moment someone's name changes.

### Names are unique per person (AHA Commerce domain invariant)

In the AHA Commerce dataset, a normalized full name maps to **exactly one person**. "Jane Smith" is always the same Jane Smith. "Jane Bakery" is a different person. "Jane Smith Moretti" is a third, different person. There is no scenario where two real people share the same normalized full name and need disambiguation by discriminator.

This invariant is what lets the alias layer enforce a global unique on `alias_normalized` without an escape hatch — the "second real Jane Smith" case does not exist in this dataset. If business reality ever changes (acquisition with name overlaps, etc.), that's a re-evaluation of the invariant, not an alias-layer feature.

#### Confidence + unwind path

The invariant is **enforced at the provisioning gate**, not at the source-of-truth (HR / signup form). Every new alias passes through §Collision handling at provision time, where exact + fuzzy matches surface to portal admin before the row commits. The provisioning gate IS the enforcement; HR and the signup form are inputs we don't currently police for name-uniqueness on their own.

That means the invariant is "observed and gated," not "structurally impossible." If portal admin ever mis-merges or rubber-stamps a true duplicate, we'd discover it the day a sheet upload routes the wrong person's data. The unwind path is single-migration:

1. Add `name_discriminator` column to `user_aliases` (`varchar(64) NULL`, default `NULL`).
2. Drop `user_aliases_alias_normalized_uniq`. Replace with `UNIQUE (alias_normalized, COALESCE(name_discriminator, ''))`.
3. Admin tooling exposes the discriminator field on the collision-resolution UI; existing rows stay `NULL` and behave identically.

No resolve-API rewrites required (the API still returns by `alias_normalized`; if discriminator ever populates, admin tooling chooses which row to bind during collision review). Capturing the unwind here so future-us doesn't treat the invariant as load-bearing past where it actually is.

### Collision handling at provision time

Combined with the invariant above, "name collision at provision" does **not** mean "two distinct people happen to share a name." It means one of:

1. **Re-provisioning the same person** (account recovery, oversight, double-signup) — the existing identity is the right target; no new alias row is created.
2. **An admin-side error or upstream data problem** — needs investigation, not silent acceptance.

Detection at provision time:

1. **Exact normalized match against any existing alias** → refuse auto-seed, surface to portal admin. Admin either points the new signup at the existing identity (case 1) or rejects the signup (case 2).
2. **Fuzzy match against any existing alias** (normalized: lowercase, collapsed whitespace, Levenshtein ≤2 or token-set match) → also refuse, surface to portal admin. Fuzzy near-misses ("Jane Smith" vs "Jane Smyth") are *probably* distinct people per the invariant, but worth a human eyeballing before committing — once an alias lands, sheets start binding to it.

Cheap to add at provision time. Catastrophic to retrofit later, because every "Jane S." vs "Jane Smith" duplicate that lands in production has to be unwound by hand.

The collision queue lives in portal admin (it's portal's concern). The fix is "merge into existing identity" or "reject signup" — never "add a discriminator," because the invariant says discriminators aren't needed.

### Soft-delete on deactivation, with an audit-log routing path

When portal deactivates a user (offboarding, account closure, etc.):

- Aliases stay alive but the user they point at is tombstoned (`status = 'deactivated'`, `deactivated_at` set).
- The resolve API returns `{ portal_sub, alias_id, is_primary, tombstoned: true, deactivated_at }` — explicit field, **not a 404**, so apps can distinguish "no such alias" from "alias resolves to a deactivated user."
- Apps route tombstoned-resolution rows to an audit log (`deactivated_user_ingest_audit` on the Heroes side) instead of either silently ingesting (wrong: data on departed staff) or silently dropping (wrong: ops doesn't know the row was skipped).

**Tombstoned aliases retain their `alias_normalized` uniqueness slot.** A new signup with the same normalized name does not auto-resolve — it lands in the portal admin collision queue, exactly as it would for a live alias. Portal admin then chooses: reactivate the existing identity (most common case — same person returning), merge as same person, or reject. Releasing the slot on tombstone would let two real-but-historical "Janes" coexist in the index and silently break the domain invariant.

Hard-delete is wrong here for the same reason hard-replace on name update is wrong: historical sheets break the day after deprovisioning.

### DB-role REVOKE is the actual lockdown

Application code that says "only portal creates users" rots within two quarters. The next intern wires up an admin endpoint that touches `identity_users` directly and we are back where we started. The real lockdown is at the database role level:

```sql
REVOKE INSERT, UPDATE, DELETE ON identity_users FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON user_aliases   FROM heroes_app_role;
-- repeat for every H-app role
```

After cutover, only the **portal API service account** has write access to `identity_users` and `user_aliases`. Any other code that attempts a write fails at the database, not at code review.

This applies to every H-app today and forms a precondition for onboarding any future H-app.

### Three-deploy cutover, freeze sheet uploads during seed

The cutover is sequenced across portal and Heroes:

1. **Deploy A (Heroes):** Ship ingestion code that supports both old (name-matching) and new (alias-resolve) paths, gated behind feature flag `INGESTION_USE_ALIAS_API=false`. Old path active. Verify in staging.
2. **Freeze sheet uploads** (target window <2h). Communicate to ops.
3. **Portal seed:** Portal runs the one-shot alias backfill from the **union of `identity_users.name` and Heroes' export of distinct production `users.name` strings** (CSV provided ahead of the freeze). Both sources flow through the same `alias_normalized` pipeline; collisions land as additional aliases on the same identity (first one wins `is_primary = true`). Heroes verifies via reconciliation query that every `heroes_profiles.portal_sub` resolves through the new API.
4. **Deploy B (Heroes):** Flip `INGESTION_USE_ALIAS_API=true`. Sheet uploads resume. Old path removed in this deploy or the next — do not leave dual paths around as permanent state.
5. **Deploy C (Portal):** `REVOKE` Heroes' DB role from writing to `identity_users` and `user_aliases`. Verify with a forced `INSERT` from Heroes' service account in staging — must fail.

Freezing during seed (step 2) is required, not optional. A fallback "if alias miss, fall through to old path" would defeat the purpose of the spec.

---

## Schema

### Portal: `user_aliases`

```ts
export const userAliases = pgTable('user_aliases', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  identityUserId: uuid('identity_user_id')
    .notNull()
    .references(() => identityUsers.id, { onDelete: 'cascade' }),
  alias: varchar('alias', { length: 255 }).notNull(),
  aliasNormalized: varchar('alias_normalized', { length: 255 }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  source: varchar('source', { length: 20 }).notNull().default('auto_seed'),
    // 'auto_seed' | 'manual' | 'name_update' | 'backfill'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => identityUsers.id),
}, (t) => ({
  uniqAliasNormalized: uniqueIndex('user_aliases_alias_normalized_uniq').on(t.aliasNormalized),
  uniqPrimaryPerUser: uniqueIndex('user_aliases_one_primary_per_user_uniq')
    .on(t.identityUserId)
    .where(sql`${t.isPrimary} = true`),
  byUser: index('user_aliases_identity_user_id_idx').on(t.identityUserId),
}))
```

Notes:
- `alias_normalized` is `LOWER(TRIM(REGEXP_REPLACE(alias, '\s+', ' ', 'g')))` — populated by trigger or app code on insert/update. Used for collision detection and resolve lookup.
- Unique on `alias_normalized` enforces "one alias string maps to at most one user globally" — collision detection is automatic at the DB layer.
- Partial unique on `(identity_user_id) WHERE is_primary = true` enforces "at most one primary per user."

### Heroes: rename `users` → `heroes_profiles`

Pure rename. `portal_sub` (→ `identity_users.id`) stays the FK. No column changes. All consuming code updated.

### Heroes: `pending_alias_resolution`

```ts
export const pendingAliasResolution = pgTable('pending_alias_resolution', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sheetId: text('sheet_id').notNull(),
  sheetRowNumber: integer('sheet_row_number').notNull(),
  rawName: varchar('raw_name', { length: 255 }).notNull(),
  rawNameNormalized: varchar('raw_name_normalized', { length: 255 }).notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastRetryAt: timestamp('last_retry_at', { withTimezone: true }),
  retryCount: integer('retry_count').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
    // 'pending' | 'resolved' | 'failed'
}, (t) => ({
  byNormalizedName: index('pending_alias_raw_name_normalized_idx').on(t.rawNameNormalized),
  byStatus: index('pending_alias_status_idx').on(t.status),
}))
```

### Heroes: `deactivated_user_ingest_audit`

```ts
export const deactivatedUserIngestAudit = pgTable('deactivated_user_ingest_audit', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sheetId: text('sheet_id').notNull(),
  sheetRowNumber: integer('sheet_row_number').notNull(),
  portalSub: uuid('portal_sub').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### Heroes: `alias_cache`

The local cache **must** mirror the full resolve response, not just `portal_sub`. Caching only `portal_sub` would let a tombstoned-user cache hit skip audit-log routing in §Soft-delete on deactivation — silently ingesting departed-staff rows is exactly the failure mode the audit log exists to prevent.

```ts
export const aliasCache = pgTable('alias_cache', {
  aliasNormalized: varchar('alias_normalized', { length: 255 }).primaryKey(),
  aliasId: uuid('alias_id').notNull(),
  portalSub: uuid('portal_sub').notNull(),
  isPrimary: boolean('is_primary').notNull(),
  tombstoned: boolean('tombstoned').notNull().default(false),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byPortalSub: index('alias_cache_portal_sub_idx').on(t.portalSub),
}))
```

- TTL: 24h on `cachedAt` (belt-and-suspenders against missed webhooks). Stale rows trigger a fresh resolve on next hit.
- Invalidation: webhook handlers DELETE by `aliasNormalized` on `alias.updated` / `alias.deleted` and re-resolve on next hit, OR upsert directly from the webhook payload when it carries a full row. Either is fine — pick one in the migration PR.
- Read path: `SELECT ... FROM alias_cache WHERE alias_normalized = $1 AND cached_at > now() - interval '24 hours'`. Miss → batch resolve API.

---

## API contract (portal-side)

### `POST /api/aliases/resolve-batch`

Body: `{ names: string[] }` (max 1000 per call; request body cap ~256 KB)
Response:
```json
{
  "results": [
    {
      "input": "Jane Smith",
      "match": {
        "portalSub": "uuid",
        "aliasId": "uuid",
        "isPrimary": true,
        "tombstoned": false,
        "deactivatedAt": null
      }
    },
    {
      "input": "Jhon Doe",
      "match": null
    },
    {
      "input": "Old Name Of Alice",
      "match": {
        "portalSub": "uuid",
        "aliasId": "uuid",
        "isPrimary": false,
        "tombstoned": true,
        "deactivatedAt": "2026-03-15T..."
      }
    }
  ]
}
```

- Latency budget: p95 < 200ms for batches up to 500.
- Auth: app-to-portal service token (existing pattern from Rev 2 Spec 04).
- Normalization is portal-side — apps send raw names, portal normalizes and looks up.

A single-name `GET /api/aliases/resolve?name=...` is **not** in scope for v1; sheet ingestion is batch-shaped, on-demand single-resolve UIs can be added later if needed.

### `POST /webhooks/portal/alias-resolved`

Portal fires when ops resolves a queued alias (or when a new alias is auto-seeded that matches a previously unresolvable name).

Payload:
```json
{
  "eventId": "uuid",
  "type": "alias.resolved",
  "occurredAt": "2026-04-28T...",
  "alias": {
    "aliasId": "uuid",
    "aliasNormalized": "jane smith",
    "portalSub": "uuid",
    "isPrimary": true
  }
}
```

- Reuses Rev 2 Spec 03 webhook delivery infrastructure (`webhook_delivery_jobs`, retries, DLQ).
- At-least-once delivery; consumers must be idempotent on `eventId`.
- No ordering guarantees across different aliases. Per-alias, retries are sequential.

### `POST /webhooks/portal/alias-updated`

Fires on:
- **Name update / rename** — new alias inserted with `is_primary = true`, previous primary flipped to `is_primary = false`. Webhook fires once per affected alias row (so the rename produces two events: the new primary + the demoted old primary).
- **`is_primary` flip without rename** — admin manually re-pins which alias is the canonical display name.
- **Re-pointing on identity merge** — admin merges two identities; the surviving identity's `identity_user_id` is written onto the merged-away identity's aliases.

Same envelope as `alias.resolved`, plus `previousIsPrimary` and `previousIdentityUserId` fields when applicable so consumers can spot the rename / merge case.

Consumer behavior: invalidate cache for the affected `alias_normalized`; if the row was previously tombstoned, re-check the per-app pending queue (a row that previously failed to resolve might now succeed against the merged identity).

### `POST /webhooks/portal/alias-deleted`

Fires **only** when a portal admin explicitly removes an alias row — typically:
- Alias was added in error (typo, attached to wrong identity).
- Collision-resolution rejection (the alias was rolled back rather than merged).

User deactivation does **not** fire `alias.deleted`. Aliases stay alive pointing at the tombstoned identity; the `tombstoned` flag in the resolve response handles that case (see §Soft-delete on deactivation). This separation matters: `alias.deleted` means "this name no longer maps anywhere," `tombstoned` means "this name maps to a deactivated user — route through the audit log."

Consumer behavior: invalidate cache for the affected `alias_normalized`; do **not** assume the underlying user is gone — only the name binding is gone.

All three events (`alias.resolved`, `alias.updated`, `alias.deleted`) ride the existing Rev 2 Spec 03 webhook delivery + DLQ. At-least-once delivery; consumers idempotent on `eventId`.

---

## Open Questions

These are contract details, not architecture disagreements. Resolved between portal and Heroes before either side starts implementation.

1. **Resolve API: confirm batch-only.** Is `POST /aliases/resolve-batch` sufficient, or is there a sync single-name use case (admin tooling, on-demand lookups) that needs `GET /aliases/resolve?name=...`? Default: batch-only for v1.
2. **Local caching policy.** Can H-apps cache `name → portal_sub` locally with TTL? If yes, how is invalidation signaled — `alias.resolved` only, or also `alias.updated` and `alias.deleted`? Default proposal: caching allowed, invalidation via all three events; ship cache-related webhooks lazily when first consumer needs them.
3. **Webhook delivery semantics for `alias.resolved`.** Does it ride the existing Rev 2 Spec 03 webhook delivery + DLQ, or is identity-layer fan-out important enough to warrant its own delivery channel? Default: reuse existing infra.
4. **Tombstone signal in resolve API.** Confirm `{ tombstoned: true, deactivatedAt }` field — vs returning a special status code or a separate endpoint. Default: explicit fields in the same response shape (proposed above).
5. **Backfill cutover window.** Confirm sheet uploads are frozen for the duration of the seed (no fallback to old behavior). Default: freeze, target <2h.
6. **Collision-on-provision UX.** When auto-seed refuses due to collision, who gets paged — portal admin only, or also the H-app ops who's about to upload a sheet that depends on the new alias landing? Default: portal admin only at provisioning; Heroes ops sees the row in their own queue when it fails to resolve, which is a sufficient signal.

### Heroes review response — 2026-04-28

Heroes read the spec end-to-end and aligned on the framing + core decisions. Six concerns raised; portal-team resolutions inline. **All six closed; Heroes is unblocked to commit to Phase 0–4 (~2 weeks engineering + portal cutover coordination).**

| # | Heroes concern | Resolution |
|---|---------------|------------|
| 1 | Two-real-Janes: global unique on `alias_normalized` means a second Jane Smith never auto-resolves from sheet data; discriminator only lives in portal admin. Make the trade-off explicit in §Out of Scope, or design an escape hatch. | **Resolved by domain invariant.** AHA Commerce dataset enforces "one normalized name = one person" upstream; there is no second real Jane Smith. New §Decision "Names are unique per person" + collision handling rewritten so exact match means re-provisioning, not distinct-person collision. No discriminator path needed. |
| 2 | Backfill source: seeding from `identity_users.name` may not match what sheets actually contain. | **Decided: union seed.** Backfill seeds from `identity_users.name` ∪ Heroes' one-time export of distinct production `users.name` strings (CSV: `user_id, name`, where `name` is the verbatim string ever written to that row, deduped). Both sources flow through the same `alias_normalized` pipeline; the `identity_users.name` row wins `is_primary = true`, divergent sheet-side strings land as additional aliases on the same identity. Heroes' export blocks Phase 1 — provide it before the freeze window. Codified in §Three-deploy cutover, step 3. |
| 3 | Tombstone alias reuse: confirm tombstoned aliases keep the uniqueness slot. | **Decided: tombstones retain the slot.** Codified in §Soft-delete on deactivation. A re-signup with the same normalized name surfaces to portal admin (case: probable reactivation of existing identity); admin chooses reactivate / merge / reject. Releasing the slot would let historical Janes coexist in the index and silently break the domain invariant. |
| 4 | Caching webhooks: Heroes is the first consumer — ship `alias.updated` + `alias.deleted` with v1, or commit no-cache and absorb round-trip load? | **Decided: ship cache invalidation webhooks in v1.** `POST /webhooks/portal/alias-resolved`, `alias-updated`, `alias-deleted` all GA with the spec, ride the existing Rev 2 Spec 03 webhook delivery + DLQ. Heroes maintains a local `name → portal_sub` cache (TTL belt-and-suspenders, e.g. 24h) and invalidates on the three events. Round-tripping every batch was a non-starter at sheet sizes Heroes quoted (>5000 rows routine). |
| 5 | Batch size / parallelism: rate limits + concurrency for >5000-row sheets. | **Decided: per-batch and per-app limits.** `POST /aliases/resolve-batch` accepts up to **1000 names per request** (request body cap ~256 KB). Per-app rate limit: **20 RPS** (token bucket, burst 40) on the SA token. Up to **4 parallel batches** per Heroes instance — that lands a 5000-row sheet in two round-trips (5 requests, ~250ms each at p50). Soft-fail with HTTP 429 + `Retry-After` header on overage; clients honor the header. Numbers will be reviewed after first month of production traffic; spec author owns capacity tuning. |
| 6 | Ops queue surfacing: portal admin vs Heroes ops view. | **Decided: two queues, two ownerships, one cross-link.** Portal admin owns the **collision queue** (`alias_collision_queue`) — new-user provisioning collisions, fuzzy-match reviews, tombstone-vs-new-signup conflicts. Heroes ops owns the **per-app pending queue** (`pending_alias_resolution`) — sheet rows that didn't resolve. Cross-link: portal admin UI surfaces a `blocked_app_rows` count per pending provisioning (sourced from a portal endpoint that aggregates per-app queue depth by alias), so portal admin sees which collision is blocking the most H-app work and prioritizes accordingly. Heroes ops UI shows row-level "submitted to portal admin" status when a row was escalated to a portal-admin collision. |

**Implementation flag (Heroes):** `is_primary` partial unique index needs `DEFERRABLE INITIALLY DEFERRED` or a two-step UPDATE on rename (set old row to `is_primary = false`, commit, then UPDATE/INSERT new primary). Spec author concurs — schema sketch will be amended in the migration PR; capturing here so it isn't lost. Two-step is preferred over `DEFERRABLE` because it keeps the constraint check eager during normal writes.

### Heroes follow-up review — 2026-04-28 (post-resolution pass)

Heroes signed off on the six resolutions above ("domain invariant on #1 is the clean simplification"). Three follow-ups (A–C) requested as spec amendments + three nits (D–F) for the migration PR.

| # | Heroes follow-up | Resolution |
|---|------------------|------------|
| A | Invariant confidence — upstream-enforced or just observed? Want a one-line unwind path. | **Pinned in §Names are unique per person → Confidence + unwind path.** Invariant is enforced at the *provisioning gate* (collision review by portal admin), not at HR / signup form. Single-migration unwind: add `name_discriminator` column + replace global unique with `(alias_normalized, COALESCE(name_discriminator, ''))`. No resolve-API rewrite needed. |
| B | Cache shape — must store full resolve response, not just `portal_sub`. Pin in §Schema. | **Pinned in §Schema → Heroes: `alias_cache`.** Cache mirrors the full resolve response (`tombstoned`, `deactivated_at` included), TTL 24h, invalidation via `alias.updated` / `alias.deleted` webhooks. Skipping `tombstoned` would let cache hits bypass audit-log routing — exactly the failure the audit log exists to prevent. |
| C | `alias.deleted` semantics — when does it fire? Document trigger + consumer behavior. | **Pinned in §API contract → `POST /webhooks/portal/alias-deleted`.** Fires only on explicit admin alias-row removal (typo correction, collision rejection). User deactivation does **not** fire `alias.deleted` — the `tombstoned` flag in resolve handles that path. `alias.updated` semantics also expanded (rename / `is_primary` flip / merge re-point) so consumers know which event to expect on each portal-side action. |
| D | CSV contract — confirm `user_id = portal_sub`; behavior on duplicate `alias_normalized` across different portal_subs. Heroes prefers erroring. | **Migration-PR note.** `user_id = portal_sub` confirmed (matches §Three-deploy cutover step 3). On duplicate `alias_normalized` across distinct `portal_sub`s in the seed: **error and require Heroes to clean up the export** — silent merges are invisible bugs. Seed script aborts with a per-row report; Heroes deduplicates upstream before re-submitting. Codify in the seed script's pre-flight validation. |
| E | `blocked_app_rows` mechanism — portal polls Heroes' queue, or Heroes pushes counts? | **Migration-PR note.** Portal polls. Heroes exposes `GET /internal/alias-resolution/queue-stats` (auth: existing OIDC SA path from Rev 2 Spec 04); portal admin UI calls it on collision-queue render. Portal polling avoids a Heroes→portal push pipeline that would only ever serve this one UI; staleness on the order of seconds is acceptable (admin is reading, not driving an alarm). |
| F | Two-step primary update — confirm no read path 500s during the demote-commit-promote gap (account widget, etc.). | **Migration-PR note.** Read paths must tolerate the gap: `SELECT alias FROM user_aliases WHERE identity_user_id = $1 AND is_primary = true LIMIT 1` can return zero rows mid-rename. Account widget + any other display-name reader falls back to `ORDER BY created_at DESC LIMIT 1` when the primary query returns empty. The fallback is the rule for any consumer of `is_primary`, not a special case. Spec author owns the widget-side fix in Rev 3 Spec 01. |

---

## Out of Scope

- **Portal admin UI for alias resolution.** Functional API + minimal admin route lands in this spec; rich UI (search, bulk operations, audit timeline) is a follow-up.
- **Cross-app dedup of identities.** If a person exists in two H-apps under different portal subs, that is a portal-side identity merge problem, not an alias problem. Out of scope here.
- **Email-based resolution.** Aliases resolve names. Email is already a unique key on `identity_users`. Apps with email available should use email; this layer is specifically for the name-only case sheet ingestion is stuck with.
- **Real-time ingestion.** This spec assumes batch (sheets). Streaming ingestion (a hypothetical real-time event source) needs its own design — likely event-sourced and not alias-shaped.

---

## Success Criteria

Spec 03 is done when:

1. `identity_users` rows can only be written by the portal API service account. Heroes' DB role attempts to `INSERT` and the database refuses.
2. `user_aliases` exists, is populated for every active `identity_users` row, and uniqueness on `alias_normalized` is enforced.
3. Heroes has renamed `users` → `heroes_profiles`, dropped all user-creation code paths, and ingests sheet rows via `POST /api/aliases/resolve-batch`.
4. Unresolved sheet rows land in `pending_alias_resolution`; resolved aliases trigger `alias.resolved` webhook delivery; Heroes' webhook consumer drains the queue automatically.
5. Tombstoned-user resolution routes to `deactivated_user_ingest_audit`, not silently ingested or dropped.
6. A future H-app onboarding follows this same pattern by default — alias resolve API + per-app queue + webhook consumer + DB-role REVOKE.

---

## Appendix A — Heroes-Side Migration Plan

Authored by Heroes team and attached for reference. Sequenced to align with the three-deploy cutover above.

### Phase 0 — Pre-cutover (Heroes-internal cleanup, can land before portal spec is finalized)

1. **Rename `users` → `heroes_profiles`.** Migration: rename table + all FK references. `portal_sub` stays as the key. Update all repository/service/route code. No behavior change.
2. **Audit user-creation paths.** Grep every `INSERT INTO users` / ORM equivalent. Build a list — sheet ingestion is the known one, but check for forgotten admin endpoints, seed scripts, test fixtures that hit prod-shaped DBs.
3. **Add structured logging on every user-create path.** So we can verify zero non-portal creates in staging before locking writes.

### Phase 1 — Portal alias backfill (portal-driven)

4. **Verification step.** Heroes runs a reconciliation query: every `heroes_profiles.portal_sub` should have at least one alias in portal. Mismatches → portal investigates before proceeding.

### Phase 2 — Heroes ingestion rewrite

5. **Add `pending_alias_resolution` table** (schema in §Heroes above).
6. **Add `alias_cache` table** (only if portal greenlights local caching per §Open Question 2).
7. **Rewrite ingestion lookup.** New flow per sheet row:
   - Normalize name (lowercase + collapse whitespace).
   - Check `alias_cache` (if enabled) → fall through on miss/expiry.
   - Call portal `POST /aliases/resolve-batch` (one call per sheet upload, not per row).
   - **Resolved & not tombstoned →** upsert into `heroes_profiles`-keyed domain rows.
   - **Resolved & tombstoned →** write to `deactivated_user_ingest_audit`, do not ingest.
   - **Unresolved →** insert into `pending_alias_resolution`, do not create user.
8. **Webhook consumer for `alias.resolved`** at `/webhooks/portal/alias-resolved`:
   - Idempotent on `(eventId)`.
   - Looks up `pending_alias_resolution` rows matching the resolved name (by `raw_name_normalized`).
   - Re-runs ingestion for those rows.
   - Marks queue rows `resolved`, deletes after configurable retention (default 30d).
   - Reuses Rev 2 Spec 03 DLQ pattern.
9. **Webhook consumer for `alias.updated` / `alias.deleted`** if portal exposes these. Invalidates `alias_cache`.
10. **Admin/ops view.** Read-only endpoint listing `pending_alias_resolution` rows grouped by `raw_name_normalized`, with counts and oldest-first ordering. Ops uses this to know what to ask portal admin to map. CLI command acceptable if no UI budget.
11. **`deactivated_user_ingest_audit` table** (schema in §Heroes above).

### Phase 3 — Cutover (coordinated with portal)

12. **Deploy A (Heroes):** Ship Phase 2 code with feature flag `INGESTION_USE_ALIAS_API=false`. Old name-matching path still active. Verify in staging.
13. **Freeze sheet uploads.** Communicate to ops; brief window (target <2h).
14. **Portal runs alias backfill** (Phase 1).
15. **Deploy B (Heroes):** Flip `INGESTION_USE_ALIAS_API=true`. Sheet uploads resume. Old code path removed in same deploy or next — don't leave dual paths around as permanent state.
16. **Deploy C (portal):** `REVOKE INSERT/UPDATE/DELETE` on `identity_users` and `user_aliases` from Heroes' DB role.
17. **Verification:** Heroes attempts a forced `INSERT INTO identity_users` from its service account in staging — must fail. Document this as a periodic regression test.

### Phase 4 — Cleanup

18. **Remove legacy user-create code** identified in Phase 0 audit. Delete, don't comment-out.
19. **Update CLAUDE.md / spec docs.** `heroes_profiles` is the domain table, identity comes from portal, sheet ingestion never creates users.
20. **Add CI guard.** Static check that fails the build if `INSERT INTO identity_users` (or, on Heroes' side, any user-creation pattern) appears outside the portal-webhook-consumer module. Cheap, prevents the next-intern footgun at the app layer (DB-role REVOKE is the real fence; this is belt-and-suspenders).

### Estimated scope

- Phase 0: 1–2 days (mostly mechanical rename + audit).
- Phase 2: 5–8 days (new tables, ingestion rewrite, webhook consumer, audit log, ops view).
- Phase 3: half-day cutover, requires portal-side coordination.
- Phase 4: 1–2 days.

Total: ~2 weeks Heroes engineering, gated on portal spec finalization and backfill readiness.

### Open dependencies on portal contract

| Step | Depends on §Open Question |
|------|---------------------------|
| 7 (batch resolve) | Q1 — batch endpoint shape |
| 6, 9 (cache) | Q2 — caching allowed + invalidation events |
| 8 (webhook consumer) | Q3 — delivery semantics + DLQ |
| 7 (tombstone branch) | Q4 — explicit tombstone field |
| 13 (freeze window) | Q5 — freeze vs fallback |

If portal answers differ from defaults, the affected steps adjust — overall sequence holds.
