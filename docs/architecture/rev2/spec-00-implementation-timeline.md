# Rev 2 — Spec 00: Implementation Timeline

> Coordination plan for Rev 2 specs. Rev 2 is **Spec 05 of Rev 1, plus a four-part federation hardening pass** that closes the remaining shared-secret surfaces between portal and relying-party apps.
>
> **Last updated:** 2026-04-26
> **Prerequisites:** Rev 1 complete (it is, except Rev 1 Spec 05 — see below).

---

## Theme of Rev 2

Rev 1 made the federation safe at small scale (per-app secrets, CSRF, provisioning bridge, resilience). Rev 2 makes it **scalable to N services and operationally clean**:

- **Eliminate symmetric shared secrets** between portal and apps. After Rev 2, the only secrets in the system are the portal's own signing key (private) and Google's own SA credentials (managed by Google). No more `PORTAL_BROKER_SIGNING_SECRET`, `PORTAL_INTROSPECT_SECRET`, or `PORTAL_WEBHOOK_SIGNING_SECRET` shared with services.
- **Become OIDC-recognizable.** Publishing JWKS + a discovery document means a new service can drop in `openid-client` / `next-auth` / `passport-azure-ad` / `jose.createRemoteJWKSet` and onboard without bespoke code.
- **Close one operational gap** carried over from Rev 1 (stale-serve alerting in Heroes).

---

## Specs

| Spec | Title | Owner | Effort | Heroes-side work? |
|------|-------|-------|--------|-------------------|
| 00 | Implementation Timeline (this doc) | Portal | — | — |
| 01 | RS256 + JWKS Endpoint | Portal | Large | Yes — H1 |
| 02 | OIDC Discovery Endpoint | Portal | Small | No |
| 03 | Webhook Auth via Google OIDC | Portal | Medium | Yes — H2 |
| 04 | Introspect Auth via Google OIDC | Portal | Medium | Yes — H3 |
| 05 | Stale-Serve Alerting Escalation | Heroes | Small | Yes (Heroes-only) — H4 |

After all five specs, every shared-symmetric-secret in the original Rev 1 architecture is gone:

- Broker token signing secret → replaced by portal's RS256 private key (only portal holds it); apps verify with public JWKS
- Introspect secret → replaced by Google OIDC ID tokens (relying party authenticates as itself to portal)
- Webhook HMAC secret → replaced by Google OIDC ID tokens (portal authenticates as itself to relying party)

---

## Order and Dependencies

```
Rev 1 Spec 05 (SSR + Cloud Tasks) ─┬─→ Rev 2 Spec 03 (webhook OIDC)
                                   │   reuses OIDC verifier code from Cloud Tasks
                                   │
Rev 2 Spec 01 (RS256 + JWKS) ──────┼─→ Rev 2 Spec 02 (OIDC discovery)
                                   │   discovery document references jwks_uri from §01
                                   │
Rev 2 Spec 04 (introspect OIDC) ───┘   parallels §03; can ship after §03 lands
                                       since Heroes will already have the verifier wired

Rev 2 Spec 05 (alerting)               independent; Heroes-only
```

**Recommended sequence:**

1. **Rev 2 Spec 01** — RS256 + JWKS. Biggest leverage; before any third-app onboarding. No prerequisites.
2. **Rev 2 Spec 02** — OIDC discovery. Trivial once §01 ships.
3. **Rev 2 Spec 03** — Webhook auth via Google OIDC. Reuses the already-landed `oidc-verifier.ts`.
4. **Rev 2 Spec 04** — Introspect auth via Google OIDC. Mirror of §03 for the inbound direction.
5. **Rev 2 Spec 05** — Heroes alerting escalation. Heroes-only; can land any time.

§02 and §03 can run in parallel after §01 is done. §05 is independent throughout.

**Rev 1 §05 carryover** (SSR-enablement flip on `apps/web/+layout.ts`) is independent of every item above and can land in parallel with §01 by whoever has the cycle. Cloud Scheduler health-probe migration is deferred — see "Rev 1 Carryover" below for rationale.

---

## What Rev 2 is **not** doing

These came up during architecture review but are deferred:

