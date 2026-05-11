# Rev 3 — Spec 08: Heroes Spec 03 Cutover Protocol

> Status: **Drafted 2026-05-04 from /grill-with-docs session.** Not yet approved.
> Priority: **Critical-path. Must land before Heroes takes real users.**
> Scope: Heroes (`/Users/mac/HT/Project/coms_aha_heroes`). One-time migration plan; this spec is single-use.
> Prerequisites: Spec 03 portal-side shipped (already on `main`); Spec 07 portal-side shipped (`@coms-portal/shared` v1.6.0 published). Spec 06 cleared the email model.
> Companion docs: [`coms_aha_heroes/CONTEXT.md`](../../../../coms_aha_heroes/CONTEXT.md), [`coms_aha_heroes/docs/adr/0001-portal-owned-org-taxonomies.md`](../../../../coms_aha_heroes/docs/adr/0001-portal-owned-org-taxonomies.md), [Spec 03](./spec-03-user-identity-alias-layer.md), [Spec 07](./spec-07-org-taxonomies-and-employment-block.md).

---

## Why this spec exists

Spec 03's §Appendix A sketched the Heroes-side cutover at the right level for spec drafting but missed several real-codebase facts that surfaced during a /grill-with-docs walkthrough on 2026-05-04:

1. **Heroes' `users` table has 18 columns**, not the 5 the spec implied. HR-shaped fields (branch/team/department/position/phone/employmentStatus/talentaId/attendanceName) need a flow, not silence. → Spec 07 introduces the employment block + taxonomies.
2. **Heroes has a parallel `authUser` table** from better-auth that the spec missed entirely. → §Auth consolidation below.
3. **11 schemas FK-reference `users`** — every one needs FK retargeting on rename.
4. **Email handling under Spec 06's multi-row identity_user_emails** is undefined for H-apps. → Spec 07 introduces `contactEmail`.
5. **Phasing has a contract-dependency inversion** — Heroes Phase 1 (consume new payload) cannot precede portal Phase 2 (emit it). → Phasing flipped here.

This spec captures the engineering plan that resolves all five. It is Heroes-specific; the generalisable mechanism lives in Spec 07.

---

## Decisions Up Front (recap from grill session)

All locked during /grill-with-docs on 2026-05-04. Each decision links its rationale.

| # | Decision | Rationale |
|---|---|---|
| 1 | HR fields flow as portal-owned `employment` block on identity webhooks (not per-app config) | Spec 07 §Decisions |
| 2 | Portal contract ships first; Heroes pins `@coms-portal/shared` v1.6.0; portal dual-emits during gap | Spec 07 §Decisions |
| 3 | `heroes_profiles.id` IS `portal_sub` (portal supplies UUID; no `defaultRandom`) | Saves a column + index; collapses post-cutover |
| 4 | Email NOT stored on `heroes_profiles`; `email_cache` + `contactEmail` on webhook payload | Avoids workspace-vs-personal-vs-both ambiguity for personal-only employees |
| 5 | Branches + teams projected via Spec 07's taxonomy mechanism; local `branches` + `teams` tables dropped; `(key, value_snapshot)` denormalised on `heroes_profiles` | ADR 0001 |
| 6 | Single wire endpoint `POST /webhooks/portal`; per-event handler modules under `services/portal-events/` | ~80-line route + 25-70 line handlers each |
| 7 | Pending-alias retry: webhook-driven + identity-merge walks pending queue + ops sweep endpoint; no scheduled cron | Spec 03 §Phase 1 step 8 augmented |
| 8 | Cutover order: Heroes truncates → restarts → pulls taxonomies on boot → portal provisions → portal sets per-app config → Heroes ops re-runs sheet ingestion | Same shape future H-apps adopt for onboarding (no cutover ceremony per app) |
| 9 | All 11 dependent tables wiped at cutover (audit, comments, points, rank, etc.); pre-real-users posture | No compliance retention requirement |
| 10 | Better-auth `authUser` collapsed into `heroes_profiles`; better-auth retargeted; broker exchange upserts | Single Heroes-side identity row; eliminates three-store drift |

---

## Auth consolidation (Decision #10 detail)

Pre-cutover Heroes has three identity-shaped stores: portal `identity_users` (source of truth), `users` (HR projection), and `authUser` (better-auth scaffold written by broker exchange at `packages/web/src/routes/auth/portal/exchange/+server.ts`).

This cutover collapses `authUser` into `heroes_profiles`:

- Drop `authUser` table.
- Better-auth `user` reference retargets to `heroes_profiles` (better-auth supports custom user tables; pass the new reference in `betterAuth({ database: { tables: { user: heroesProfiles }}})` or equivalent — confirm exact API at implementation time).
- `authSession.userId` FK retargets to `heroes_profiles.id` (= `portal_sub`).
- `authAccount` and `authVerification` stay (better-auth library internals; not identity-shaped).
- Broker exchange handler **upserts** `heroes_profiles` on every login from the portal handoff payload (portal_sub, contactEmail, name). Treated as a portal-authenticated write path — handoff token is signed by portal, so it's a valid identity source even though it's not the webhook.
- Webhook handlers fill employment + appConfig blocks; broker fills identity-only fields. Last-write-wins on overlapping fields. Portal is authoritative on every field, so order doesn't matter.

