# Spec 07 Phase 1 — end-state verification

**Shipped:** 2026-05-08. Three sub-phases (1A, 1B, 1C) all delivered against the portal prod DB on `coms-aha-heroes-db` instance / `coms_portal`.

## 1A — App Registry row + manifest

| Field                  | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `app_registry.id`      | `5a919ceb-59ae-408e-851e-1c7aba60fe1a`                                 |
| slug                   | `fast`                                                                 |
| name                   | `FAST`                                                                 |
| url                    | `https://aha-fast-app-45tyczfska-et.a.run.app`                         |
| basePath               | `/api`                                                                 |
| transportMode          | `portable_token`                                                       |
| handoffMode            | `one_time_code`                                                        |
| brokerOrigin           | `https://coms-portal-app-45tyczfska-et.a.run.app`                      |
| serviceAccountEmail    | `aha-fast-run-sa@fbi-dev-484410.iam.gserviceaccount.com` (created via gcloud during 1A.1) |
| appRoles               | `[employee, leader, admin]` — three-level escalation, `employee` = default |
| status                 | `active`                                                               |
| `app_manifests.taxonomies` | `["teams"]`                                                        |
| `app_manifests.configSchema` | `{ role: enum(employee,leader,admin) → employee, teamId: string → "" }` |

Diverges from `project_heroes_role_refactor.md` memory (which says future H-apps must NOT put role in configSchema). The user explicitly chose to follow the spec literal — portal stores the canonical role assignment for Fast users via `app_user_config.config.role`, propagated to Fast via `app_config.updated` webhook in Phase 3.

Code artifact: `apps/api/scripts/spec07-register-fast.ts` (idempotent, runnable via `bun run --cwd apps/api spec07:register-fast`).

## 1B — Webhook endpoint

| Field                  | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `app_webhook_endpoints.id` | `ca0886c5-f090-4df0-82cc-4e7c8fb66691`                              |
| url                    | `https://aha-fast-app-45tyczfska-et.a.run.app/api/webhooks/portal`     |
| status                 | `disabled` — paused per spec, flips to `active` in Phase 3D            |
| subscribedEvents       | 8: `user.provisioned`, `user.updated`, `employment.updated`, `user.offboarded`, `app_config.updated`, `alias.updated`, `taxonomy.upserted`, `taxonomy.deleted` |
| HMAC secret            | 64 hex chars, stored inline in DB AND in Secret Manager `aha-fast-webhook-hmac` |

Differs from Heroes which subscribes to 7 events including `session.revoked` but NOT `app_config.updated` or `alias.updated`. Fast subscribes to `app_config.updated` because portal owns Fast's per-user role + teamId; subscribes to `alias.updated` per the spec scope.

## 1C — Provisioning sweep

| Email             | Decision                                  | Outcome                                                |
| ----------------- | ----------------------------------------- | ------------------------------------------------------ |
| `admin@gmail.com` | Auto-provision (kept orphan)              | `identity_users.id = 632966ee-f7c8-4597-ab41-097a979363c3` |
| `tmp@`, `tmp2@`, `tbranding@`, `tpr@` | Deleted in Phase 0       | (no action in Phase 1C)                                |

`emitUserProvisioned(632966ee-...)` ran post-commit. Fast's webhook endpoint is `disabled` so the delivery dropped or DLQ'd as expected. Heroes' active endpoint received it (no Fast-specific data — the event payload is identity-shaped only).

`seedAppUserConfigForUser` populated `app_user_config` rows for both `heroes` AND `fast`:
- `(admin × heroes)` config: `{starting_points: 0, leaderboard_eligible: true}` (Heroes defaults)
- `(admin × fast)` config: `{role: "employee", teamId: ""}` (Fast manifest defaults)

To grant `admin@gmail.com` Fast admin role, the operator updates `app_user_config.config.role = "admin"` via the portal admin UI; the `app_config.updated` webhook (Phase 3D-active) propagates to Fast's `User.role`.

Code artifact: `apps/api/scripts/spec07-provision-fast-orphans.ts` (idempotent).

## Latent issue uncovered during 1C

`apps/api/src/services/employees.ts → insertIdentityEmailsForNewUser` passes `emailNormalized` to the INSERT, but Postgres rejects it (column is GENERATED ALWAYS AS since Spec 06 PR A in `049008d`). All future `createEmployee` calls fail with `cannot insert a non-DEFAULT value into column "email_normalized"`.

The Phase 1C script routes around this by replicating the relevant inserts directly with `seed-admin.ts`'s `Partial` cast trick. **A separate follow-up PR is needed to fix the service path** so future employee onboarding (CSV import, `/admin/employees` UI) works correctly. Out of Spec 07 scope.

## Smoketest expectations after Phase 1

`coms-portal-cli smoketest fast` (run from elsewhere — CLI is in a separate repo) should:
- (1) Registry check: **PASS** — fast app row is `status=active`.
- (2) URL reachable: probably PASS (Cloud Run URL is live).
- (3) Webhook delivery: **FAIL** — endpoint is paused. This is expected pre-Phase-3D and matches the spec's exit criterion.

## Cumulative DB changes since Spec 07 started

| Side       | Change                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Fast prod  | 4 user rows deleted (Phase 0); 12 active users remain.                                            |
| Portal prod | 1 new identity_users row + 1 personal email row + 2 app_user_config rows (heroes/fast) for admin@gmail.com. |
| Portal prod | 1 app_registry row (slug=fast) + 1 app_manifests row + 1 app_webhook_endpoints row (disabled).    |
| GCP        | aha-fast-run-sa@ created with grants on Cloud SQL + Secret Manager + storage. Cloud Run service NOT yet swapped to use it (Phase 3 prereq). |
| Secret Manager | aha-fast-broker-signing-secret + aha-fast-webhook-hmac created.                              |
| GCS        | gs://aha-fast-spec07-baseline/ bucket with pre-cleanup pg_dump.                                  |

## Phase 2 readiness

Phase 2 ships in `mrdoorba/aha-fast`, not this repo. Pre-requisites all met:
- All 12 active Fast users have a known portal `identity_users.id` for `User.portalSub` backfill.
- `app_webhook_endpoints` is in place (paused) so Fast's webhook receiver can be implemented and exercised in Phase 3 against a known portal-side configuration.
- Pre-cleanup Fast DB dump exists for rollback if Phase 2-4 surfaces a problem.
