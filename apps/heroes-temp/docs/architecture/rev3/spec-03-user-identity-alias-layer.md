# Rev 3 — Spec 03: User Identity Ownership, Alias Layer & Per-App Config

> Priority: **Critical-path. Must land before Heroes (or any H-app) takes real users.**
> Scope: Portal (alias table, per-app config, app manifests, resolve API, provisioning + config webhooks, admin UI for single + bulk config edits, DB-role lockdown) + every H-app (drop user-creation paths, drop role/eligibility columns, add ingestion + provisioning + config webhook consumers, add caches).
> Prerequisites: Rev 2 closed (portal owns identity end-to-end). Rev 3 Spec 01 in flight (the account widget surfaces identity; this spec hardens the writer side of identity and extends portal to own per-app config).
>
> **Heroes-side state (2026-05-03):** Spec 01 + Spec 02 Heroes-side adoption SHIPPED 2026-05-03 (PR #2 on `mrdoorba/coms-aha-heroes`, deploy run `25267737871`) — Heroes runs on shared chrome (`@coms-portal/ui/chrome`) + AccountWidget + design tokens, with the broker exchange now writing `portal_role` + `apps` onto Heroes' session table via migration `0010_dear_kabuki`. **Spec 03 Heroes-side cutover (this spec's §Appendix A) is the next focus** — schema rename `users` → `heroes_profiles`, drop role/eligibility columns, ingestion rewrite via `POST /api/aliases/resolve-batch`, alias + user-config caches, webhook consumers, audit log, wipe-and-reprovision cutover. Pre-real-users on Heroes makes the wipe a no-op.
>
> **Spec 06 status (2026-05-03):** Spec 06 (`spec-06-dual-email-auth.md`) shipped end-to-end (PRs A → F) on 2026-05-03 (PR F commit `8f13c64`). The §Schema section below still describes pre-Spec-06 state for historical reference; the live schema is the multi-row `identity_user_emails` table with kind discriminator (`'workspace' | 'personal'`), per-row `verifiedAt`, `addedBy` provenance, plus `identity_user_emails_history` (DELETE-trigger tombstone) and `auth_sessions` (portal-native opaque-UUID session vehicle). The OTP-based auth path for personal-email and admin/self-service session management are live. `identity_users.email` and `identity_users.personal_email` are gone. User aliases (`user_aliases`) — *display-name* aliases for sheet ingestion — remain unrelated to email aliases and unchanged by Spec 06. See `spec-00-implementation-timeline.md` for the at-a-glance status. Wipe-and-reprovision (vs. data-preserving alias backfill) remains the locked path for Heroes-side cutover.

---

## Status (2026-04-29) — portal-side shipped on `main`; test-gate clean

All twelve portal-side effects of this spec landed in a single coordinated session on 2026-04-28 and are merged to `main`. The schema migrations, services, routes, webhooks, admin UIs, and the gated REVOKE migration are all in place; the merge ships as commits `b6e3bd1` through `e296ab5` plus follow-up `b407682` (svelte-check fix). The `@coms-portal/shared` package is at `v1.4.0` with new event types and the additive `appConfig` payload extension.

**Test-gate cleanup (Spec 03b) shipped 2026-04-29.** All 261 API tests pass locally; the CI deploy gate is ready to unblock on the next push to `main`. See `docs/architecture/rev3/spec-03b-test-gate-cleanup.md` for the full resolution shape — root cause was Bun `mock.module` process-global cross-file contamination (not real fixture bugs); fix introduced `apps/api/src/test-helpers/schema-barrel-mock.ts` and a snapshot+restore mock-isolation pattern now enforced via `.codebase-memory/adr.md` §7.

**What ships portal-side:**

- `user_aliases` table with Postgres `GENERATED ALWAYS AS` for `alias_normalized`; partial unique on `is_primary`; backfill seeded for every active `identity_users` row.
- `alias_collision_queue` table + admin UI at `/admin/aliases` for resolve / reject actions.
- Alias service (`apps/api/src/services/aliases.ts`): `resolveAliases`, `createAlias`, `renamePrimaryAlias` (transactional demote → promote), `detectCollision` (Levenshtein ≤ 2 OR token-set match per spec).
- `POST /api/aliases/resolve-batch` — body cap 1000 names / 256 KB; auth via inbound app SA token middleware (Google OIDC ID token → `app_registry.serviceAccountEmail` lookup); per-app token bucket (20 RPS, burst 40, in-memory single-instance — multi-instance limitation documented in source).
- Webhooks: `alias.resolved` / `alias.updated` / `alias.deleted` riding the existing Rev 2 Spec 03 dispatcher + Cloud Tasks retries + DLQ.
- `app_manifests` (config_schema only — webhook URL/secret remain on `app_webhook_endpoints`), `app_user_config`, `bulk_edit_locks`. Heroes manifest registered at boot from `apps/api/src/services/manifests/heroes.json`.
- `app_user_config` seeded inside the `createEmployee` transaction for every CSV/Sheet/manual create path; sheet-sync `emitUserProvisioned` gap fix; `user.provisioned` payload extended with optional per-recipient `appConfig` slice.
- `app_config.updated` webhook with `batchId` for bulk; `GET /api/users/:portalSub/config/:appId` (auth via `requireAppToken`, 403 on app-slug mismatch).
- Admin app config UI at `/admin/app-config` — manifest-rendered single edit, selection-bulk via `BatchToolbar`, CSV-bulk preview-then-commit with diff display and `bulk_edit_locks` enforcement.
- `apps/api/src/db/migrations/cutover/0001_revoke_heroes_writes.sql` is staged (NOT auto-applied) with cutover runbook in `cutover/README.md`. Apply at Deploy C.

**Naming reconciliation (vs. spec prose):** the spec calls webhook events `user.created` / `user.updated` / `user.deactivated`. Reconnaissance found Rev 2 already publishes `user.provisioned` / `user.updated` / `user.offboarded`. The implementation reuses the Rev 2 names (additive `appConfig` extension on `user.provisioned`); the spec's prose names should be read as synonyms.

**Known debt — Spec 03b cleared 2026-04-29.** CI's test gate (red on `main` since this spec's merge) is locally green at 261 pass / 0 fail. Resolution turned out to be cross-file Bun `mock.module` contamination, not real fixture bugs; details in `spec-03b-test-gate-cleanup.md`. Deploy job expected to run on the next push to `main`.

