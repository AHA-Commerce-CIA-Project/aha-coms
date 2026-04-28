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

### Collision handling at provision time

When portal provisions a new user and tries to auto-seed their alias from `display_name`, it runs a check:

1. **Exact match against any existing alias on a different user** → refuse auto-seed, surface to admin queue.
2. **Fuzzy match against any existing alias on a different user** (normalized: lowercase, collapsed whitespace, optional Levenshtein ≤2 or token-set match) → also refuse, surface to admin queue.

Cheap to add at provision time. Catastrophic to retrofit later, because every "Jane S." vs "Jane Smith" duplicate that lands in production has to be unwound by hand.

The collision queue lives in portal admin (it's portal's concern). Portal admin disambiguates manually — typically by adding a discriminator (`Jane Smith (Eng)`), confirming the new user is genuinely distinct, or merging if it was an accidental duplicate signup.

### Soft-delete on deactivation, with an audit-log routing path

When portal deactivates a user (offboarding, account closure, etc.):

- Aliases stay alive but the user they point at is tombstoned (`status = 'deactivated'`, `deactivated_at` set).
- The resolve API returns `{ portal_sub, alias_id, is_primary, tombstoned: true, deactivated_at }` — explicit field, **not a 404**, so apps can distinguish "no such alias" from "alias resolves to a deactivated user."
- Apps route tombstoned-resolution rows to an audit log (`deactivated_user_ingest_audit` on the Heroes side) instead of either silently ingesting (wrong: data on departed staff) or silently dropping (wrong: ops doesn't know the row was skipped).

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
3. **Portal seed:** Portal runs the one-shot alias backfill from `identity_users.name`. Heroes verifies via reconciliation query that every `heroes_profiles.portal_sub` resolves through the new API.
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

---

## API contract (portal-side)

### `POST /api/aliases/resolve-batch`

Body: `{ names: string[] }` (max 500 per call)
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

### `POST /webhooks/portal/alias-updated` and `alias-deleted`

For consumers maintaining a local `alias_cache`. Same envelope. Out of scope for v1 if no app caches; ship when first cache lands.

---

## Open Questions

These are contract details, not architecture disagreements. Resolved between portal and Heroes before either side starts implementation.

1. **Resolve API: confirm batch-only.** Is `POST /aliases/resolve-batch` sufficient, or is there a sync single-name use case (admin tooling, on-demand lookups) that needs `GET /aliases/resolve?name=...`? Default: batch-only for v1.
2. **Local caching policy.** Can H-apps cache `name → portal_sub` locally with TTL? If yes, how is invalidation signaled — `alias.resolved` only, or also `alias.updated` and `alias.deleted`? Default proposal: caching allowed, invalidation via all three events; ship cache-related webhooks lazily when first consumer needs them.
3. **Webhook delivery semantics for `alias.resolved`.** Does it ride the existing Rev 2 Spec 03 webhook delivery + DLQ, or is identity-layer fan-out important enough to warrant its own delivery channel? Default: reuse existing infra.
4. **Tombstone signal in resolve API.** Confirm `{ tombstoned: true, deactivatedAt }` field — vs returning a special status code or a separate endpoint. Default: explicit fields in the same response shape (proposed above).
5. **Backfill cutover window.** Confirm sheet uploads are frozen for the duration of the seed (no fallback to old behavior). Default: freeze, target <2h.
6. **Collision-on-provision UX.** When auto-seed refuses due to collision, who gets paged — portal admin only, or also the H-app ops who's about to upload a sheet that depends on the new alias landing? Default: portal admin only at provisioning; Heroes ops sees the row in their own queue when it fails to resolve, which is a sufficient signal.

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