| Item | Why deferred |
|------|--------------|
| Refresh tokens (long-lived client renewal) | 7-day local sessions + introspect liveness covers our current clients (browser-only). Reconsider when adding mobile/desktop. |
| Multi-region / region failover | Conflicts with the cost philosophy ("no LB, scale-to-zero, ~$0 idle"). Reconsider if SLA target moves to 99.9%+ for external customers. |
| KMS envelope encryption for secrets at rest | After Rev 2 there are no app-shared secrets in the DB worth wrapping. Portal's private signing key in Secret Manager is already KMS-encrypted at rest by Google default. |
| Per-app HS256 dual-secret rotation (Rev 1 Spec 01 §5) | Obviated by §01 — broker secrets disappear entirely. |
| Full OIDC compliance (authorization endpoint, code grant, openid scope, ID token vs. access token split) | Out of scope. Discovery document in §02 will be honest about what we don't support. |

---

## Compatibility Strategy

Every Rev 2 spec ships in **dual-mode** during transition:

- **§01:** Portal mints both HS256 (existing) and RS256 (new) tokens; Heroes verifies whichever is present. After Heroes ships RS256-only verification, portal drops HS256.
- **§03:** Portal sends both HMAC headers and OIDC `Authorization: Bearer` on each webhook; Heroes accepts either; HMAC retired after Heroes ships.
- **§04:** Heroes sends both `x-portal-introspect-secret` header and OIDC `Authorization: Bearer`; portal accepts either; secret retired after Heroes ships.

This keeps the rollout deploy-order-independent: portal can deploy first, Heroes can deploy at its own pace, no flag day.

---

## Communication Checkpoints

| When | What | Status |
|------|------|--------|
| Before §01 implementation | Notify Heroes team — H1 (RS256/JWKS) is the largest piece. | **ready to send 2026-04-27** — portal-side §01+§02 merged, JWKS endpoint live; Heroes can begin H1. See "Heroes notification" below. |
| §01+§02 portal merged (dual-mode HS256+ES256, JWKS + discovery live) | Heroes can begin H1 verification swap. | **merged 2026-04-27** — full dual-mode signing path; `/api/.well-known/jwks.json` and `/api/.well-known/openid-configuration` serving; HS256 mint uses legacy issuer `coms-portal-broker`, ES256 mint uses URL-form `${ORIGIN}/broker`, verifier accepts both. Bootstrap script: `bun run --cwd apps/api scripts/bootstrap-signing-key.ts`. Admin rotation: `POST /api/v1/admin/signing-keys/rotate`. coms-shared bumped to `v1.2.0` with widened `PortalBrokerHandoffResponse` (`tokenHs256` + `tokenEs256`). |
| §01/§02 portal deployed (JWKS endpoint serving) | Heroes can begin H1 verification swap. | pending — awaiting CI deploy after merge. Bootstrap is automatic: `.github/workflows/deploy.yml` runs `scripts/bootstrap-signing-key.ts` (idempotent) immediately after `db:migrate` on every push to `main`, using repo variable `GCP_PROJECT_ID` (set to `fbi-dev-484410`). |
| Heroes H1 deployed | Portal can drop HS256 minting. | pending — Day-30 follow-up, out of this mission |
| §03 portal merged (dual-mode HMAC+OIDC dispatch) | Heroes can begin H2. | **merged 2026-04-27** — webhook dispatcher emits `Authorization: Bearer <google-id-token>` alongside HMAC headers when GCP metadata reachable; graceful HMAC-only fallback in local dev. `verifyGoogleIdToken` exported from `oidc-verifier.ts` for receiver use. |
| §03 portal deployed | Heroes can begin H2. | pending — awaiting CI deploy |
| §04 portal merged (dual-mode secret+OIDC introspect) | Heroes can begin H3. | **merged 2026-04-27** — `app_registry.service_account_email` column added (migration 0020); `/broker/introspect` tries OIDC bearer first, falls through to legacy secret; admin UI field on app detail page. Heroes SA email needs to be populated in the DB before H3 ships. |
| §04 portal deployed | Heroes can begin H3. | pending — awaiting CI deploy + Heroes SA email population in `app_registry`. **Runbook:** see `spec-04-introspect-oidc-auth.md` §"Runbook — Heroes service account email population" for the exact admin-UI / SQL steps and how to look up the Heroes SA email value. |
| All specs deployed | Final audit: confirm all `PORTAL_*_SECRET` env vars unset on both sides. | pending — Day-30 follow-up |

### Heroes notification (sample message)