**What remains — Heroes-side (out of portal scope):** the Heroes-side adoption work in §Appendix A — rename `users` → `heroes_profiles`, drop role/eligibility columns, ingestion rewrite via the new `POST /api/aliases/resolve-batch`, alias + user-config caches, webhook consumers, audit log routing. The Phase 3 cutover (truncate + reprovision + apply the gated REVOKE) is a coordinated <30-minute window with portal.

Mission artefacts (red-cell review, captain's log, lessons): `.nelson/missions/2026-04-28_050010_1b5c498e/`.

---

## Migration note (2026-04-28)

An earlier draft of this spec preserved Heroes' existing user data via a one-shot alias backfill from `identity_users.name` ∪ Heroes' production `users.name` export. Heroes signed off on that approach on 2026-04-28; later the same day the team pivoted to **wipe Heroes' data and reprovision from portal**, because Heroes is pre-real-users and the disposability of current data turns the most fragile step (alias backfill reconciliation) into a no-op. The rewrite below reflects the new direction. The alias layer itself, the identity-vs-projection framing, and the DB-role REVOKE remain unchanged.

The pivot also widened scope: portal now owns **per-app configuration** (Heroes role, leaderboard eligibility, future-app analogues) in addition to identity. Apps become pure projections.

---

## Overview

Rev 2 made the portal the **sole authenticator** of users. This spec makes the portal the **sole writer** of users **and** the **sole owner of per-app configuration**.

Today, Heroes' Google Sheet ingestion can implicitly create user records when it encounters an unfamiliar name, and Heroes' own `users` table carries role + eligibility columns that are really *identity-shaped* config. Both are fine pre-real-users. The moment real customers arrive, name typos and duplicate identities silently mint, and per-app config sprawl across H-apps becomes a reconciliation nightmare.

The fix is three layers:

1. **Lock down user creation** — only the portal mints `identity_users` rows. Every other service's DB role loses `INSERT/UPDATE/DELETE` on that table. Application discipline is advisory; the database enforces.
2. **Alias layer** — portal owns a `user_aliases` table mapping display-name strings (and historical variants) to a stable `identity_users.id`. Apps' batch ingestion (sheets, CSVs, etc.) resolves names through this table instead of creating users.
3. **Per-app config in portal** — portal owns `app_user_config`, a generic `(portal_sub, app_id, config jsonb)` table, and each app declares its config schema + defaults via an **app manifest** at registration time. Portal admin UI renders single + bulk editors from the manifest. Apps subscribe to provisioning + config webhooks and materialize projection rows; they never write identity or config.

---

## The identity-vs-projection split (the framing that matters)

This spec only works if both teams hold the same mental model:

- **Portal owns identity.** `identity_users` rows are *who someone is*: `id`, `gip_uid`, `email`, canonical `name`, `portal_role`, lifecycle status. Aliases are an attribute of identity.
- **Portal owns per-app config.** `app_user_config` rows are *what a user is configured as in app X*: Heroes role, leaderboard eligibility, etc. Edited via portal admin UI; fanned out to apps via webhook.
- **Each H-app owns its domain projection.** Heroes has a row per user with points, rank, leaderboard position. That row is *not* a user, and it does *not* carry role or eligibility — it is Heroes' projection of a user, materialized from portal-pushed events. The link is `portal_sub` (= `identity_users.id`), used as a foreign key.

Today Heroes happens to call its projection table `users`, and that table carries role + eligibility columns. Both are leaks — the table looks like an identity table when it isn't, which is exactly why ingestion code felt entitled to `INSERT INTO users`, and the columns look like domain attributes when they're really portal-owned config. The rename to `heroes_profiles` (or similar) plus the strip of role/eligibility columns is part of this spec's deliverables on the Heroes side. Same applies to every future H-app.

Concretely:

| Concern | Owner | Table |
|---------|-------|-------|
| Who someone is | Portal | `identity_users` |
| Names a user is known by | Portal | `user_aliases` |
| Per-app config (Heroes role, leaderboard eligibility, future-app keys) | Portal | `app_user_config` |
| Per-app config schema declaration | Portal | `app_manifests` |
| Heroes points / rank / leaderboard | Heroes | `heroes_profiles` (renamed from `users`, role/eligibility columns dropped) |
| Pending sheet rows awaiting alias | Heroes | `pending_alias_resolution` |
| Ingestion of rows belonging to deactivated users | Heroes | `deactivated_user_ingest_audit` |

Portal never sees Heroes' rank data; Heroes never writes portal identity or per-app config. Crossing points are the alias-resolve API, the provisioning/config webhooks, and a read endpoint for cache-miss config lookups.

---

## Decisions Up Front

### Portal owns the alias table; each H-app owns its own queue

The alias table itself (`user_aliases`) lives in the portal. Aliases are an identity attribute — keeping them in portal keeps identity and its naming layer together, lets every app share one canonical resolver, and avoids fan-out of the same data across apps.

The **unresolved-name queue**, however, stays app-side. Each app's batch ingestion has app-specific context (sheet IDs, row numbers, retry semantics, source files) that does not belong in portal. Heroes' queue is `pending_alias_resolution` in Heroes' DB. Future apps add their own. Portal does not maintain a global queue — that would make portal a chokepoint and force every queue evolution to ship in lockstep with portal.

The handoff is async: portal exposes a `POST /webhooks/portal/alias-resolved` event that each app subscribes to. When ops resolves an alias in portal admin, portal fires the webhook, every app drains its own queue independently.

### Portal owns per-app config; apps declare schema via manifest

`app_user_config` is a generic `(portal_sub, app_id, config jsonb, updated_at)` table with `UNIQUE (portal_sub, app_id)`. Portal does not model any specific app's config shape — that would put Heroes' domain back in portal, exactly the leak this spec is undoing.

Each app, at registration time, ships an **app manifest** declaring the config keys it cares about: type, allowed values, default. Portal admin UI reads the manifest and renders editors from it (dropdowns for enums, toggles for booleans, number inputs for integers, etc.). Onboarding a new H-app does not require a portal schema migration — the app ships a manifest update.

**Defaults are load-bearing.** When a user is created, portal seeds `app_user_config` rows for every registered app using manifest defaults. The `user.created` webhook payload includes the seeded config so apps can materialize projections immediately, without a follow-up read. If an app needs config that has no safe default, the manifest declares a placeholder like `unconfigured` and the app refuses to materialize until admin sets a real value — never extend CSV columns to capture per-app config at create-time.

### User creation is identity-only; per-app config is edited separately

Portal's existing user-creation flows (CSV upload, Google Sheet sync, manual create from Rev 2) **create identity only**. They do not carry per-app config columns. They:

1. Create the `identity_users` row.
2. Seed the `user_aliases` row (with the supplied name).
3. Seed `app_user_config` rows for every registered app from manifest defaults.
4. Fire `user.created` webhook to all subscribed apps.

Per-app config — for Heroes role, leaderboard eligibility, etc. — is edited in a **separate admin surface** ("App Configuration"), supporting both single-user and bulk operations. This keeps the bulk-create path simple (uploading 500 CSV rows doesn't force admin to know each user's Heroes role on day one) and gives a clean audit trail (creation events and config-change events are distinct, with distinct actors and timestamps).

### Bulk per-app config editing is a first-class admin feature

Two flows:

1. **Selection-based bulk edit.** Admin filters/searches users in the app's config panel (e.g., "all Heroes users where role=member"), multi-selects, opens the manifest-rendered editor, applies to all selected.
2. **CSV-based bulk edit.** Admin downloads a CSV of current config for an app (`portal_sub, name, <config keys>`), edits in spreadsheet, re-uploads. Portal diffs against current state, validates against manifest, applies. **This CSV does not create users** — rows with unknown `portal_sub` are rejected, not auto-created. Keeps the user-creation / config-editing boundary clean.

Safety rails for bulk:

- **Manifest validation runs per-row before any fan-out.** If 3 of 500 rows fail validation, the whole batch is rejected with a per-row error report. No partial application.
- **Diff preview before commit.** Portal shows "47 users will change role from `member` to `captain`" before firing webhooks. Avoids the "I meant the other column" disaster.
- **Audit log captures the full diff.** Who, when, manifest schema version, before/after for every affected user. Searchable. Reversible by re-running the inverse.
- **Per-app concurrency lock.** Only one bulk edit per app in flight at a time, to prevent two admins racing on overlapping user sets. Single-user edits unaffected.

Bulk fan-out shape: N individual `app_config.updated` events sharing a `batchId` field. Apps' webhook handlers stay simple (same shape as single-user updates); apps can debounce projection writes if they want — that's an app-side optimization, not a portal contract.

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
- `user.deactivated` webhook fires so apps can also flag the projection row as inactive (e.g., suppress from leaderboards).

**Tombstoned aliases retain their `alias_normalized` uniqueness slot.** A new signup with the same normalized name does not auto-resolve — it lands in the portal admin collision queue, exactly as it would for a live alias. Portal admin then chooses: reactivate the existing identity (most common case — same person returning), merge as same person, or reject. Releasing the slot on tombstone would let two real-but-historical "Janes" coexist in the index and silently break the domain invariant.

Hard-delete is wrong here for the same reason hard-replace on name update is wrong: historical sheets break the day after deprovisioning.

### DB-role REVOKE is the actual lockdown

Application code that says "only portal creates users" rots within two quarters. The next intern wires up an admin endpoint that touches `identity_users` directly and we are back where we started. The real lockdown is at the database role level:

```sql
REVOKE INSERT, UPDATE, DELETE ON identity_users    FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON user_aliases      FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON app_user_config   FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON app_manifests     FROM heroes_app_role;
-- repeat for every H-app role
```

After cutover, only the **portal API service account** has write access to `identity_users`, `user_aliases`, `app_user_config`, and `app_manifests`. Any other code that attempts a write fails at the database, not at code review.

This applies to every H-app today and forms a precondition for onboarding any future H-app.

### Wipe-and-reprovision cutover

Heroes is pre-real-users; its current `users` rows, points data, and rank state are disposable. That collapses the cutover dramatically — there is no alias backfill, no freeze window, no dual-path period.

Sequence:

1. **Heroes ships projection-only schema (Deploy A).** New ingestion code uses `POST /api/aliases/resolve-batch`. `heroes_profiles` exists alongside legacy `users` for the deploy; role/eligibility columns are dropped or moved to `app_user_config` reads. New code is dormant until cutover.
2. **Portal ships per-app config + provisioning webhooks (Deploy B).** `app_user_config`, `app_manifests`, admin UI for single + bulk config edits, `user.created` / `user.updated` / `user.deactivated` / `app_config.updated` webhooks. Heroes' manifest registered.
3. **Cutover window (target <30min):**
   - Heroes truncates `users`, points tables, rank tables, leaderboard tables — every table that depends on the old identity rows. Verified empty.
   - Portal admin provisions users via existing flows (CSV / Sheet / manual). Each create fires `user.created`; Heroes materializes empty `heroes_profiles` rows with default config.
   - Portal admin sets per-app config (single or bulk) where defaults aren't right.
   - Heroes ops re-runs sheet ingestion for points data. Sheet rows resolve names via `POST /api/aliases/resolve-batch`; resolved rows write points into `heroes_profiles`-keyed tables; unresolved rows land in `pending_alias_resolution`.
4. **Deploy C (Portal):** `REVOKE INSERT/UPDATE/DELETE` on `identity_users`, `user_aliases`, `app_user_config`, `app_manifests` from Heroes' DB role. Verify with a forced `INSERT` from Heroes' service account in staging — must fail.

No fallback to old name-matching path. No `INGESTION_USE_ALIAS_API` flag. Heroes' legacy user-create code is deleted in Deploy A, not gated.

---

## Schema

### Portal: `identity_user_emails` (as of spec-06 PR A)

> **Note:** As of Spec 06 PR A (shipped 2026-04-30, commit `049008d`), `identity_users.email` and `identity_users.personal_email` (the pre-Spec-06 single-column model described in this spec's prose and status section) were replaced by the multi-row `identity_user_emails` table with a `kind` discriminator (`'workspace' | 'personal'`), per-row `verifiedAt`, and `addedBy` provenance. The pattern mirrors this spec's own `user_aliases` shape — one FK into `identity_users`, one discriminator per row, one history/tombstone trail. User aliases (`user_aliases`) — display-name aliases for sheet ingestion — are unrelated to email aliases and remain governed by this spec.

---

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
    // 'auto_seed' | 'manual' | 'name_update'
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
- Two-step write on rename: `UPDATE` old primary to `is_primary = false`, commit, then `INSERT/UPDATE` new primary. Keeps the partial-unique check eager. Read paths must tolerate the gap (`SELECT ... WHERE is_primary = true LIMIT 1` may return zero rows mid-rename); fall back to `ORDER BY created_at DESC LIMIT 1` when primary returns empty. Account widget (Spec 01) and any other display-name reader follows this rule.

### Portal: `app_manifests`

```ts
export const appManifests = pgTable('app_manifests', {
  appId: varchar('app_id', { length: 64 }).primaryKey(),
  displayName: varchar('display_name', { length: 128 }).notNull(),
  configSchema: jsonb('config_schema').notNull(),
    // {
    //   "role": { "type": "enum", "values": ["member", "captain", "admin"], "default": "member" },
    //   "leaderboard_eligible": { "type": "boolean", "default": true },
    //   "starting_points": { "type": "integer", "default": 0 }
    // }
  schemaVersion: integer('schema_version').notNull().default(1),
  webhookUrl: text('webhook_url').notNull(),
  webhookSecret: text('webhook_secret').notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- `configSchema` declares each config key's type, allowed values (for enums), and **default**. Portal admin UI renders editors from this declaration.
- `schemaVersion` increments on manifest update; webhook payloads carry the version so apps can detect drift.
- Supported types in v1: `enum`, `boolean`, `integer`, `string`. Validation runs portal-side before any write to `app_user_config` and before any webhook fan-out.

### Portal: `app_user_config`

```ts
export const appUserConfig = pgTable('app_user_config', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  portalSub: uuid('portal_sub')
    .notNull()
    .references(() => identityUsers.id, { onDelete: 'cascade' }),
  appId: varchar('app_id', { length: 64 })
    .notNull()
    .references(() => appManifests.appId),
  config: jsonb('config').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => identityUsers.id),
}, (t) => ({
  uniqUserApp: uniqueIndex('app_user_config_portal_sub_app_id_uniq').on(t.portalSub, t.appId),
  byApp: index('app_user_config_app_id_idx').on(t.appId),
}))
```

- One row per (user, app). Seeded on `user.created` from manifest defaults; updated by single + bulk admin edits.
- `schemaVersion` snapshotted from `app_manifests.schemaVersion` at write time so audits can reconstruct what schema the row was written against.

### Heroes: rename `users` → `heroes_profiles`, drop role/eligibility

- Pure rename for the table. `portal_sub` (→ `identity_users.id`) stays the FK.
- **Drop columns:** `role`, `leaderboard_eligible`, any other column that is per-app config rather than domain projection. Those move to `app_user_config` reads.
- All consuming code updated. Read paths that referenced `users.role` now consume the cached webhook payload (or pull from `GET /api/users/:portalSub/config/heroes`).

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

### Heroes: `user_config_cache`

Mirrors the per-app config payload pushed via `user.created` / `app_config.updated`. Same push-plus-pull-on-miss pattern as `alias_cache`.

```ts
export const userConfigCache = pgTable('user_config_cache', {
  portalSub: uuid('portal_sub').primaryKey(),
  config: jsonb('config').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- TTL: 24h. Miss or expiry → `GET /api/users/:portalSub/config/heroes`.
- Webhook handlers (`user.created`, `app_config.updated`) upsert directly from the payload.
- `user.deactivated` does not delete — the projection row may need to render historical state. Apps mark inactive via the projection row, not the config cache.

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
- Rate limit: 20 RPS per app SA token (token bucket, burst 40); up to 4 parallel batches per app instance — lands a 5000-row sheet in two round-trips. Soft-fail with HTTP 429 + `Retry-After` on overage; clients honor the header.
- Auth: app-to-portal service token (existing pattern from Rev 2 Spec 04).
- Normalization is portal-side — apps send raw names, portal normalizes and looks up.

A single-name `GET /api/aliases/resolve?name=...` is **not** in scope for v1.

### `GET /api/users/:portalSub/config/:appId`

Pull-side of the config push+pull cache. Returns the current `app_user_config` row for one (user, app):

```json
{
  "portalSub": "uuid",
  "appId": "heroes",
  "config": { "role": "captain", "leaderboard_eligible": true, "starting_points": 0 },
  "schemaVersion": 3,
  "updatedAt": "2026-04-28T..."
}
```

- Auth: app SA token.
- 404 if the user has no config row for the app (should not happen in normal operation — `user.created` seeds defaults — but apps should handle defensively).

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

### `POST /webhooks/portal/user-created`

Fires on every new `identity_users` row (from CSV upload, Sheet sync, or manual create).

Payload:
```json
{
  "eventId": "uuid",
  "type": "user.created",
  "occurredAt": "2026-04-28T...",
  "user": {
    "portalSub": "uuid",
    "email": "jane@example.com",
    "name": "Jane Smith",
    "primaryAliasId": "uuid"
  },
  "appConfig": {
    "config": { "role": "member", "leaderboard_eligible": true, "starting_points": 0 },
    "schemaVersion": 3
  }
}
```

- `appConfig` is **per-recipient** — portal sends each app only its own config slice (filtered by `app_id`).
- Consumers materialize the projection row immediately using `user` + `appConfig`. No follow-up read required.
- Idempotent on `eventId`.

### `POST /webhooks/portal/user-updated`

Fires when identity-level fields change (email, name). Display-name changes also fire `alias.updated` — apps consume whichever they care about. Most apps will only need `user.updated` for email; name changes are usually downstream of alias events.

Same envelope as `user.created`, with only changed fields populated under `user`. No `appConfig` block (config changes use `app_config.updated`).

### `POST /webhooks/portal/user-deactivated`

Fires when a user is tombstoned (status = 'deactivated').

Payload:
```json
{
  "eventId": "uuid",
  "type": "user.deactivated",
  "occurredAt": "2026-04-28T...",
  "user": {
    "portalSub": "uuid",
    "deactivatedAt": "2026-04-28T..."
  }
}
```

Consumer behavior: mark the projection row inactive (suppress from leaderboards, etc.). Do not delete — historical points / rank state must remain queryable. Aliases continue to resolve with `tombstoned: true`.

### `POST /webhooks/portal/app-config-updated`

Fires when portal admin edits a user's per-app config (single edit OR each row of a bulk edit).

Payload:
```json
{
  "eventId": "uuid",
  "type": "app_config.updated",
  "occurredAt": "2026-04-28T...",
  "batchId": "uuid-or-null",
  "user": {
    "portalSub": "uuid"
  },
  "config": { "role": "captain", "leaderboard_eligible": true, "starting_points": 0 },
  "previousConfig": { "role": "member", "leaderboard_eligible": true, "starting_points": 0 },
  "schemaVersion": 3
}
```

- `batchId` is non-null when the change came from a bulk edit; consumers may correlate / dedupe / report on bulk operations using it. Null for single-user edits.
- Portal sends each app only its own config slice — Heroes never sees a future App-X's config.
- Consumers update the cache and adjust projection rows as needed (e.g., toggle leaderboard suppression based on `leaderboard_eligible`).
- Apps may debounce projection writes for high-volume `batchId`s — that's an app-side optimization, not a portal contract.

All webhook events ride the existing Rev 2 Spec 03 webhook delivery + DLQ. At-least-once delivery; consumers idempotent on `eventId`.

---

## Migration-PR notes

Captured here so they aren't lost between spec finalization and implementation:

- **Two-step primary update on rename.** Read paths that filter `is_primary = true` must tolerate a zero-row gap during the demote → commit → promote sequence. Fall back to `ORDER BY created_at DESC LIMIT 1` when the primary query returns empty. Applies to the account widget (Spec 01) and any other display-name reader. The fallback is the rule for any consumer of `is_primary`, not a special case.
- **Per-app config CSV upload (bulk edit).** Rows with unknown `portal_sub` are rejected with a per-row error report; no auto-create. Rows where any config value fails manifest validation also reject the entire batch, not just the offending row — partial application is forbidden. Pre-flight runs the full diff before any write or webhook fires.
- **Manifest schema version bumps.** When an app updates its manifest (adds a new key, narrows an enum), portal does not retroactively rewrite existing `app_user_config` rows. They keep their snapshotted `schemaVersion`; on next read or edit, portal upgrades them by filling new keys with manifest defaults. Webhook payloads always carry `schemaVersion` so apps can detect drift if they care.
- **Bulk concurrency lock.** Per-app — only one bulk edit per `app_id` in flight. Implemented as a row in a `bulk_edit_locks` table with `app_id` PK and `acquired_at` / `acquired_by`; admin UI shows "another bulk edit is in progress" if locked. Single-user edits bypass the lock.

---

## Out of Scope

- **Cross-app dedup of identities.** If a person exists in two H-apps under different portal subs, that is a portal-side identity merge problem, not an alias problem. Out of scope here.
- **Email-based resolution.** Aliases resolve names. Email is already a unique key on `identity_users`. Apps with email available should use email; this layer is specifically for the name-only case sheet ingestion is stuck with.
- **Real-time ingestion.** This spec assumes batch (sheets). Streaming ingestion (a hypothetical real-time event source) needs its own design — likely event-sourced and not alias-shaped.
- **Self-service per-app config (user-facing).** Users do not edit their own per-app config in v1. Admin-only. Self-service is a future spec if it's ever needed.
- **Manifest type system beyond v1.** v1 supports `enum`, `boolean`, `integer`, `string`. Compound types (lists, nested objects), conditional defaults, cross-key validation rules — all out of scope; add when an app actually needs them.

---

## Known limitations (post-shipping verification)

Captured 2026-04-29 from a verification pass against the shipped Spec 03 codebase. None of these block Heroes adoption; they are documented so future readers don't mistake them for bugs and so Spec 03c (pre-Spec-4 hardening) has a clean punch list.

- **Webhook DLQ implementation drift.** `apps/api/src/services/webhook-dispatcher.ts:12` — the design comment refers to `/api/internal/webhook-dlq` as the dead-letter handler. That route does not exist. Terminal-attempt logic is inline in `/api/internal/webhook-delivery` at `apps/api/src/routes/internal.ts:144–182` (sets the endpoint to `disabled` when `retryCountNum === MAX_ATTEMPTS - 1`). Functionally correct; the abstraction in the comment is aspirational. **Spec 03c** either builds the standalone route as a Pub/Sub-triggered handler or corrects the comment (recommend the latter).

- **Webhook secret storage is plaintext.** `apps/api/src/db/schema/app-webhook-endpoints.ts:14` stores `secret` as `text(...)` with the explicit comment "stored as-is (not hashed) — portal needs to sign outbound payloads with it". Accepted because a one-way hash would make the portal unable to mint HMAC signatures at delivery time. Migration path = envelope-encrypt with KMS, decrypt at delivery. Not blocking today; promote when an external tenant requires per-secret trust isolation.

- **Single global broker signing key.** `apps/api/src/services/signing-keys.ts` enforces a single ACTIVE row in `portal_broker_signing_keys` (unique partial index on `status='active'`); `apps/api/src/services/auth-broker.ts:218–228` (`signES256BrokerToken`) loads it without per-app derivation. The HS256 path retains a per-app fallback (`auth-broker.ts:148`) but that is the legacy mode. Per-tenant signing key derivation is deferred until tenant #3 (external) requires cryptographic trust isolation — at that point, derive a per-app `kid` via HKDF from the global root and rotate per-app independently.

- **`compliance_status` enforced at registration only.** `apps/api/src/services/apps.ts:46–79` (`validateAppIntegrationMetadata`) enforces manifest path + `lastVerifiedAt` at registration time; `apps/api/src/services/auth-broker.ts:296–384` (`createBrokerHandoff`) does not check `compliance_status` during token issuance — only `app.status !== 'active'` and the user→app access list. So the field is decorative for the broker flow today. Promote to enforcement at token issuance when compliance gating is required (likely when an external tenant is onboarded under SOC 2 / ISO 27001 obligations).

- **Audit log gaps.** `apps/api/src/db/schema/audit.ts:5–15` defines `access_audit_log` with columns `id, actor_id, action, target_type, target_id, details, created_at`. Missing: `actor_ip`, `request_id`, failure events (the `AuditAction` enum only contains success-side actions), Cloud Logging sink, retention policy. **Spec 03c** adds the `actor_ip` and `request_id` columns (Drizzle migration via `drizzle-kit generate` per the project's standing rule) and wires the columns into all audit-write call sites. The Cloud Logging sink and retention policy stay deferred until a compliance review forces them.

---

## Success Criteria

Spec 03 is done when:

1. `identity_users`, `user_aliases`, `app_user_config`, and `app_manifests` rows can only be written by the portal API service account. Heroes' DB role attempts to `INSERT` and the database refuses.
2. `user_aliases` exists, is populated for every active `identity_users` row (one primary per user), and uniqueness on `alias_normalized` is enforced.
3. `app_manifests` registers Heroes' config schema; portal admin UI renders single + bulk editors from the manifest.
4. `app_user_config` carries every Heroes user's role + eligibility (and any future-app keys); Heroes' `heroes_profiles` table no longer carries role or eligibility columns.
5. Heroes has renamed `users` → `heroes_profiles`, dropped all user-creation code paths, dropped role/eligibility columns, and ingests sheet rows via `POST /api/aliases/resolve-batch`.
6. Portal user-create flows (CSV / Sheet / manual) fire `user.created` with seeded default config; Heroes materializes projection rows from the webhook without follow-up reads.
7. Single + bulk per-app config edits fire `app_config.updated` (with `batchId` for bulk); Heroes updates its cache and projection rows accordingly.
8. Unresolved sheet rows land in `pending_alias_resolution`; resolved aliases trigger `alias.resolved` webhook delivery; Heroes' webhook consumer drains the queue automatically.
9. Tombstoned-user resolution routes to `deactivated_user_ingest_audit`, not silently ingested or dropped. `user.deactivated` webhook flips the projection row to inactive.
10. A future H-app onboarding follows this same pattern by default — register manifest, subscribe to webhooks, build projection table, alias resolve API + per-app queue + DB-role REVOKE. Zero portal schema changes required.

---

## Appendix A — Heroes-Side Migration Plan

Sequenced to align with the wipe-and-reprovision cutover above.

### Phase 0 — Pre-cutover (Heroes-internal cleanup)

1. **Rename `users` → `heroes_profiles`.** Migration: rename table + all FK references. `portal_sub` stays as the key. Update all repository/service/route code. No behavior change yet.
2. **Drop role/eligibility columns from `heroes_profiles`.** Replace reads with calls to the (forthcoming) `user_config_cache` + `GET /api/users/:portalSub/config/heroes` fallback. Behind a feature flag if needed for staged rollout, but the flag is removed in Phase 4 — no permanent dual paths.
3. **Audit user-creation paths.** Grep every `INSERT INTO users` / ORM equivalent. Build a list — sheet ingestion is the known one, but check for forgotten admin endpoints, seed scripts, test fixtures that hit prod-shaped DBs. **Delete them all in Phase 4.**
4. **Add structured logging on every user-create path.** So we can verify zero non-portal creates in staging before locking writes.

### Phase 1 — Heroes ingestion + projection rewrite (Deploy A)

5. **Add `pending_alias_resolution` table.**
6. **Add `alias_cache` and `user_config_cache` tables.**
7. **Rewrite ingestion lookup.** New flow per sheet row:
   - Normalize name (lowercase + collapse whitespace).
   - Check `alias_cache` → fall through on miss/expiry.
   - Call portal `POST /aliases/resolve-batch` (one call per sheet upload, not per row).
   - **Resolved & not tombstoned →** upsert into `heroes_profiles`-keyed domain rows.
   - **Resolved & tombstoned →** write to `deactivated_user_ingest_audit`, do not ingest.
   - **Unresolved →** insert into `pending_alias_resolution`, do not create user.
8. **Webhook consumer for `alias.resolved`** at `/webhooks/portal/alias-resolved`. Idempotent on `eventId`. Looks up `pending_alias_resolution` rows by `raw_name_normalized`, re-runs ingestion, marks rows resolved, deletes after configurable retention (default 30d). Reuses Rev 2 Spec 03 DLQ pattern.
9. **Webhook consumers for `alias.updated` / `alias.deleted`.** Invalidate `alias_cache`.
10. **Webhook consumers for `user.created` / `user.updated` / `user.deactivated` / `app_config.updated`.** Materialize / update / mark-inactive `heroes_profiles` rows; upsert `user_config_cache` from payload.
11. **`deactivated_user_ingest_audit` table.**
12. **Admin/ops view.** Read-only endpoint listing `pending_alias_resolution` rows grouped by `raw_name_normalized`, with counts and oldest-first ordering. Ops uses this to know what to ask portal admin to map. CLI command acceptable if no UI budget.

### Phase 2 — Portal preparation (Deploy B, portal-driven)

Portal ships per-app config infrastructure:

13. `app_manifests` and `app_user_config` tables.
14. Manifest registration for Heroes (config schema in §Schema).
15. Admin UI: single-user config edit (manifest-rendered editor).
16. Admin UI: bulk config edit (selection-based + CSV upload).
17. `bulk_edit_locks` table + per-app concurrency lock.
18. Webhooks: `user.created`, `user.updated`, `user.deactivated`, `app_config.updated`. Heroes' manifest declares the webhook URL + secret; portal fires per-app slices.
19. `GET /api/users/:portalSub/config/:appId` read endpoint.

### Phase 3 — Cutover (coordinated)

20. **Truncate Heroes data.** `TRUNCATE heroes_profiles, heroes_points, heroes_rank, heroes_leaderboard, ...` — every table that depends on the old identity rows. Verified empty by reconciliation query.
21. **Portal admin provisions users.** Existing flows (CSV / Sheet / manual). Each create fires `user.created`; Heroes materializes empty `heroes_profiles` rows with default config from the webhook payload.
22. **Portal admin sets per-app config** (single + bulk) where defaults aren't right. `app_config.updated` events fan out; Heroes updates cache + projection rows.
23. **Heroes ops re-runs sheet ingestion for points data.** Sheet rows resolve via `POST /api/aliases/resolve-batch`; points land in `heroes_profiles`-keyed tables.
24. **Deploy C (portal):** `REVOKE INSERT/UPDATE/DELETE` on `identity_users`, `user_aliases`, `app_user_config`, `app_manifests` from Heroes' DB role.
25. **Verification:** Heroes attempts a forced `INSERT INTO identity_users` from its service account in staging — must fail. Document this as a periodic regression test.

### Phase 4 — Cleanup

26. **Remove legacy user-create code** identified in Phase 0 audit. Delete, don't comment-out.
27. **Remove the role/eligibility-column feature flag** from Phase 0 step 2. The cache + portal pull is the only path.
28. **Update CLAUDE.md / spec docs.** `heroes_profiles` is the domain table, identity comes from portal, per-app config comes from portal, sheet ingestion never creates users.
29. **Add CI guard.** Static check that fails the build if `INSERT INTO identity_users` (or, on Heroes' side, any user-creation pattern) appears outside the portal-webhook-consumer module. Cheap, prevents the next-intern footgun at the app layer (DB-role REVOKE is the real fence; this is belt-and-suspenders).

### Estimated scope

- Phase 0: 1–2 days (mechanical rename + column drop + audit + logging).
- Phase 1: 5–8 days (new tables, ingestion rewrite, six webhook consumers, two caches, audit log, ops view).
- Phase 2: 4–6 days portal-side (manifest infra, admin UI for single + bulk, webhook fan-out, config read endpoint).
- Phase 3: cutover window <30min, requires portal-side coordination.
- Phase 4: 1–2 days.

Total: ~2 weeks Heroes engineering + ~1 week portal engineering, parallelizable on Phase 1 / Phase 2. Cutover is a brief coordinated window, not a multi-hour freeze.
