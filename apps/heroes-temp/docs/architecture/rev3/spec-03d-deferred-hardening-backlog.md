# Rev 3 — Spec 03d: Deferred Hardening Backlog

> **Status (2026-04-29):** Decided + deferred. Each item has a documented trigger; none are scheduled. This spec exists so deferred work is visible and not rediscovered as bugs later.
> **Spec 03c prerequisite — satisfied (2026-04-29).** All 03c work is on `main`; the observability foundation (Pino structured logging, request-ID middleware with UUID validation, real `/api/health` probe, four audit-log columns: `actor_ip` + `request_id` + `actor_app_id` + `target_app_id`) is in place. Items below that referenced "after Spec 03c ships" can now proceed when their own triggers fire.
> **Original priority:** **Variable per item.** Two are cost-bearing infra decisions (Redis, staging); the rest are pure engineering deferred behind product or compliance triggers.
> Scope: Portal `apps/api`, `apps/web`, `infra/`, `.github/workflows/`. No Heroes-side work.
> Prerequisites: Spec 03c shipped (provides the observability foundation several items below depend on) — **satisfied**.

---

## Why a single backlog spec instead of nine

Each item below could be its own spec, but spec sprawl makes the timeline harder to read and most items are too small to warrant a dedicated doc. They also share a character — *post-shipping hardening that's been consciously deferred* — and live in one place a maintainer can scan when a trigger fires. When an item's trigger does fire, it gets promoted: the relevant section becomes the seed of an implementation PR (or, for items with significant scope, a dedicated Spec).

This spec **is not a sprint plan.** It is a punch list with cost framing.

---

## Cost-bearing items (open the wallet)

### D1. Redis-backed rate limiter