---

## Phasing (overrides Spec 03 §Appendix A)

| Phase | Owner | Scope |
|---|---|---|
| **1+2 (parallel)** | Portal (Spec 07) | Single coordinated release: `org_taxonomies` + employment block + per-app config + `contactEmail` + new webhook events. `@coms-portal/shared` v1.6.0 published. Portal dual-emits legacy + new envelope shapes during gap. |
| **3 (Heroes Deploy A)** | Heroes | Two PRs (PR A1 schema + PR A2 behaviour, see §PR breakdown). |
| **3.5** | Portal | Drop legacy webhook payload fields once Heroes Deploy A confirms it's reading the new envelope (Spec 07 PR 07-5). |
| **4 (cutover)** | Both | <30min coordinated window per §Cutover sequence. |
| **5 (Deploy C portal)** | Portal | Apply staged migration `apps/api/src/db/migrations/cutover/0001_revoke_heroes_writes.sql`. |
| **6 (cleanup)** | Heroes | Remove legacy user-create code, role/eligibility flag, CI guard for `INSERT INTO users` patterns. |

---

## PR breakdown for Heroes Deploy A

Two PRs, both shipped before cutover. Single Drizzle migration via `drizzle-kit generate` (per project standing rule: never hand-edit the journal).

### PR A1 — Schema migration (mechanical, ~one-frigate-day)

- Pin `@coms-portal/shared` v1.6.0 in `packages/web/package.json` and `packages/shared/package.json`.
- Single Drizzle migration:
  - Rename `users` → `heroes_profiles`. Change `id` from `uuid().defaultRandom()` → `uuid()` (no default; portal supplies). Drop columns: `email`, `personal_email`, `branchId`, `teamId`, `role`, `canSubmitPoints`. Add columns: `branch_key varchar(128)`, `branch_value_snapshot varchar(255)`, `team_key varchar(128)`, `team_value_snapshot varchar(255)`, `department_key varchar(128)`, `department_value_snapshot varchar(255)`.
  - Rewire 11 dependent schemas' FKs from `users` → `heroes_profiles`: `comments`, `point-summaries`, `sheet-sync-jobs`, `challenges`, `redemptions`, `appeals`, `notifications`, `audit-logs`, `achievement-points`, `system-settings`, `user_emails` (drop entirely — replaced by `email_cache`).
  - Add 6 new tables: `pending_alias_resolution`, `alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `deactivated_user_ingest_audit`.
  - Drop `branches` and `teams` local tables.
  - Drop `authUser` table; retarget better-auth to `heroes_profiles`. `authSession.userId` FK → `heroes_profiles.id`.

### PR A2 — Behaviour (~one frigate-week)

- Refactor `routes/portal-webhooks.ts` into ~80-line route (HTTP + OIDC + idempotency + dispatch) + 10 handler modules under `services/portal-events/`:
  - `handle-user-provisioned.ts` — materialises `heroes_profiles` from `user` + `employment` + `appConfig`; upserts `email_cache`, `user_config_cache`.
  - `handle-user-updated.ts` — identity-field updates (email/name).
  - `handle-employment-updated.ts` — denormalises `(key, value_snapshot)` onto `heroes_profiles`.
  - `handle-user-offboarded.ts` — flips `is_active`; soft-delete only.
  - `handle-app-config-updated.ts` — updates `user_config_cache`; toggles leaderboard suppression.
  - `handle-alias-resolved.ts` — drains `pending_alias_resolution`.
  - `handle-alias-updated.ts` — invalidates `alias_cache` AND walks pending queue (covers identity-merge case).
  - `handle-alias-deleted.ts` — invalidates `alias_cache`.
  - `handle-taxonomy-upserted.ts` — upserts `taxonomy_cache`; refreshes denormalised snapshots on affected `heroes_profiles` rows (lazy: only when next event arrives).
  - `handle-taxonomy-deleted.ts` — removes from `taxonomy_cache`.
- Pull-on-boot: hook into Heroes server startup, call `GET /api/taxonomies/sync`, populate `taxonomy_cache`.
- Rewrite broker exchange (`packages/web/src/routes/auth/portal/exchange/+server.ts`) to upsert `heroes_profiles` from handoff payload.
- Rewrite `services/sheet-sync.ts` (945 lines) ingestion path:
  - Per sheet upload: collect normalised names, batch-call `POST /api/aliases/resolve-batch`, fan out by outcome.
  - Resolved + not tombstoned → write points to `heroes_profiles`-keyed domain rows.
  - Resolved + tombstoned → `deactivated_user_ingest_audit`.
  - Unresolved → `pending_alias_resolution`.
- Add `bun run cutover:verify` script (5 checks per §Cutover sequence).
- Add `POST /admin/pending-aliases/sweep` endpoint.
- Delete legacy user-create code paths identified in Phase 0 audit (`INSERT INTO users` greps).
- Add CI guard: static check fails build if `INSERT INTO users` (or `INSERT INTO heroes_profiles` outside `services/portal-events/handle-user-provisioned.ts`) appears anywhere.

---

## Cutover sequence (<30min window)

### Pre-cutover (T-1h, portal-side, no emit)

- `org_taxonomies` populated with current branches + teams + departments (verified manually).
- Heroes manifest registered with portal at v2 (with `taxonomies` array).
- Heroes' service-account WIF binding for `GET /api/taxonomies/sync` verified.

### T-0

1. **Heroes truncates** all domain tables AND the new caches:
   - Domain: `heroes_profiles`, points, rank, leaderboard, comments, appeals, notifications, redemptions, audit_logs, point_summaries, achievement_points, system_settings.
   - Caches: `alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `pending_alias_resolution`, `deactivated_user_ingest_audit`.
   - Drop `branches` + `teams` (already dropped in PR A1, but verify empty).
