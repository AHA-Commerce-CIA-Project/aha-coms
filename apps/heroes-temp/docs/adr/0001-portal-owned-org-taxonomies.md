# ADR 0001 — Portal owns org taxonomies; H-apps consume via projection

Date: 2026-05-04
Status: Accepted

## Context

Spec 03 (`coms_portal/docs/architecture/rev3/spec-03-user-identity-alias-layer.md`) makes portal the sole writer of identity (`identity_users`) and per-app config (`app_user_config`). It does not address enumerable HR taxonomies — branches, teams, departments, cost-centers — that show up on every H-app's projection (today on Heroes' `users.branchId` / `users.teamId`).

When grilling the Heroes-side cutover plan, two options surfaced for the branch/team fields:

- **Per-app, app-owns-the-table** — Heroes keeps its `branches` and `teams` tables; portal sends free strings on the employment webhook; Heroes looks them up. Today's behaviour, with a silent "branch not found, fall back to default" failure path. App #2 and app #3 each rebuild the same `branches`/`teams` projection from scratch.
- **Portal-owned, H-app-projects** — portal absorbs the taxonomies into a generic `org_taxonomies (taxonomy_id, key, value, metadata)` table; emits `taxonomy.upserted` / `taxonomy.deleted` webhooks; each H-app projects locally into `taxonomy_cache`. Adopting a new H-app is "subscribe + project," with no portal schema migration per app.

The trigger for the question was the second option's portal-side scope cost (~2-3 days extra) versus the per-app duplication cost (every new H-app reinvents branches/teams).

## Decision

Portal owns enumerable HR taxonomies. H-apps project them locally via a uniform `taxonomy.upserted` / `taxonomy.deleted` webhook + `taxonomy_cache` table.

The employment block on `user.provisioned` / `employment.updated` references taxonomies by `(taxonomyId, key)`, with `value` carried as a denormalised display snapshot. H-apps store the denormalised pair on their projection row (`heroes_profiles.branch_key`, `heroes_profiles.branch_value_snapshot`, etc.) plus the full `taxonomy_cache` for cross-row queries.

H-apps do not maintain their own `branches` / `teams` lookup tables. No FKs from H-app projection rows to local taxonomy tables.

## Consequences

**Positive:**

- App #2 / app #3 / future H-apps consume taxonomies through the same mechanism as Heroes — zero per-app schema reinvention.
- Portal validates taxonomy keys before emitting employment events; the silent "fall back to default branch" failure goes away.
- Single source of truth for HR taxonomies. Portal admin renames a branch, every H-app sees the new value on the next event.
- The `value_snapshot` denormalisation keeps leaderboard rendering JOIN-free without sacrificing global rename consistency (re-emission updates snapshots on next event; old snapshots are visible until then, which is correct behaviour for "what branch was this row tagged with at the time of ingestion").

**Negative:**

- Portal scope grows by `org_taxonomies` schema, admin UI, webhook fan-out, registration-time initial sync. Adds a new phase between current Phase 2 (per-app config) and current Phase 1 (Heroes ingestion rewrite).
- Race window between `taxonomy.upserted` and `employment.updated` referencing a new key. Resolved by idempotent re-fire from portal and bounded retry on consumer side; documented invariant: H-app handler that hits a missing taxonomy key reschedules the employment event for retry, does not fail.
- Heroes loses a referential integrity guarantee at the DB layer. Compensated by portal-side validation before emit.

**Out of scope (deferred):**

- Per-tenant taxonomy isolation. Today portal is single-tenant; when external tenants join, taxonomies become tenant-scoped.
- Self-service taxonomy editing by H-apps. Admin-only for now.