> Rev 2 portal-side §01–§04 merged on 2026-04-27. Once portal CI deploys, Heroes can begin all four handoff items in any order — every spec is dual-mode on the portal side, so existing HS256 broker tokens, HMAC webhooks, and shared-secret introspect calls continue to work. Read `docs/architecture/rev2/heroes-team-handoff.md` (mirror in coms-aha-heroes/docs/architecture/rev2/) for H1/H2/H3/H4. JWKS endpoint: `https://coms.ahacommerce.net/.well-known/jwks.json`. Discovery: `/.well-known/openid-configuration`. Coordinate the Heroes SA email population in `app_registry.service_account_email` with the portal admin before H3 deploy.

---

## Rev 1 Carryover

Rev 1 Spec 05 is **partially landed** as of 2026-04-27:

**Done (in `apps/api/src/services/`):**
- `oidc-verifier.ts` — Google OIDC ID-token verifier for Cloud Tasks / Pub/Sub callbacks
- `cloud-tasks-client.ts` — REST client for enqueueing webhook delivery tasks
- `health-probe.ts` — per-app health probe service
- `apps/web` runtime adapter: `@sveltejs/adapter-node` is wired in `svelte.config.js` and `package.json`

**Outstanding (still on `apps/web`):**
- ~~SSR enablement: `apps/web/src/routes/+layout.ts` still has `ssr = false` (client-only). Flip to SSR-on for the layout/routes that actually need server rendering. Adapter is already correct.~~ **Done 2026-04-27** — `ssr = false` line removed; SvelteKit defaults to SSR-on. No per-route overrides needed.

**Deferred from Rev 1 §05 (deliberately deprioritised, not a Rev 2 prerequisite):**
- Cloud Scheduler trigger wiring for the health probe.
- Removal of the in-process interval-driven health probe (`startHealthProbeInterval()` in `apps/api/src/index.ts`).

  **Reason:** at current scale (one relying-party app, daytime traffic) the in-process `setInterval` is operationally adequate. The two failure modes Cloud Scheduler would fix — (a) probes stopping silently when Cloud Run scales to zero during idle windows, (b) duplicate probes when Cloud Run scales to ≥2 instances — are theoretical today. The migration costs ~1 hour of Terraform + IAM and adds a GCP resource to maintain, in exchange for benefits that only manifest with multi-app federation or sustained idle periods. Revisit when **either** a second relying-party app onboards (duplication starts to matter) **or** the admin UI begins showing stale `lastHealthCheckAt` during idle hours (scale-to-zero is biting). Until then, keep the in-process interval. None of Rev 2 §01–§04 depends on this work.

Rev 2 §03 reuses the already-landed `oidc-verifier.ts` — its prerequisite is therefore already satisfied in code. The SSR-enablement flip on `apps/web` is independent of every Rev 2 spec and can ship before, after, or alongside §01.

---

## Files Modified Across Rev 2 (Summary)

### Portal

| File | Spec |
|------|------|
| `apps/api/src/db/schema/signing-keys.ts` (new) | 01 |
| `apps/api/src/services/signing-keys.ts` (new) | 01 |
| `apps/api/src/services/auth-broker.ts` | 01 |
| `apps/api/src/routes/well-known.ts` (new) | 01, 02 |
| `apps/api/src/services/webhook-dispatcher.ts` | 03 |
| `apps/api/src/services/oidc-verifier.ts` (already landed via Rev 1 §05; extend if needed) | 03, 04 |
| `apps/api/src/db/schema/apps.ts` (add `service_account_email`) | 04 |
| `apps/api/src/routes/auth.ts` | 04 |
| `infra/secrets.tf` | 01 |
| Migration: `portal_broker_signing_keys` table | 01 |
| Migration: add `app_registry.service_account_email` | 04 |
| Migration: drop `app_registry.broker_signing_secret` (post dual-mode, ~Day 30) | 01 |
| Migration: drop `app_registry.introspect_secret` (post dual-mode, §04 Day 7) | 04 |

### Heroes

| File | Spec |
|------|------|
| `packages/web/src/lib/server/portal-broker.ts` | 01 |
| `packages/server/src/routes/portal-webhooks.ts` | 03 |
| `packages/web/src/lib/server/portal-introspect.ts` | 04, 05 |
| `packages/web/src/lib/server/oidc.ts` (new) | 03, 04 |
| `infra/modules/cloud-run/main.tf` | 03, 04 (SA permissions) |
