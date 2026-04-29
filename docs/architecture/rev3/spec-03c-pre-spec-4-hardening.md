# Rev 3 — Spec 03c: Pre-Spec-4 Hardening

> **Status (2026-04-29):** **Shipped portal-side.** All eleven work items landed across eight commits on `main` (`b03fb10`, `41a1d0d`, `93ab759` by HMS Beacon during execution; `24f0ec6`, `8bea99f`, `2a7e608`, `249359c`, `a091968` at stand-down under Door's Lore Protocol). Two sibling public repos shipped alongside: `mrdoorba/coms-sdk` v0.1.1 (initial v0.1.0 + F-3 patch — JWKS cache hoisted to module level), `mrdoorba/coms-shared` v1.4.1 (APP_LAUNCHER deprecation shim; v1.4.0 was already taken by prior missions, used patch bump). Mission artefacts at `.nelson/missions/2026-04-29_024712_fd19ceb1/` and `.nelson/missions/2026-04-29_044152_ff8f84c1/` (gitignored).
> **Original priority:** **High — closes verified gaps in shipped Rev 3 (Specs 01–03) before Spec 4/5 begins, while Heroes has not yet integrated and the contract surface is still mutable at zero cost.**
> **Superapp intent (added 2026-04-29):** This spec is the foundation that makes the portal feel like a "mini-GCP/AWS/Azure" rather than a stitched set of apps — easy onboarding, one stable contract, one observable request flow. Items 6–9 folded in the four zero-cost gaps that were missing for that intent (domain-readiness, SDK semver policy, public OpenAPI, tenant-scoped audit read).
> Scope (shipped): Portal `apps/api` + `apps/web` + new sibling repo `@coms-portal/sdk` (created locally, pushed to GitHub as **public** at `github.com/mrdoorba/coms-sdk`) + `@coms-portal/shared` v1.4.1 deprecation bump. No Heroes-side work in this spec; Heroes consumes the SDK in a follow-up.
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

### 6. Domain-wiring readiness (config-only flip to `coms.ahacommerce.net`)

**Goal:** When the domain is provisioned, going live is a **config change only** — no code edits, no SDK rebuild, no integrator-facing breakage. Today the portal answers on its Cloud Run URL (`coms-portal-xyz-uc.a.run.app` per the project memory note); flipping to `coms.ahacommerce.net` should be a single env-var change in the deploy workflow plus DNS.

**Audit + centralize.** Grep the codebase for hardcoded origin / host references. Move every one behind a single source of truth:
- `apps/api/src/config.ts` (or equivalent existing config module): introduce `PORTAL_ORIGIN` (env var, e.g. `https://coms.ahacommerce.net` in prod, `https://coms-portal-xyz-uc.a.run.app` today, `http://localhost:8787` in dev) — plus `WEB_ORIGIN` if the API and web app live on different hosts.
- All places that build URLs (broker token `iss` claim, JWKS URL in `/.well-known/jwks.json` references, webhook callback URLs in test fixtures, OAuth-style redirect targets, audit-log links, admin email content) read from this single config.
- The SDK's default JWKS URL is **already** parameter-driven (`${portalOrigin}/.well-known/jwks.json` per item 4); confirm no portal-side default leaks the Cloud Run host.

**CORS allowlist becomes config-driven.** `CORS_ALLOWED_ORIGINS` env var (comma-separated) replaces any hardcoded list in `apps/api/src/index.ts`. Default in dev includes `http://localhost:*`; prod default reads from env.

**Cookie domain becomes config-driven.** `SESSION_COOKIE_DOMAIN` env var replaces any hardcoded domain string in `apps/web/src/hooks.server.ts` cookie options. Empty / unset = host-only cookie (current behavior).

**Hardcoded-URL test.** Add a CI check (a simple grep gate in the existing pipeline) that fails the build if `run.app`, `coms-portal-`, or any literal `ahacommerce.net` appears outside `apps/api/src/config.ts`, `.env.example`, deploy workflow YAML, or docs.

**Acceptance test:** Set `PORTAL_ORIGIN=https://coms.ahacommerce.net` in a local `.env`, restart, hit `/.well-known/jwks.json`, confirm broker tokens issued thereafter carry `iss=https://coms.ahacommerce.net`, confirm the SDK (item 4) verifies them by passing `portalOrigin: "https://coms.ahacommerce.net"`, confirm the webhook outbound `User-Agent` and any embedded callback URLs use the new origin. Revert the env, confirm the system is back on the Cloud Run URL — zero code changes either way.

### 7. SDK semver + supported-versions policy

**Goal:** The SDK is a public contract; integrators won't depend on it without a stated versioning policy.

**Add to the `coms-sdk` repo:**
- `CHANGELOG.md` in [Keep-a-Changelog](https://keepachangelog.com/) format. Entry for `v0.1.0` lists the four exports and notes the pre-1.0 stability disclaimer.
- `SUPPORTED_VERSIONS.md` (or a section in the README) stating: (a) the current major is supported; (b) deprecation requires one minor with a runtime `console.warn` before removal; (c) breaking changes bump major; (d) the `0.x` range is pre-stable and may break on minor until `1.0.0`.
- A `## Versioning` section in the SDK README pointing to both files.

**Acceptance test:** A reader of the SDK repo can answer "is `v0.1.0` going to break me on the next minor?" without reading source — the policy is explicit.

### 8. OpenAPI generation (public typed contract)

**Goal:** Integrators using endpoints outside the SDK's four hot paths (`/v1/employees`, `/v1/apps`, `/access`, etc.) shouldn't have to read source. A served OpenAPI document closes that gap at zero infra cost.

**Implementation.** Elysia exposes a `@elysiajs/swagger` plugin that derives an OpenAPI 3.x document from the existing route schemas already defined in the routes (no schema rewrite). Wire it:
- Mount the plugin in `apps/api/src/index.ts`.
- Serve the JSON document at `GET /api/openapi.json` (no auth — it's a public contract).
- Serve the Swagger UI at `GET /api/docs` (no auth — convenience for integrators).
- Tag every route with the appropriate group (`auth`, `aliases`, `webhooks`, `apps`, `internal`); mark `internal/*` routes with `x-internal: true` so integrators see them but understand they are not part of the public contract.

**Document in the quickstart (item 5):** A "Beyond the SDK" section linking to `/api/openapi.json` + `/api/docs`.

**Acceptance test:** `curl /api/openapi.json | jq '.paths | keys | length'` returns ≥10. The Swagger UI loads at `/api/docs` and lists every public route. The OpenAPI document validates against the OpenAPI 3.1 schema (use `swagger-cli validate` or equivalent in CI).

### 9. Tenant-scoped audit-log read endpoint

**Goal:** Internal `actor_ip` + `request_id` columns (item 2) are for *our* debugging. Integrators need read access to the audit trail of activity *involving their tenant* — a Cloud-Audit-Logs-shaped feature. Without it, "what happened to my users last Tuesday" is a support ticket, not a self-service query.

**Implementation.**
- New route: `GET /api/v1/audit-log` (broker-token-authenticated, tenant-scoped).
- Returns rows from `access_audit_log` where the row touches the caller's tenant (e.g. `target_app_id = caller.appId` OR `actor_app_id = caller.appId`; concrete predicate confirmed during implementation against the actual schema).
- Query params: `from` (ISO timestamp, default 24h ago, max 30d ago), `to` (ISO timestamp, default now), `cursor` (opaque pagination token), `limit` (max 100, default 50).
- Response shape: `{ entries: [{ id, occurredAt, actorAppId, targetAppId, action, requestId, /* no actor_ip — internal-only */ }], nextCursor: string | null }`.
- **`actor_ip` is NOT exposed** to integrators (PII / debugging-only). `request_id` IS exposed so integrators can correlate with their own logs if they captured the `X-Coms-Request-Id` response header.

**Document in the quickstart (item 5):** A "Read your tenant's audit log" section with a `@coms-portal/sdk` `getAuditLog(client, { from, to })` helper added as a fifth SDK export.

**Acceptance test:** A broker-token-authenticated request to `/api/v1/audit-log` returns only rows touching the caller's tenant; rows from other tenants are not leaked even with crafted query params. `actor_ip` is absent from the response. Pagination works (cursor round-trips). `from`/`to` filters work.

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

**Engineering:** ~3.5 days portal-side, single engineer. Items 1–3 + 6 + 8 fit comfortably in one PR (~2.5 days; +½ day for the domain-readiness audit and OpenAPI plugin wiring); item 4 (SDK extraction) + item 7 (SDK semver policy) run in parallel as a sibling repo (~1 day); items 5 + 9 (quickstart + audit-log read endpoint) land last after the SDK is real (~½ day).

**Infra:** **$0 incremental.** Cloud Logging already collects unstructured stdout (you're paying for it now); structured JSON costs the same and lands in the free tier (50 GiB/project/month) for portal-scale traffic. Cloud Trace and Error Reporting are GCP-native and free at portal scale (Cloud Trace: 2.5M spans/month free; Error Reporting: free for log-based grouping). The SDK is a code/repo deliverable, not infra. OpenAPI is served from the existing API container. No new database, no new queues, no new services.

First infra spend kicks in only when staging or Redis are picked up — both deferred above. Domain wiring itself (item 6 enables it; the actual DNS + Cloud Run domain mapping) is **$0** on GCP — managed certificates and domain mappings on Cloud Run are free.

---

## Sequencing

Items 1–3 + 6 + 8 land in any order in a single portal PR. Items 4 + 7 (SDK + semver policy) run in parallel as a separate repo and PR. Items 5 + 9 (quickstart + tenant audit-log read) land last, after the SDK is real.

Recommended:
- **Day 1 morning:** Audit log schema migration (`drizzle-kit generate`, item 2). Request-ID middleware (item 2). Pino integration (item 2). Hardcoded-URL audit + `PORTAL_ORIGIN` / `CORS_ALLOWED_ORIGINS` / `SESSION_COOKIE_DOMAIN` config centralization (item 6).
- **Day 1 afternoon:** Launcher migration to `/api/userinfo` (item 1). Real `/api/health` (item 2). Webhook-dispatcher comment fix (item 3). Hardcoded-URL CI gate (item 6).
- **Day 2 morning:** OpenAPI plugin wiring + route tagging (item 8). SDK extraction begins — scaffold the `coms-sdk` repo locally under the project folder (item 4).
- **Day 2 afternoon:** SDK extraction continues — port verification logic from `auth-broker.ts` and `webhook-dispatcher.ts`, add `getAuditLog` helper for item 9, write `CHANGELOG.md` + `SUPPORTED_VERSIONS.md` (items 4 + 7), publish v0.1.0 to the public GitHub repo at `github.com/mrdoorba/coms-sdk`.
- **Day 3 morning:** Tenant-scoped audit-log read endpoint (item 9). Integrator quickstart doc including "Beyond the SDK" / OpenAPI link and "Read your tenant's audit log" sections (items 5 + 8 + 9).
- **Day 3 afternoon:** End-to-end acceptance test (fresh integrator scaffolds against the SDK + quickstart in a sandbox), domain-flip dry-run (set `PORTAL_ORIGIN` to a fake domain, confirm everything keeps working — proves the config-only flip).

Heroes can adopt the SDK in a follow-up at any point after v0.1.0 ships; that adoption is not part of this spec. Domain wiring (DNS + Cloud Run domain mapping for `coms.ahacommerce.net`) happens after this spec ships and is a **config change only** by item 6's design.

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
| Hardcoded-URL CI gate (item 6) false-positives on legitimate doc references. | Allowlist documented: `apps/api/src/config.ts`, `.env.example`, `.github/workflows/*.yml`, `docs/**`. Anywhere else, the literal must come from config. |
| OpenAPI document (item 8) leaks an internal route's request shape. | Tag every `internal/*` route with `x-internal: true` and exclude from the swagger UI's default tag filter. The document still lists them (single source of truth), but the swagger UI navigation hides them by default. |
| Tenant-scoped audit-log endpoint (item 9) leaks rows from another tenant via crafted query params. | The tenant-scope predicate is applied in the SQL `WHERE` clause from the broker token's `appId` claim (server-side, not client-controlled). Add a unit test that calls the endpoint with `appId=A` and confirms zero rows where `target_app_id != A AND actor_app_id != A`. |
| Domain flip (item 6) silently breaks the SDK's JWKS cache for already-issued tokens. | Broker tokens are 5-min TTL (`auth-broker.ts:52–53`); any token issued before the flip naturally expires within 5 min of the flip. Document this 5-min "soft cutover" window in the runbook for the actual domain switch. |

---

## Verification (full)

After all nine items land:

1. **Launcher.** Add app #3 to `app_registry` via `/admin/apps`. Confirm it appears in the chrome and account widget without a portal redeploy and without bumping `@coms-portal/shared`.
2. **Observability.** Trigger an error in `/api/aliases/resolve-batch`. Confirm: (a) Cloud Logging structured JSON entry with `requestId` field, (b) `X-Coms-Request-Id` response header matches that ID, (c) any webhook the request kicked off carries the same ID in its outbound header, (d) the `access_audit_log` row from that request has `request_id` populated.
3. **Health.** Stop the Cloud SQL Auth Proxy locally; hit `/api/health`; receive 503 with `checks.db = 'failed'`.
4. **Doc drift.** `grep -r "webhook-dlq" apps/api/src/` returns zero hits.
5. **SDK.** A fresh repo `coms-sdk-smoke-test` with `bun add git+https://github.com/mrdoorba/coms-sdk.git#v0.1.0` plus a 30-line script verifies a real broker token (issued by a local portal) and a real webhook signature (signed by a local portal). No portal source-code reading allowed during the test.
6. **Quickstart.** A developer who has never seen this codebase reads `docs/architecture/integrator-quickstart.md`, runs the SDK against a local portal, and ships a working "hello world" integrator in ≤30 minutes.
7. **Domain readiness.** Set `PORTAL_ORIGIN=https://coms.ahacommerce.net` in a local `.env`, restart, hit `/.well-known/jwks.json`, broker `iss` claims and webhook callback URLs reflect the new origin. Revert — system back on Cloud Run URL. Zero code changes either direction. CI hardcoded-URL gate is green.
8. **SDK semver policy.** `coms-sdk` repo has `CHANGELOG.md` (Keep-a-Changelog format, v0.1.0 entry) and `SUPPORTED_VERSIONS.md` (or README section). The "is v0.1.0 going to break me on next minor?" question is answered without reading source.
9. **OpenAPI.** `curl /api/openapi.json` returns a valid OpenAPI 3.x document; `swagger-cli validate` (or equivalent) passes; `/api/docs` serves the Swagger UI listing every public route grouped by tag.
10. **Tenant audit-log read.** A broker-token-authenticated `GET /api/v1/audit-log?from=...&to=...` returns only rows touching the caller's tenant, paginates correctly, and never includes `actor_ip`. Cross-tenant leak test (calling with tenant A's token, asserting zero rows scoped to tenant B) passes.

---

## Out of Scope (Confirmed)

- Heroes' adoption of the SDK. Tracked separately as a Heroes-side follow-up; not part of this spec.
- Any change to the broker token shape, the webhook envelope shape, or the alias resolve contract. The SDK ports the existing verification logic; it does not redefine the contracts.
- Any change to the admin UI at `/admin/apps`. App registration via the existing form is sufficient for the verification tests.
- Any new external dependency beyond `pino`, `pino-pretty` (dev), and `@elysiajs/swagger` (item 8). No OpenTelemetry SDK in this spec — Cloud Logging structured JSON ingestion covers the observability gap; OTel + Cloud Trace are deferred to whenever distributed tracing is genuinely required (currently a single Cloud Run service; nothing to trace across).
- Actual DNS provisioning + Cloud Run domain mapping for `coms.ahacommerce.net`. Item 6 makes the flip a config-only change; doing the flip is a follow-up runbook task gated on this spec landing.
- Tenant self-service for app registration (`/admin/apps` remains admin-only). Deferred to Spec 4+.
- Sandbox / "developer credentials in 5 minutes" tenant for external integrators. Deferred.
- Public status page (`status.coms.ahacommerce.net`) and SLO definitions. Deferred.
- Webhook replay UI / dashboard. Deferred — disabled-on-max-retries remains the dead-letter signal per item 3.

---

## Success Criteria

Spec 03c is done when:

1. Adding a row to `app_registry` makes that app visible in the chrome launcher and account widget without bumping `@coms-portal/shared` or redeploying the portal.
2. Every API request has a `X-Coms-Request-Id` response header; that ID appears on every log line from the request, every webhook dispatched during the request, and the `access_audit_log` row written by the request.
3. `/api/health` returns 503 when the DB, Secret Manager, or Cloud Tasks dependency is unhealthy.
4. The webhook dispatcher source no longer references a non-existent `/api/internal/webhook-dlq` route.
5. `@coms-portal/sdk` v0.1.0 is published at `github.com/mrdoorba/coms-sdk` (public repo) with `verifyBrokerToken`, `verifyWebhookSignature`, `resolveAlias`, `introspectSession`, and `getAuditLog` exports.
6. `docs/architecture/integrator-quickstart.md` exists, is exercised by an end-to-end acceptance test, and a fresh developer can ship a working integration in ≤30 minutes using only the doc + the SDK.
7. Flipping `PORTAL_ORIGIN` to `https://coms.ahacommerce.net` is a config-only change — no code edits, no SDK rebuild, CI hardcoded-URL gate stays green.
8. The SDK repo carries a stated semver + deprecation policy (`CHANGELOG.md` + `SUPPORTED_VERSIONS.md`).
9. `GET /api/openapi.json` serves a valid OpenAPI 3.x document covering every public route; `/api/docs` serves the Swagger UI.
10. `GET /api/v1/audit-log` lets an integrator read their tenant's audit trail (no `actor_ip`, with pagination + date filters), and the cross-tenant leak test passes.

---

## Shipped state (2026-04-29) — what actually landed

### Commits on `main`

| SHA | Subject |
|---|---|
| `b03fb10` | Spec 03c Effects 3.3+3.4+3.6: Pino logging, request-ID middleware, real health probe |
| `41a1d0d` | Spec 03c Effect 3.3 close-out: migrate auth.ts + auth-broker.ts console.* calls |
| `93ab759` | Fix webhook-dispatcher-oidc test: spy on live logger instance for warn assertion |
| `24f0ec6` | Reconcile Spec 03c with Checkpoint 1 and 2 amendments |
| `8bea99f` | Centralise portal origin and CORS behind a single config + CI hardcoded-URL gate + reconcile webhook-dispatcher docstring with reality |
| `2a7e608` | Extend access_audit_log with actor_ip, request_id, actor_app_id, target_app_id and populate at all 28 call sites |
| `249359c` | Open the integrator pathway: OpenAPI plugin + tenant-scoped audit-log read + launcher migration + UUID-validated request-ID + correlation header on error responses + integrator quickstart |
| `a091968` | Consolidate apps/api/package.json with all Spec 03c deps + bump @coms-portal/sdk to v0.1.1 + collapse auth.ts inline env reads to PORTAL_ORIGIN import |

Sibling repos: `mrdoorba/coms-sdk` v0.1.0 + v0.1.1; `mrdoorba/coms-shared` v1.4.1.

### Deviations from plan

1. **Effect 3.5 grew during planning to four columns.** Original spec listed `actor_ip` + `request_id` only; Checkpoint 1 added `actor_app_id` and Checkpoint 2 added `target_app_id` so admin-on-tenant's-behalf actions surface in tenant audit-log reads. Migration `0028_little_deadpool.sql` carries all four nullable columns + two composite indexes on `(actor_app_id, created_at)` and `(target_app_id, created_at)`.
2. **`@coms-portal/shared` shipped as v1.4.1, not v1.4.0.** v1.4.0 was already tagged on GitHub from prior missions (commits `7aa5ae5`, `9295678`). Patch bump used; semver-correct, non-breaking.
3. **CORS plugin was added, not centralized.** Original spec assumed an existing CORS plugin needed config-driven allowlisting; reconnaissance found none was active. `@elysiajs/cors` was installed and wired from config — slightly more scope than the spec implied (~30 min added), but the outcome (env-driven `CORS_ALLOWED_ORIGINS`) matches.
4. **Red-cell findings folded in.** Vigilant's review (at `.nelson/missions/2026-04-29_024712_fd19ceb1/red-cell-review.md`) surfaced two correlation-integrity gaps not in the original spec: F-1 (UUID-format validation on inbound `X-Coms-Request-Id`) and F-2 (`x-coms-request-id` header missing on error responses thrown via `status()`). Both fixed in commit `249359c`. F-3 (SDK JWKS per-call instantiation) shipped as SDK v0.1.1 in commit `a091968`. F-4 (cross-tenant integration test infra) deferred to Spec 4 — see §Follow-ups.
5. **Audit-log read endpoint mounted in a separate `/v1` group.** Original implementation plan put it inside the existing `/v1` group; that group's `authPlugin` would have 401'd broker-token requests before `requireBrokerToken` could see them. Mount strategy adjusted at execution time to a sibling `/v1` group carrying its own broker-token middleware.
6. **`actor_ip` exclusion is invariant by design.** The audit-log read endpoint's SELECT clause explicitly omits `actor_ip`. Vigilant verified no `details` JSONB call site contains `actor_ip` either.
7. **OpenAPI doc not live-curl validated** — verified structurally via Elysia's internal route map (the same map the swagger plugin consumes at boot). Live-curl validation deferred until integration test infra exists (Spec 4).

### Follow-ups carried out of the mission

| Item | Status | Where it goes |
|---|---|---|
| F-3 — SDK JWKS module-level cache (per-`jwksUrl`) | **Closed.** Shipped as `coms-sdk` v0.1.1; portal consumes `#v0.1.1`. | — |
| auth.ts:107 inline `process.env.PORTAL_PUBLIC_ORIGIN` read | **Closed.** Replaced with `PORTAL_ORIGIN` import at line 108 in commit `a091968`. | — |
| F-4 — Real Postgres integration test fixture for cross-tenant leak test (replace structural mock; harden `applyWhereFilter` fallthrough) | **Deferred.** Spec 4 needs integration test infra anyway (federated search fan-out across providers). Layer 1 insurance edit (replace `return true` with `throw`) deferred too — folds in alongside the fixture work. | Spec 4 prerequisite. |
| DNS + Cloud Run domain mapping for `coms.ahacommerce.net` | **Deferred.** Item 6 made the flip config-only. Provision DNS record + Cloud Run domain mapping when ready. Zero infra cost (managed certs + domain mappings on Cloud Run are free). | User-side runbook. |
| Heroes' adoption of `@coms-portal/sdk` | **Deferred.** SDK is published; Heroes can adopt at any point. | Heroes-side follow-up; not portal scope. |
| Larger deferred items | **Spec 03d.** Redis rate-limiter, staging env, per-tenant signing keys, KMS for webhook secrets, `compliance_status` enforcement, refresh tokens, session-expiry UX, audit-log Cloud Logging sink, OpenTelemetry, canary deploys. Each has a documented trigger. | Spec 03d backlog. |

### Verification evidence summary

- **Canonical API test invocation** (`bun run --cwd apps/api test`, which is `find src -name '*.test.ts' \| sort \| xargs -I{} -n1 -P 4 bun test {}`): exit 0, 38 files, 0 failures across multiple runs.
- **APP_LAUNCHER cleanup:** `grep -r "APP_LAUNCHER" apps/web/src/` returns zero hits.
- **Webhook DLQ doc fix:** `grep -r "webhook-dlq" apps/api/src/` returns zero hits.
- **Console.* sweep:** zero `console.*` calls in any non-test file under `apps/api/src` and `apps/web/src` (verified by grep including the 11 sites in auth.ts/auth-broker.ts that Beacon closed in commit `41a1d0d`).
- **Domain config-only flip:** verified by HMS Lighthouse — flipping `PORTAL_PUBLIC_ORIGIN=https://flip-test.example.com` and restarting reflects the new origin in JWKS, well-known, broker `iss` claims, and admin web page; reverting restores original. Zero code edits either direction.
- **Cross-tenant leak test:** structural-mock test passes (calling with tenant A's broker token returns zero rows scoped only to tenant B even with crafted query params). Methodology gap (F-4) documented above.
- **`actor_ip` exclusion:** verified by reading SELECT clause in `audit-log.ts` and asserted in the test via `JSON.stringify(response).not.toContain('actor_ip')`.
- **SDK five exports:** verified in `coms-sdk/src/index.ts` — `verifyBrokerToken`, `verifyWebhookSignature`, `resolveAlias`, `introspectSession`, `getAuditLog`. Constant-time signature comparison verified in `webhook.ts`. `BrokerTokenError` discriminated codes verified in `errors.ts`.
- **Red-cell review:** 6 findings (0 critical, 2 medium fixed in-mission, 1 medium fixed in follow-on, 1 low + 2 info deferred). Report at `.nelson/missions/2026-04-29_024712_fd19ceb1/red-cell-review.md`.
