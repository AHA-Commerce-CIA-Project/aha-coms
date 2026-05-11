# Heroes — Domain Context

This is the COMS Heroes app: points + rank + leaderboard projection over portal-owned identity. Portal is the system of record for who someone is and what employment they have; Heroes owns gamification state.

## Glossary

- **Identity** — Who a person is. Owned by portal (`identity_users`). Heroes never writes identity rows; it references them by `portal_sub` (= `identity_users.id`).

- **Employment** — Portal-owned HR-shaped attributes of an identity: `branch`, `team`, `department`, `position`, `phone`, `employmentStatus`, `talentaId`, `attendanceName`, `leaderName`, `birthDate`. Edited via portal's Employee admin UI. Pushed to Heroes via the `employment` block on `user.provisioned` / `user.updated` webhooks; pulled on cache miss. **Distinct from per-app config** — HR identity is shared across every H-app; per-app config is app-specific.

- **Per-app config** — App-scoped settings declared in the app's manifest (Heroes: `role`, `leaderboard_eligible`, `starting_points`). Edited in portal's App Configuration admin UI. Pushed to Heroes via `appConfig` slice on `user.provisioned` and via `app_config.updated` events.

- **Heroes profile** — Heroes' projection row keyed by `portal_sub`. Carries domain state (points, rank, leaderboard position) plus a denormalized cache of identity + employment + per-app config from webhook payloads. Will replace today's `users` table (rename `users` → `heroes_profiles`).

- **Alias** — A display-name string mapping to an `identity_users.id`. Owned by portal (`user_aliases`). Used for sheet-ingestion name resolution; not related to email aliases.

- **Tombstoned alias** — Alias whose underlying identity is deactivated. Resolves with `tombstoned: true` (not 404), routed to `deactivated_user_ingest_audit` instead of silently ingested or dropped.

## Org taxonomies

Portal owns enumerable HR taxonomies (branches, teams, departments, cost-centers, etc.) in a generic `org_taxonomies (taxonomy_id, key, value, metadata)` table. Every H-app projects them locally via `taxonomy.upserted` / `taxonomy.deleted` webhooks into a `taxonomy_cache (taxonomy_id, key, value, metadata, cached_at)` table. Initial sync on app registration fires the full set.

Employment webhook references taxonomies by `(taxonomyId, key)` not free string:

```json
"employment": {
  "branch": { "taxonomyId": "branches", "key": "ID-JKT", "value": "Indonesia – Jakarta" },
  "team":   { "taxonomyId": "teams",    "key": "team-ops-jakarta", "value": "Ops Jakarta" }
}
```

Heroes denormalizes `(key, value_snapshot)` pairs onto `heroes_profiles` (`branch_key`, `branch_value_snapshot`, `team_key`, `team_value_snapshot`, etc.) so leaderboard rendering needs no JOIN. The `taxonomy_cache` exists for cross-row queries ("all profiles in branch ID-JKT").

No FKs from `heroes_profiles` to local lookup tables. Heroes' pre-cutover `branches` and `teams` tables are removed (or replaced by read-only views over `taxonomy_cache`). Portal validates taxonomy keys before emitting employment events, so cache misses are bounded by webhook ordering races — handled idempotently.

This pattern is the contract for every future H-app: subscribe to `taxonomy.upserted`, project locally, denormalize keys onto your projection. Zero portal schema changes per new app.

## Webhook event taxonomy (post-Spec-03 cutover)

Portal-emitted, Heroes-consumed. All ride the existing Spec 03 webhook delivery + DLQ. Idempotent on `eventId`.

| Event | Fires when | Payload blocks |
|---|---|---|
| `user.provisioned` | New `identity_users` row | `user` + `employment` + `appConfig` |
| `user.updated` | Identity-field change (email, name) | `user` (only changed fields) |
| `employment.updated` | HR-field change (branch, team, department, position, phone, employmentStatus, talentaId, attendanceName, leaderName, birthDate) | `user.portalSub` + `employment` (only changed fields) + `previousEmployment` |
| `user.offboarded` | Identity tombstoned (status='deactivated') | `user.portalSub` + `deactivatedAt` |
| `app_config.updated` | Per-app config edit (single or bulk) | `user.portalSub` + `config` + `previousConfig` + `batchId` |
| `alias.resolved` / `alias.updated` / `alias.deleted` | Alias lifecycle | per spec §API contract |
| `taxonomy.upserted` | New or modified taxonomy entry (branches, teams, departments, ...) | `taxonomyId` + `entries: [{ key, value, metadata }]` |
| `taxonomy.deleted` | Taxonomy entry removed | `taxonomyId` + `keys: string[]` |

Rationale for splitting `employment.updated` from `user.updated`: HR edits (promotions, branch transfers) are far more frequent than identity edits (email/name). Splitting lets Heroes' handler skip identity-projection refresh on routine HR changes.