**Today:** `apps/api/src/routes/aliases.ts:11–27` is in-memory per Cloud Run instance. Multi-instance Cloud Run multiplies the per-app rate budget by N (the file's own comment acknowledges this). Only `/aliases/resolve-batch` is rate-limited; `/v1/employees`, `/v1/apps`, `/access` have no per-route limits.

**Trigger.** Any of:
- Cloud Run autoscaling regularly runs >1 instance during normal load.
- A consumer reports rate-limit budget feels inconsistent across requests.
- Spec 03d-D2 (rate-limit extension below) ships, which makes the in-memory limitation more visible.

**Scope.**
- Provision Memorystore Redis Basic 1GB in `infra/` (Terraform).
- Replace the in-memory `Map`-based bucket with a Redis-backed token bucket using `INCR` + `EXPIRE` Lua atomic primitive.
- Keep the same 20 RPS / burst 40 budget on `/aliases/resolve-batch`.
- Update the file's leading comment to reflect Redis-backed multi-instance correctness.

**Cost.**
- **Infra:** ~$35/mo for Memorystore Redis Basic 1GB (smallest tier).
- **Engineering:** ~½ day. The Lua bucket script is well-known; the Drizzle/Elysia integration is a thin wrapper.

**Acceptance.** Run `apps/api` with `min_instance_count = 2` in Cloud Run; hit `/aliases/resolve-batch` from a load tester at 25 RPS sustained; confirm aggregate (not per-instance) limit holds at 20 RPS with 429s, not 40.

---

### D2. Staging environment

**Today:** `.github/workflows/deploy.yml:15–19` triggers prod deploy on every push to `main`. No intermediate environment. Cloud Run is a single production service; Cloud SQL is a single production instance.

**Trigger.** Any of:
- A breaking change is required to a load-bearing contract (broker token shape, webhook envelope) and the team wants to validate against an external consumer before prod.
- An external tenant onboards and requires a non-prod integration target.
- A near-miss prod incident makes "every push = prod" feel uncomfortable.

**Scope.**
- Add a `coms-portal-app-staging` Cloud Run service (scales to zero — near-zero cost when idle).
- Add a Cloud SQL instance — either a dedicated small tier (~$15/mo, simplest) or a separate database on the existing instance (cheaper, but reduces isolation; pick based on whether staging touches the same connection-limit budget as prod).
- Update `deploy.yml`: introduce a `staging` deploy step gated on PR-merged-to-`main`; add a manual-approval gate to promote staging → prod (`workflow_dispatch` with environment protection).
- Optional: preview deploys per PR (Cloud Run revisions named after the PR ref, auto-cleaned after merge). Adds ~zero cost (scale-to-zero) but ~½ day of CI work.

**Cost.**
- **Infra:** ~$15–50/mo depending on Cloud SQL tier (db-f1-micro ≈ $15/mo; db-g1-small ≈ $50/mo). Cloud Run staging is effectively $0 at scale-to-zero. Add ~$5/mo if you spin up a separate Memorystore for staging once D1 lands.
- **Engineering:** ~1–2 days for the basic split; +½ day for preview deploys.

**Acceptance.** A push to `main` deploys to staging only; a manual `workflow_dispatch` (or environment-approval) promotes staging → prod. Smoke tests run against staging before promotion. Rollback is a one-click revert of the staging→prod promotion, not a code rollback PR.

---

## Free (engineering-only) items

These are deferred for product or compliance reasons, not for cost.

### D3. Per-tenant broker signing key derivation

**Today:** `apps/api/src/services/signing-keys.ts` enforces a single ACTIVE row in `portal_broker_signing_keys`. ES256 broker tokens (`auth-broker.ts:218–228`) sign with this global key. HS256 retains a per-app fallback (`auth-broker.ts:148`) but is the legacy mode.

**Trigger.** External tenant #3 onboards and requires cryptographic trust isolation (a compromised one-tenant key must not affect other tenants).

**Scope.** Derive a per-app `kid` via HKDF from the global root key + `app.slug`; rotate per-tenant independently. JWKS endpoint already returns multiple keys, so consumers don't need to change. Update the `kid` claim on issued tokens to identify the per-app key.

**Cost.** ~1–2 days engineering. Zero infra.

**Acceptance.** Two apps each verify only against their own `kid` from the JWKS; revoking one app's key does not invalidate the other's tokens.

---

### D4. Webhook secret KMS envelope encryption

**Today:** `apps/api/src/db/schema/app-webhook-endpoints.ts:14` stores `secret` as plaintext `text(...)` with the comment "stored as-is (not hashed) — portal needs to sign outbound payloads with it".

**Trigger.** Any of:
- A compliance review (SOC 2, ISO 27001) flags plaintext secrets in the database.
- An external tenant onboards under contractual data-protection obligations.
- A DB-snapshot leak rehearsal makes the plaintext storage feel uncomfortable.

**Scope.** Envelope-encrypt `secret` with a Cloud KMS key at write time; decrypt at delivery time inside `webhook-dispatcher.ts` only. The KMS decrypt is in the hot path of every outbound webhook, so cache decrypted secrets in-memory per Cloud Run instance with a short TTL (~5 min).

**Cost.**
- **Infra:** Cloud KMS is ~$0.06/key/month plus $0.03 per 10K operations. At portal volume (~thousands of deliveries/day), well under $1/mo.
- **Engineering:** ~½–1 day.

**Acceptance.** A `pg_dump` of `app_webhook_endpoints` reveals only ciphertext; webhook deliveries continue working without observable latency regression.

---

### D5. `compliance_status` enforcement at token issuance

**Today:** `apps/api/src/services/apps.ts:46–79` enforces manifest path + `lastVerifiedAt` at registration. `apps/api/src/services/auth-broker.ts:296–384` (`createBrokerHandoff`) does not check `compliance_status` — only `app.status !== 'active'` and the user→app access list.

**Trigger.** Compliance gating is required (typically when an external tenant operates under SOC 2 / ISO 27001 / HIPAA obligations and the portal must not issue tokens to apps with stale compliance state).

**Scope.** Add a `compliance_status` check inside `assertAppAccess()` (or the equivalent enforcement function in `auth-broker.ts`); reject token issuance for apps with `compliance_status IN ('draft', 'expired', 'deprecated')`. Surface the failure with a typed `BrokerAuthorizationError` carrying `code: 'app_not_compliant'`.

**Cost.** ~½ day engineering. Zero infra.

**Acceptance.** Setting an app's `compliance_status` to `expired` causes its handoffs to fail with the typed error; flipping back to `compliant` restores issuance.

---

### D6. Session-expiry UX (proactive refresh + warning)

**Today:** `apps/web/src/hooks.server.ts:15–48` redirects hard to `/login` on any error/timeout during session validation. No proactive refresh, no "about to expire" warning, no graceful re-auth flow.

**Trigger.** Any of:
- User complaints about being logged out mid-task.
- A long-form workflow (e.g. a bulk-edit screen) gets shipped and silent expiry destroys in-progress work.
- Spec 5 (Suite Search) ships, since `Cmd+K` palettes feel especially broken when sessions expire silently.

**Scope.**
- Client-side countdown based on session expiry timestamp (returned by `/api/userinfo` once D11 below ships, or a new lightweight `/api/auth/session-expiry` endpoint).
- Toast warning at T-2min: "Your session will expire soon — click to extend."
- Click-to-extend hits a portal endpoint that re-validates and bumps the cookie expiry.
- Hard redirect on actual expiry preserves the current URL as a `next=` query param so the user lands back where they were after re-auth.

**Cost.** ~1–2 days engineering (toast component, countdown store, extend endpoint). Zero infra.

**Acceptance.** A user editing a form 90 seconds before session expiry gets a warning toast; clicking it extends the session; not clicking it redirects to login with `next=` preserved and the form is recoverable on return.

---

### D7. Refresh flow on broker tokens

**Today:** Broker tokens are 5-min hardcoded TTL (`apps/api/src/services/auth-broker.ts:52–53`). No `refresh_token` grant.

**Trigger.** An integrator needs longer-lived sessions without re-running the handoff (e.g. a long-running webhook consumer that holds a broker token for outbound calls back to the portal).

**Scope.** Add a `refresh_token` grant to a new `/api/auth/broker/token` endpoint per OAuth 2.0 conventions; issue refresh tokens alongside broker tokens during handoff exchange; rotate refresh tokens on each use; invalidate on session revocation. Document in the integrator quickstart (the doc Spec 03c creates).

**Cost.** ~1–2 days engineering. Zero infra (refresh tokens stored in existing DB).

**Acceptance.** A broker token issued at T+0 expires at T+5min; using its paired refresh token at T+4min30s yields a fresh broker token + new refresh token; the old refresh token rejects on reuse.

---

### D8. Rate-limit extension to remaining mutation endpoints

**Today:** Only `POST /api/aliases/resolve-batch` is rate-limited (`apps/api/src/routes/aliases.ts:11–27, :42`). `/v1/employees`, `/v1/apps`, `/access` have no per-route limits.

**Trigger.** Any of:
- D1 (Redis-backed limiter) ships and gives a centralized, multi-instance-correct primitive to extend.
- A bulk-import script accidentally hammers `/v1/employees` and reveals the gap.
- An external tenant onboards and the trust boundary makes per-route limits non-optional.

**Scope.** Apply the same token-bucket primitive (Redis-backed if D1 has shipped, in-memory otherwise) to `POST /v1/employees`, `POST /v1/apps`, the bulk-edit endpoints under `/access`, and any other mutation endpoint without a natural authorization-based throttle. Tune budgets per-endpoint based on legitimate use (e.g., `/v1/employees` likely 5 RPS / burst 20; `/v1/apps` likely 1 RPS / burst 5).

**Cost.** ~½ day engineering if D1 has shipped; ~1 day if implementing in-memory + Redis migration in one pass. Zero infra (assuming D1's Memorystore is reused).

**Acceptance.** Each protected endpoint returns 429 + `Retry-After` past its budget; aggregate budget holds correctly across multiple Cloud Run instances (when paired with D1).

---

### D9. Audit log Cloud Logging sink + retention + failure events

**Today:** `apps/api/src/db/schema/audit.ts` defines `access_audit_log` with the four columns Spec 03c shipped (`actor_ip`, `request_id`, `actor_app_id`, `target_app_id`) plus composite indexes on `(actor_app_id, created_at)` and `(target_app_id, created_at)`. Still missing: a Cloud Logging sink, a retention/archival policy, and failure-event audit actions (the `AuditAction` enum is success-only).

**Trigger.** Compliance review forces it (SOC 2 typically requires retention ≥1 year + tamper-evident export). Or a security incident response reveals the audit log is hard to query at scale (Postgres `jsonb` queries on millions of rows).

**Scope.**
- Add a Logging sink that writes every audit log row to Cloud Logging in structured JSON, then to a BigQuery dataset for long-term query.
- Add retention: 90 days in Postgres (operational), 7 years in BigQuery (compliance).
- Extend the `AuditAction` enum with failure-side actions (`failed_login`, `denied_access`, `revoked_token`, etc.) and wire failure paths to write them.
- Make `access_audit_log` rows immutable from the application layer (DB-level `UPDATE`/`DELETE` REVOKE on the application role; admin role retains for compliance edits).

**Cost.**
- **Infra:** Cloud Logging sink is free at portal scale (50 GiB/project/month free tier). BigQuery storage is ~$0.02/GiB/month — at portal volume, pennies. Total: <$1/mo.
- **Engineering:** ~1–2 days.

**Acceptance.** A failed login attempt produces an `access_audit_log` row AND a Cloud Logging entry AND a BigQuery row within 30s; an attempt to `UPDATE` an audit row from the application role fails with a permission error.

---

### D10. OpenTelemetry → Cloud Trace

**Today:** No distributed tracing. Cloud Logging structured JSON (after Spec 03c) covers per-request observability, but cross-service spans are not captured. The portal currently runs as a single Cloud Run service so the absence is mostly invisible.

**Trigger.** Any of:
- `apps/api` splits into multiple services (e.g., the webhook dispatcher becomes a separate worker, or an event ingester is added).
- Spec 5 (Suite Search) ships — federated `/api/search` calls fan out to N providers and tracing each leg becomes the only practical debug surface.
- A latency mystery (slow request, unclear whether DB / Cloud Tasks / outbound webhook is to blame) makes spans worth the integration cost.

**Scope.** Add `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`; configure the Cloud Trace OTLP endpoint (no agent needed on Cloud Run); auto-instrument Postgres + outbound HTTP. Keep sampling at 100% until volume justifies head-based sampling.

**Cost.**
- **Infra:** Cloud Trace is free up to 2.5M spans/month — well above portal scale.
- **Engineering:** ~½–1 day. OTel setup on Node is well-trodden.

**Acceptance.** A request to `/api/aliases/resolve-batch` shows up in Cloud Trace as a parent span with child spans for the DB query, the per-app rate-limit check, and any outbound webhook delivery. The `requestId` from Spec 03c appears as a span attribute, linking trace spans to log lines.

---

### D11. Canary deploys + feature flags

**Today:** `.github/workflows/deploy.yml:15–19` deploys directly to a single Cloud Run service. No traffic splitting, no flags.

**Trigger.** D2 (staging) ships and the team wants gradual rollout from staging to prod, OR a risky change wants a 5%-traffic canary before full promotion.

**Scope.**
- Use Cloud Run revision-tagged traffic splitting (`gcloud run services update-traffic --to-revisions REV=5,PREV=95`) for canary; promote via `gcloud run services update-traffic --to-latest` after soak.
- Adopt a feature-flag library (GrowthBook self-hosted is ~$0 if you already run a small instance; or use a `feature_flags` Postgres table with a 30-second cache) for runtime kill switches on individual features.
- Wire the flag check into critical paths: webhook dispatch, broker token issuance, alias resolve.

**Cost.**
- **Infra:** Self-hosted GrowthBook on a small Cloud Run service: ~$0 at scale-to-zero. Postgres-table flags: $0.
- **Engineering:** ~1 day for canary; ~1–2 days for flag library wiring.

**Acceptance.** A canary deploy receives 5% of prod traffic for 30 minutes with monitoring, then auto-promotes if error rate stays flat. A feature flag toggle disables a code path within 30 seconds of being flipped, without redeploy.

---

## Recommended ordering when triggers cluster

If multiple triggers fire near-simultaneously (e.g., onboarding an external tenant fires D2, D3, D4, D5, D9 all at once), recommended order:

1. **D9 (audit log Cloud Logging sink)** first — compliance reviews always ask for this and it has the longest tail (BigQuery setup, retention configuration). Pick it up early.
2. **D4 (webhook secret encryption)** — small, security-load-bearing, easy to land before the tenant goes live.
3. **D5 (`compliance_status` enforcement)** — tiny code change, high signal to compliance auditors.
4. **D3 (per-tenant signing keys)** — only if cryptographic isolation is contractually required.
5. **D2 (staging)** — bigger infra change, takes longest; start the Terraform PR in parallel with items 1–4.
6. **D1 (Redis)** — only if multi-instance traffic is real or D8 needs the primitive.

D6, D7, D10, D11 stay independent and ship on their own triggers regardless of compliance work.

---

## Cost summary

| Item | Engineering | Infra/mo | Trigger |
|---|---|---|---|
| D1 Redis rate limiter | ~½ day | ~$35 | Multi-instance traffic |
| D2 Staging | ~1–2 days | ~$15–50 | Blast radius / external tenant |
| D3 Per-tenant signing keys | ~1–2 days | $0 | External tenant trust isolation |
| D4 Webhook secret KMS encryption | ~½–1 day | <$1 | Compliance / external tenant |
| D5 `compliance_status` enforcement | ~½ day | $0 | Compliance gating required |
| D6 Session-expiry UX | ~1–2 days | $0 | User complaints / long workflows |
| D7 Broker refresh flow | ~1–2 days | $0 | Long-lived integrator session |
| D8 Rate-limit extension | ~½–1 day | $0 (reuses D1) | Bulk-import incident / D1 lands |
| D9 Audit Cloud Logging + BigQuery | ~1–2 days | <$1 | Compliance review |
| D10 OpenTelemetry → Cloud Trace | ~½–1 day | $0 (free tier) | Multi-service or Spec 5 |
| D11 Canary + feature flags | ~2–3 days | $0 | D2 lands / risky rollout |

**Maximum monthly infra spend if every item ships:** ~$85/mo (D1 + D2 + D4 + D9 combined; D3, D5, D6, D7, D8, D10, D11 add nothing). All comfortably inside an internal-tool budget.

**Total engineering ceiling:** ~13–18 days if every item is implemented sequentially. Most items are independent and can land as separate PRs by separate engineers.

---

## Out of Scope

- **Multi-region failover.** Different blast-radius problem; needs its own spec when GCP region availability becomes a business constraint.
- **GDPR hard-delete cascades.** Tracked separately; touches the alias layer, audit log, and identity_users in coordinated ways that don't fit a backlog item.
- **Tenant-level suspension / billing / metering.** External-SaaS concerns; out of scope for an internal portal, would be a Rev 4 conversation if the product pivots.
- **Account deletion workflows.** Same — Rev 4 candidate.

---

## Success Criteria

Spec 03d is "done" only in the sense that the backlog is documented. Each item is independently complete when:

1. Its trigger condition has fired (and is documented in the implementing PR's description).
2. Its acceptance test passes.
3. The relevant section is moved out of this spec and into the implementing PR's description; this spec gets updated to mark the item shipped (with a link to the PR).

When all 11 items have shipped, this spec is retired. Until then it lives as a living backlog.