2. **Heroes restarts.** On boot, calls `GET /api/taxonomies/sync`; populates `taxonomy_cache`. (Same shape any future H-app uses to onboard.)
3. **Portal admin runs CSV/Sheet/manual provisioning.** Each `user.provisioned` event carries `employment` (referencing cached taxonomy keys), `appConfig` (manifest defaults), `contactEmail`. Heroes materialises empty `heroes_profiles` rows.
4. **Portal admin sets per-app config** where manifest defaults are wrong; `app_config.updated` events fan out.
5. **Heroes ops re-runs sheet ingestion for points data** via `POST /api/aliases/resolve-batch`.

### T+~25min — `bun run cutover:verify` gates Deploy C

5 checks, all must pass:

1. `count(heroes_profiles) == count(identity_users where status='active')` (queried via portal admin API).
2. `taxonomy_cache` row counts match portal `org_taxonomies` per `taxonomy_id` (via `GET /api/taxonomies/sync`).
3. All `pending_alias_resolution` rows trace to step 5 ingestion (timestamp filter — none from the cutover window before step 5 started).
4. Spot-check 5 random `heroes_profiles` rows: employment block matches portal (admin API lookup).
5. Heroes service account forced `INSERT INTO identity_users` from staging — must fail with `permission denied` (precheck before Deploy C makes this binding).

### T+30min — Deploy C

Portal applies `apps/api/src/db/migrations/cutover/0001_revoke_heroes_writes.sql`. REVOKE INSERT/UPDATE/DELETE on portal-owned tables (`identity_users`, `user_aliases`, `app_user_config`, `app_manifests`, `org_taxonomies`) from Heroes' DB role.

---

## Rollback

If verify-script fails or Deploy C errors:

1. **Pre-Deploy-C failure:** Heroes' new code is on; portal still emits dual shape. Roll Heroes back to the previous deploy (which still reads the legacy payload). Investigate root cause; reschedule cutover. Portal stays on dual-emit until next attempt.

2. **Post-Deploy-C failure (REVOKE applied but Heroes broken):** Portal reverts the migration with `apps/api/src/db/migrations/cutover/0002_restore_heroes_writes.sql` (must be staged alongside 0001). Heroes returns to previous deploy. The cutover is non-destructive on portal side until REVOKE; pre-REVOKE rollback is just a redeploy.

Add `0002_restore_heroes_writes.sql` to PR 07-1 (portal side).

---

## Out of Scope

- Org-scoped configuration (Heroes' `system_settings`, leaderboard caps per branch). Stays Heroes-side. Future spec if app #2 proves the duplication cost.
- Audit-history retention across cutover. Pre-real-users posture; full wipe.
- Compliance gating (REVOKE timing relative to compliance review). Single-tenant today; revisit at multi-tenant.

---

## Success Criteria

1. Heroes runs against `heroes_profiles` (renamed from `users`) with `id == portal_sub`; all 11 dependent FKs retargeted.
2. `authUser` table dropped; better-auth runs against `heroes_profiles`.
3. Webhook handler split into `routes/portal-webhooks.ts` + 10 handler modules.
4. `services/sheet-sync.ts` resolves names via `POST /api/aliases/resolve-batch`; never inserts into identity tables.
5. Three caches (`alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`) operational with TTL + push + pull-on-miss.
6. Cutover verify script passes all 5 checks.
7. Deploy C REVOKE applied; staging precheck confirms Heroes SA cannot write portal-owned tables.
8. CI guard fails any future PR that introduces `INSERT INTO users`-shaped writes outside the webhook handler.