## Identity keys + email handling

- `heroes_profiles.id` IS the `portal_sub` (= `identity_users.id`). No autogen; portal supplies the UUID at insert time. All Heroes FKs continue to reference `heroes_profiles.id`; post-cutover they transitively reference portal identity.
- **Email is not stored on `heroes_profiles`.** Portal owns email (Spec 06). Heroes reads via `email_cache` (parallel to `alias_cache` / `user_config_cache`), populated from webhook payloads, with TTL + pull-on-miss.
- Webhook payloads carry `contactEmail` (portal's chosen contactable address per identity) — workspace if present, else personal. Both workspace-only and personal-only employees flow identically. Heroes does not see the workspace-vs-personal distinction.

## Contract sequencing

Revised phasing for the cutover (overrides Spec 03 §Appendix A original ordering):

| Phase | Owner | Scope |
|---|---|---|
| **1+2 (parallel)** | Portal | One coordinated release: per-app config + employment block + `email_cache`/`contactEmail` + `org_taxonomies` + new webhook events. Single `@coms-portal/shared` v1.6.0 bump exposing `EmploymentBlock`, `TaxonomyEvent`, `AppConfigEvent`, `ContactEmail` types. Portal **dual-emits** legacy + new envelope shapes for the gap window so today's Heroes webhook handler keeps working. |
| **3 (Heroes Deploy A)** | Heroes | Pin `@coms-portal/shared` v1.6.0. Add `pending_alias_resolution`, `alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `deactivated_user_ingest_audit`. Rename `users` → `heroes_profiles`. Drop local `branches` + `teams` tables. Rewrite ingestion via `POST /api/aliases/resolve-batch`. Replace single-endpoint webhook dispatcher with new envelope consumers. |
| **3.5** | Portal | Drop legacy webhook payload fields once Heroes Deploy A confirms it's reading the new envelope (one-release dual-emit window). |
| **4 (cutover)** | Both | TRUNCATE Heroes domain tables; portal re-provisions; Heroes materializes from webhooks. <30min coordinated window. |
| **5 (Deploy C portal)** | Portal | REVOKE INSERT/UPDATE/DELETE on portal-owned tables from Heroes' DB role. |
| **6 (cleanup)** | Heroes | Remove legacy user-create code, role/eligibility flag, CI guard for `INSERT INTO users` patterns. |

Wire format is versioned by `@coms-portal/shared` package release, never by runtime feature flag — preserves Spec 03's "no fallback path" rule on the Heroes side.

## Heroes Deploy A — PR breakdown

Two PRs, both shipped before cutover.

**PR A1 — Schema migration (mechanical):**
- Pin `@coms-portal/shared` v1.6.0
- Single Drizzle migration via `drizzle-kit generate` (no hand-edited journal)
- Rename `users` → `heroes_profiles`; `id` becomes portal_sub-shaped UUID (no defaultRandom); drop `email`, `personal_email`, `branchId`, `teamId`, `role`, `canSubmitPoints`; add `branch_key`, `branch_value_snapshot`, `team_key`, `team_value_snapshot`
- Rewire 11 dependent schemas' FKs from `users` → `heroes_profiles`
- Add 6 new tables: `pending_alias_resolution`, `alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `deactivated_user_ingest_audit`
- Drop `branches` and `teams` local tables
- Drop `authUser`; retarget better-auth to `heroes_profiles`; `authSession.userId` FK → `heroes_profiles.id`

**PR A2 — Behavior:**
- Refactor `routes/portal-webhooks.ts` into ~80-line route + 10 handler modules under `services/portal-events/`
- Rewrite broker exchange (`packages/web/src/routes/auth/portal/exchange/+server.ts`) to upsert `heroes_profiles`
- Rewrite `services/sheet-sync.ts` ingestion path against `POST /api/aliases/resolve-batch`; new tombstoned-user audit routing
- Add `bun run cutover:verify` (5-check gate)
- Add `POST /admin/pending-aliases/sweep`
- Delete legacy user-create code paths
- CI guard for `INSERT INTO users`-shaped patterns

## Auth tables consolidation

Pre-cutover Heroes has three identity-shaped stores: portal `identity_users` (source of truth), `users` (HR projection), and `authUser` (better-auth scaffold written by broker exchange). Spec 03 collapses `users` → `heroes_profiles`; this cutover ALSO collapses `authUser` into `heroes_profiles`.

- `authUser` table dropped. Better-auth retargeted to use `heroes_profiles` as its `user` table reference.
- `authSession.userId` FK retargets to `heroes_profiles.id` (= `portal_sub`).
- `authAccount` and `authVerification` tables stay (better-auth library internals; not identity-shaped).
- Broker exchange handler (`packages/web/src/routes/auth/portal/exchange/+server.ts`) **upserts** `heroes_profiles` on every login from the portal handoff payload (portal_sub, contactEmail, name). Treated as a portal-authenticated write path — handoff token is signed by portal, so it's a valid identity source even though it's not the webhook.
- Webhook handlers fill employment + appConfig blocks; broker fills identity-only fields. Overlapping fields use last-write-wins; portal is authoritative on every field, so order doesn't matter.

This eliminates the three-store drift problem (today: `identity_users` ↔ `authUser` ↔ `users` all carry name/email/role with no enforcement). Post-cutover Heroes has one row per identity, written from two portal-authenticated paths.

## Tables wiped at cutover

`heroes_profiles` plus all 11 schemas FK-referencing `users` today: `comments`, `point-summaries`, `sheet-sync-jobs`, `challenges`, `redemptions`, `appeals`, `notifications`, `audit-logs`, `achievement-points`, `system-settings` (the `updatedBy` FK is repointed; settings rows themselves are wiped to discard test-era values), and `users` itself. All caches (`alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `pending_alias_resolution`, `deactivated_user_ingest_audit`). Local `branches` + `teams` tables dropped (replaced by `taxonomy_cache`).

Pre-real-users posture: audit/comments history is disposable; no compliance retention requirement. If a future compliance regime demands actor-history retention, design that schema deliberately at the time — do not retrofit via cutover.

Post-cutover, `created_by` / `updated_by` columns continue as FKs to `heroes_profiles.id` (= `portal_sub`). Soft-delete on offboarding (`isActive = false`) keeps the FK safe; hard-delete is forbidden by spec.

## Cutover sequence (<30min window)

Pre-cutover (T-1h, portal-side, no emit):
- `org_taxonomies` populated with current branches + teams + departments.
- Heroes manifest registered with portal.
- Heroes' service-account WIF binding for portal endpoints verified.

T-0:
1. **Heroes truncates** all domain tables AND the new caches (`alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `pending_alias_resolution`, `deactivated_user_ingest_audit`, `heroes_profiles`, points, rank, leaderboard, comments, appeals, notifications, redemptions, audit_logs, point_summaries, achievement_points). Local `branches` + `teams` tables dropped.
2. **Heroes restarts.** On boot, calls `GET /api/taxonomies/sync` (pull-on-boot), populates `taxonomy_cache`. Same shape any future H-app uses to onboard — durable pattern, no cross-system fan-out coordination.
3. **Portal admin runs CSV/Sheet/manual provisioning.** Each `user.provisioned` event carries `employment` (referencing cached taxonomy keys), `appConfig` (manifest defaults), `contactEmail`. Heroes materializes empty `heroes_profiles` rows.
4. **Portal admin sets per-app config** where manifest defaults are wrong; `app_config.updated` events fan out.
5. **Heroes ops re-runs sheet ingestion for points data** via `POST /api/aliases/resolve-batch`.

T+~25min — `bun run cutover:verify` gates Deploy C:
- `count(heroes_profiles) == count(identity_users where status='active')`
- `taxonomy_cache` row counts match portal `org_taxonomies` per taxonomy
- All `pending_alias_resolution` rows trace to step 5 ingestion (not orphaned cutover events)
- Spot-check 5 random `heroes_profiles` rows: employment block matches portal
- Heroes SA forced `INSERT INTO identity_users` → permission denied (staging precheck)

T+30min — Deploy C: portal REVOKEs INSERT/UPDATE/DELETE on portal-owned tables from Heroes' DB role.

App #2/#3 onboarding adopts the same shape with no cutover ceremony: register manifest, grant SA access, app pulls taxonomies on first boot, materializes via webhook backfill.

## Pending-alias resolution retry policy

`pending_alias_resolution` rows drain via three triggers:

1. **`alias.resolved` webhook** — primary. Handler looks up pending rows by `raw_name_normalized`, re-runs ingestion, marks rows resolved.
2. **`alias.updated` webhook** — handler invalidates `alias_cache` AND walks pending queue for matching `raw_name_normalized` (covers identity-merge case where a previously unresolvable name now binds to a merged identity).
3. **`POST /admin/pending-aliases/sweep`** — ops-triggered manual re-resolve of all `pending` rows. Used when DLQ exhaustion or operational drift is suspected. No scheduled cron.

Mid-handler crashes recover via the existing webhook DLQ retry + idempotency on `eventId`.

## Webhook handler structure

Single wire endpoint `POST /webhooks/portal` (matches today's shape; portal posts every event type there with `X-Portal-Event` header). Route file owns OIDC verification, idempotency dedupe via `portal_webhook_events`, body parse, and dispatch only — ~80 lines. Per-event logic lives in `packages/server/src/services/portal-events/handle-<event-name>.ts`, each module 25-70 lines with focused tests. Adding a new event = one new handler module + one dispatch case, no route layer changes.
