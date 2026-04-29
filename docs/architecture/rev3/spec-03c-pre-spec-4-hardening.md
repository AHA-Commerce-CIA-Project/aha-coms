# Rev 3 — Spec 03c: Pre-Spec-4 Hardening

> **Status (2026-04-29):** Queued. Estimated ~3 days portal-side. Blocks Spec 4 / Spec 5 critical-path debugging; does not block Heroes Rev 3 adoption.
> **Original priority:** **High — closes verified gaps in shipped Rev 3 (Specs 01–03) before Spec 4/5 begins, while Heroes has not yet integrated and the contract surface is still mutable at zero cost.**
> Scope: Portal `apps/api` + `apps/web`, plus a new sibling repo for `@coms-portal/sdk`. No Heroes-side work in this spec; Heroes consumes the SDK in a follow-up.
> Prerequisites: Specs 01 + 02 (Phases 1–3) + 03 + 03b shipped portal-side.

---

## Why now

Three load-bearing facts:

1. **Heroes hasn't adopted Rev 3 yet.** Zero external consumers of the broker token shape, the webhook envelope, the launcher data flow, or the integrator-facing endpoints. Every contract change today is free; every contract change after Heroes goes live is 5–10× more expensive (coordination, dual-mode shims, version bumps).
2. **Spec 4/5 will need observability to debug.** Federated `/api/search` (Spec 5) fans out across providers with a 500ms timeout per provider; without request-ID propagation and structured logs, debugging "which provider was skipped and why" is impractical. Spec 4's preference-write path needs the same.
3. **The launcher data-source mismatch creates onboarding-by-shared-package-bump.** `/api/userinfo` already returns `apps: [{slug, label, url}]` from `app_registry`. The chrome ignores it and reads the static `APP_LAUNCHER` constant from `@coms-portal/shared` (`apps/web/src/routes/(authed)/+layout.svelte:59–69`), silently filtering apps that aren't in the constant. Adding tenant #3 today requires a `@coms-portal/shared` minor bump + portal redeploy. That doesn't scale and shouldn't be the integration path future tenants discover.

The verification pass that produced this spec also surfaced four other items now documented as known limitations in Spec 03 (webhook DLQ doc/code drift, plaintext webhook secrets, single global signing key, partial `compliance_status` enforcement). Of those, only the DLQ doc drift and the audit log column gap are in scope for 03c — the rest are explicitly deferred.

---

## Scope (in)

### 1. Launcher migration

**Replace** `APP_LAUNCHER` consumption in `apps/web/src/routes/(authed)/+layout.svelte:59–69` with a server-side fetch of `/api/userinfo` (during `+layout.server.ts` SSR load) and a derived store for the chrome to consume.

**Deprecate** the `APP_LAUNCHER` export in `@coms-portal/shared`:
- Keep the export for one minor version with a `console.warn` deprecation notice on first access.
- Remove in the next minor (target: v1.5.0).
- Document the deprecation in the `coms-shared` repo CHANGELOG.

**Acceptance test:** Add app #3 to `app_registry` via the admin UI at `/admin/apps`, log in as a user who has access to that app, confirm it appears in the chrome's launcher and the account widget popover *without* redeploying the portal or bumping `@coms-portal/shared`.

### 2. Observability foundation

**Structured logging.** Add `pino` to `apps/api`. Replace the 32 `console.log/error` call sites in `apps/api/src/` (notably `apps/api/src/index.ts:47` in `.onError`, plus all `console` calls in services and routes) with `logger.info/warn/error` writing structured JSON to stdout. Cloud Logging auto-ingests structured JSON from Cloud Run stdout — no GCP-side configuration change required, no new infra cost. Web app (`apps/web`) gets the same treatment for its single `console.error` call in `apps/web/src/hooks.server.ts:53` plus any others surfaced during implementation.

**Request-ID middleware.** Generate a UUID per inbound request at the Elysia app root in `apps/api/src/index.ts`. Attach to:
- The Elysia request context (so route handlers can read it).
- The response header (`X-Coms-Request-Id`) so callers can correlate.
- Every log line from that request (Pino child logger with `requestId` bound).
- Every webhook delivery dispatched during that request (propagated via the same `X-Coms-Request-Id` header on the outbound HTTPS POST).
- Every audit-log write originating from that request (new column, see below).

