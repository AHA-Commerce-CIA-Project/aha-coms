# TODOS

## Comprehensive API Test Suite
**What:** Add tests for all 17 existing route files (users, teams, points, rewards, redemptions, etc.)
**Why:** Zero test coverage on all existing endpoints. Testing debt that grows with each feature.
**Pros:** Catch regressions, enable confident refactoring, CI gates bad code.
**Cons:** Large effort if done manually (~1 week human, ~45min CC).
**Context:** Once `bun test` is set up as part of the infra deployment plan, extending to existing endpoints follows the same patterns. Start with the most critical routes (auth, points, uploads) and expand outward.
**Depends on:** Infra deployment plan completing (sets up bun test framework + CI test step).

## Terraform CI Validation
**What:** Add `tofu validate` + `tofu plan` job to ci.yml for PRs touching `infra/`.
**Why:** Catches syntax errors and resource conflicts before merge. Currently only caught on `tofu apply`.
**Pros:** Prevents broken Terraform from merging. Fast feedback loop.
**Cons:** Requires GCP auth in PR context (read-only WIF or separate SA). Adds CI complexity.
**Context:** The WIF module being added supports attribute conditions — could allow `tofu plan` from PRs with a read-only SA. Implement after WIF is stable.
**Depends on:** WIF module (Step 1 of infra plan).

## Portal-side: re-enable disabled webhook endpoints
**What:** Add a portal admin route (or auto-reactivation hook) to flip `app_webhook_endpoints.status` from `disabled` back to `active` after a Heroes outage drains Cloud Tasks retries. Today this requires direct SQL.
**Why:** When Cloud Tasks exhausts max_attempts=3 against a Heroes outage, portal's DLQ handler (`apps/api/src/routes/internal.ts:144-182`) flips the endpoint to `disabled`. From that moment, every subsequent portal event silently no-ops because `dispatchPortalWebhook` filters `WHERE status='active'`. Recovery on 2026-05-05 required cloud-sql-proxy + direct UPDATE.
**Pros:** Faster recovery from Heroes-side outages. Operations can self-serve without DB credentials.
**Cons:** Adds a sensitive admin surface (re-enabling an endpoint that's been down for ages may flood Heroes with backlogged events — though Cloud Tasks retries are already exhausted at DLQ time, so there is no backlog; only future events flow).
**Context:** Lives in coms_portal repo. Possible shapes: (a) `POST /api/admin/apps/:id/webhook-endpoints/:endpointId/reactivate`, (b) auto-reactivation on next successful manual ping via the existing `/test-send` route, (c) scheduled job that probes disabled endpoints periodically. Surfaced after the post-Deploy A burn-in incident on 2026-05-05.
**Depends on:** None — independent of cutover.