**Audit log column additions.** Add `actor_ip` (varchar, nullable) and `request_id` (uuid, nullable) to `access_audit_log`. Generate via `drizzle-kit generate` (per the project's standing rule — never hand-write Drizzle migrations or journal entries). Wire the new columns into every `writeAccessAuditLog` (or equivalent) call site so they're populated from the request context. Existing rows stay null; future rows always populated.

**Real `/api/health`.** Replace the static `{ status: 'ok' }` at `apps/api/src/index.ts:56` with a probe that:
- Pings the database (`SELECT 1`) with a 500ms timeout.
- Verifies Secret Manager access (read the active broker signing key version, no decode).
- Verifies Cloud Tasks reachability (queue metadata read).
- Returns `{ status: 'ok' | 'degraded', checks: { db, secretManager, cloudTasks } }` with HTTP 200 when all pass and 503 when any fail.

The existing `health-probe` service (`apps/api/src/services/health-probe.ts`) probes *registered apps*, not the portal — that's a separate concern and is left unchanged.

**Acceptance test:** Trigger an error in `POST /api/aliases/resolve-batch` (e.g. with a malformed body); confirm Cloud Logging shows a structured JSON line with the `requestId`; confirm the `X-Coms-Request-Id` response header carries the same UUID; confirm any webhook delivery the request triggered carries the same UUID in its outbound `X-Coms-Request-Id` header; confirm the resulting `access_audit_log` row has the `request_id` column populated. Hit `/api/health` with the DB intentionally paused (proxy unavailable) and confirm a 503 with the failing check named.

### 3. Webhook dispatcher doc/code drift

**Decision: remove the reference, do not build the standalone route.** The DLQ logic is small enough to live inline in `/api/internal/webhook-delivery` at `apps/api/src/routes/internal.ts:144–182`; the abstraction implied by `apps/api/src/services/webhook-dispatcher.ts:12` ("the dead-letter Pub/Sub topic fires and `/api/internal/webhook-dlq` disables the endpoint") was aspirational and never built. Update the comment in `webhook-dispatcher.ts:12` to describe what actually happens: "When Cloud Tasks exhausts max attempts, the final-attempt branch in `/api/internal/webhook-delivery` (`internal.ts:144–182`) sets the endpoint to `disabled`. There is no separate DLQ route; the disabled state is the dead-letter signal."

If a future tenant requires durable DLQ semantics (replay queue, ops dashboard), revisit; until then the inline approach is correct.

**Acceptance test:** `grep -r "webhook-dlq" apps/api/src/` returns zero hits.

### 4. `@coms-portal/sdk` extraction

**New external repo:** `github.com/mrdoorba/coms-sdk`, semver-tagged, framework-neutral (no Svelte / React / Vue dependencies; runs in Node.js 20+ and any modern browser bundler).

**Exports:**
- `verifyBrokerToken(token, options)` — verifies an ES256 broker token via JWKS (fetches from `${portalOrigin}/.well-known/jwks.json` with cache-control respect) or HS256 via per-app shared secret; returns the decoded payload or throws a typed `BrokerTokenError` with a discriminated `code` field.
- `verifyWebhookSignature(payload, signature, secret, timestamp)` — HMAC-SHA256 verification matching the dispatcher's signing scheme (`sha256=hex(HMAC-SHA256(secret, timestamp + '.' + jsonBody))`); returns `true`/`false`, with a constant-time comparison.
- `resolveAlias(client, names)` — thin client over `POST /api/aliases/resolve-batch` with the rate-limit headers exposed for caller backoff logic.
- `introspectSession(client, token)` — thin client over `POST /api/auth/broker/introspect`.

**Out of `@coms-portal/sdk`:**
- Svelte components (those live in `@coms-portal/account-widget` / `@coms-portal/ui`).
- Heroes-specific helpers (those live in Heroes).
- `@coms-portal/shared`'s `APP_LAUNCHER` constant (deprecated, see item 1).

**Distribution:** `git+https://github.com/mrdoorba/coms-sdk.git#vX.Y.Z` per the project's standing rule for `@coms-portal/*` packages. Initial version `v0.1.0`.

**Acceptance test:** A "hello world" integrator app — separate from this repo — verifies a broker token end-to-end using only the published `@coms-portal/sdk` + the integrator quickstart doc (item 5), with no portal source-code reading required. Target time-to-running: 30 minutes for a developer who has never seen this codebase.

### 5. Generic integrator quickstart

**New doc:** `docs/architecture/integrator-quickstart.md` (deliberately not nested under `rev3/` — it's a living integrator contract that outlives any single Rev). Sections:
- **Register an app.** How to use the admin UI at `/admin/apps` (or the API at `POST /api/v1/apps`) to register a new tenant; required fields and what they mean.
- **Exchange a broker token.** The two handoff modes (`one_time_code`, `token_exchange`), the `one_time_code` flow end-to-end, code samples using `@coms-portal/sdk`.
- **Verify a webhook.** Envelope shape (with `eventId` documented as the idempotency handle), signature verification using `@coms-portal/sdk`, retry semantics, the `disabled`-on-max-retries behavior.
- **Look up an alias.** The `POST /api/aliases/resolve-batch` contract, rate-limit headers, the `pending_alias_resolution` queue model, the alias webhooks consumers must subscribe to.
- **What this doc is NOT.** Heroes-specific details — those stay in `heroes-integration-handoff.md`. Migration runbooks — those belong in their own docs.

This doc is the **canonical** integrator path. The Heroes handoff doc (`heroes-integration-handoff.md`) becomes a Heroes-specific supplement to this; it is not deprecated, but new tenants discover the quickstart first.

**Acceptance test:** Same as item 4 — a fresh developer can ship a working integration in 30 minutes using only this doc + the SDK.

---

## Scope (out)

Explicitly deferred to post-Spec-5 (or to Rev 4 / a dedicated security spec):

- **Redis-backed rate limiter.** `apps/api/src/routes/aliases.ts:11–27` is in-memory; multi-instance Cloud Run multiplies the budget by N. Acceptable today (low traffic, low instance count). Memorystore Redis Basic 1GB ≈ $35/mo when adopted.
- **Staging environment + canary + preview deploys + feature flags.** Every push to `main` deploys to prod (`.github/workflows/deploy.yml:15–19`). Acceptable for an internal portal at current scale; revisit when blast radius justifies the ~$15–50/mo Cloud SQL spend for a second environment.
- **Per-tenant signing key derivation.** Deferred until tenant #3 (external) requires cryptographic trust isolation.
- **Webhook secret encryption (KMS envelope).** Deferred until plaintext storage becomes a compliance question.
- **`compliance_status` enforcement at token issuance.** Deferred until compliance gating is required.
- **Session-expiry UX.** No proactive refresh, no warning, no graceful re-auth (`apps/web/src/hooks.server.ts:15–48` redirects hard to `/login` on any error/timeout). Deferred — annoying but not blocking.
- **Refresh flow on broker tokens.** Tokens are 5-min hardcoded TTL (`apps/api/src/services/auth-broker.ts:52–53`); no `refresh_token` grant. Add when an integrator needs longer-lived sessions without re-handoff.
- **Rate-limit extension.** Today only `POST /api/aliases/resolve-batch` is rate-limited. `/v1/employees`, `/v1/apps`, `/access` get rate limits when traffic justifies it.
- **Audit log Cloud Logging sink + retention policy + failure events.** The `actor_ip` + `request_id` columns added in this spec close the most painful correlation gap; the sink and retention stay deferred until a compliance review forces them.

---

## Cost

**Engineering:** ~3 days portal-side, single engineer. Items 1–3 fit comfortably in one PR (~2 days); item 4 (SDK extraction) runs in parallel as a sibling repo (~1 day); item 5 (quickstart doc) lands last after the SDK is real (~½ day).

**Infra:** **$0 incremental.** Cloud Logging already collects unstructured stdout (you're paying for it now); structured JSON costs the same and lands in the free tier (50 GiB/project/month) for portal-scale traffic. Cloud Trace and Error Reporting are GCP-native and free at portal scale (Cloud Trace: 2.5M spans/month free; Error Reporting: free for log-based grouping). The SDK is a code/repo deliverable, not infra. No new database, no new queues, no new services.

First infra spend kicks in only when staging or Redis are picked up — both deferred above.

---

## Sequencing

Items 1–3 land in any order in a single PR. Item 4 (SDK) runs in parallel as a separate repo and PR. Item 5 (quickstart) lands last, after item 4 is real.

Recommended:
- **Day 1 morning:** Audit log schema migration (`drizzle-kit generate`). Request-ID middleware. Pino integration.
- **Day 1 afternoon:** Launcher migration to `/api/userinfo`. Real `/api/health`. Webhook-dispatcher comment fix.
- **Day 2:** SDK extraction — scaffold the `coms-sdk` repo, port the verification logic from `auth-broker.ts` and `webhook-dispatcher.ts`, publish v0.1.0.
- **Day 3 morning:** Integrator quickstart doc.
- **Day 3 afternoon:** End-to-end acceptance test (fresh integrator scaffolds against the SDK + quickstart in a sandbox).

Heroes can adopt the SDK in a follow-up at any point after v0.1.0 ships; that adoption is not part of this spec.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Pino integration accidentally drops a log line during migration. | Migrate one file at a time, run tests after each, ship as one PR per migration milestone if needed. The existing `console` calls already include structured-ish JSON in some places (`apps/api/src/routes/internal.ts:31`); standardize on the Pino API rather than rewriting log content. |
| Request-ID middleware breaks existing tests that assume no header. | Tests assert on response body, not on request-context shape. New `X-Coms-Request-Id` response header is additive. |
| Drizzle migration for `actor_ip` + `request_id` lands but a `writeAccessAuditLog` call site is missed. | Add a TypeScript constructor that requires both columns at the type level (no defaults); the type checker fails the build at any unfixed call site. |
| `/api/userinfo` SSR fetch adds latency to every authed page load. | The endpoint reads from the DB (`app_registry` join); stick the result on `event.locals` once per request and reuse across SSR loaders. Measure p50 latency before/after; if regression > 20ms, cache the response in a derived store keyed on session ID. |
| `APP_LAUNCHER` deprecation break Heroes when they consume the next `@coms-portal/shared` minor. | Heroes pins to a minor; the deprecation is in v1.4.x with a `console.warn` only, removal in v1.5.0. Heroes doesn't break unless they explicitly upgrade across the major; coordinate with the Heroes team before v1.5 ships. |
| SDK signature verification disagrees with the portal's signing scheme. | Port the verification logic by *moving* the existing `computeSignature` (`webhook-dispatcher.ts:138`) and broker-token-verify code into the SDK, then re-import from the SDK on the portal side. Single source, no possibility of drift. |
| Integrator quickstart drifts from reality. | The doc is exercised by the acceptance test (a fresh sandbox integrator scaffolds against it) — drift breaks the test, not just the docs. Run the sandbox scaffold in CI as a smoke test once it's stable. |

---

## Verification (full)

After all five items land:

1. **Launcher.** Add app #3 to `app_registry` via `/admin/apps`. Confirm it appears in the chrome and account widget without a portal redeploy and without bumping `@coms-portal/shared`.
2. **Observability.** Trigger an error in `/api/aliases/resolve-batch`. Confirm: (a) Cloud Logging structured JSON entry with `requestId` field, (b) `X-Coms-Request-Id` response header matches that ID, (c) any webhook the request kicked off carries the same ID in its outbound header, (d) the `access_audit_log` row from that request has `request_id` populated.
3. **Health.** Stop the Cloud SQL Auth Proxy locally; hit `/api/health`; receive 503 with `checks.db = 'failed'`.
4. **Doc drift.** `grep -r "webhook-dlq" apps/api/src/` returns zero hits.
5. **SDK.** A fresh repo `coms-sdk-smoke-test` with `bun add git+https://github.com/mrdoorba/coms-sdk.git#v0.1.0` plus a 30-line script verifies a real broker token (issued by a local portal) and a real webhook signature (signed by a local portal). No portal source-code reading allowed during the test.
6. **Quickstart.** A developer who has never seen this codebase reads `docs/architecture/integrator-quickstart.md`, runs the SDK against a local portal, and ships a working "hello world" integrator in ≤30 minutes.

---

## Out of Scope (Confirmed)

- Heroes' adoption of the SDK. Tracked separately as a Heroes-side follow-up; not part of this spec.
- Any change to the broker token shape, the webhook envelope shape, or the alias resolve contract. The SDK ports the existing verification logic; it does not redefine the contracts.
- Any change to the admin UI at `/admin/apps`. App registration via the existing form is sufficient for the verification tests.
- Any new external dependency beyond `pino` and `pino-pretty` (dev). No OpenTelemetry SDK in this spec — Cloud Logging structured JSON ingestion covers the observability gap; OTel + Cloud Trace are deferred to whenever distributed tracing is genuinely required (currently a single Cloud Run service; nothing to trace across).

---

## Success Criteria

Spec 03c is done when:

1. Adding a row to `app_registry` makes that app visible in the chrome launcher and account widget without bumping `@coms-portal/shared` or redeploying the portal.
2. Every API request has a `X-Coms-Request-Id` response header; that ID appears on every log line from the request, every webhook dispatched during the request, and the `access_audit_log` row written by the request.
3. `/api/health` returns 503 when the DB, Secret Manager, or Cloud Tasks dependency is unhealthy.
4. The webhook dispatcher source no longer references a non-existent `/api/internal/webhook-dlq` route.
5. `@coms-portal/sdk` v0.1.0 is published at `github.com/mrdoorba/coms-sdk` with `verifyBrokerToken`, `verifyWebhookSignature`, `resolveAlias`, and `introspectSession` exports.
6. `docs/architecture/integrator-quickstart.md` exists, is exercised by an end-to-end acceptance test, and a fresh developer can ship a working integration in ≤30 minutes using only the doc + the SDK.
