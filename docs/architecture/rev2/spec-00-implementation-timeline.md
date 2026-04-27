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
| Heroes H1 deployed | Portal can drop HS256 minting. | **closed in tree (no Heroes code change) 2026-04-27** — broker-JWT verification path was retired by Heroes commit `0dbab9c` *before* Rev 2 began; `jwtVerify` no longer appears anywhere in Heroes source. The original H1 objective (no shared HMAC broker secret on Heroes) is preserved by that earlier refactor. Portal can therefore drop HS256 broker minting on the §01 Day-30 schedule independently of any further Heroes work. See `coms-aha-heroes/docs/architecture/rev2/heroes-team-handoff.md` §H1 for the trust-model analysis. |
| Heroes H1' (opportunistic OIDC bearer on exchange call) | n/a — Heroes-side defense-in-depth | **merged 2026-04-27** (Heroes commit `821ec0f`) — same `GoogleAuth` helper as H3 attaches `Authorization: Bearer` to `exchangePortalCode`. Opportunistic; absent ADC the call still succeeds unauthenticated as before. |
| §03 portal merged (dual-mode HMAC+OIDC dispatch) | Heroes can begin H2. | **merged 2026-04-27** — webhook dispatcher emits `Authorization: Bearer <google-id-token>` alongside HMAC headers when GCP metadata reachable; graceful HMAC-only fallback in local dev. `verifyGoogleIdToken` exported from `oidc-verifier.ts` for receiver use. |
| §03 portal deployed | Heroes can begin H2. | pending — awaiting CI deploy |
| Heroes H2 deployed (webhook OIDC verifier) | Portal can drop HMAC dispatch on the §03 Day-30 schedule. | **merged 2026-04-27** (Heroes commit `20a9cff`) — `packages/server/src/lib/oidc.ts` + dual-mode receiver in `packages/server/src/routes/portal-webhooks.ts`. Awaiting Heroes CI deploy; cache-warmed CI/CD optimizations also landed (`8e10b79`). |
| §04 portal merged (dual-mode secret+OIDC introspect) | Heroes can begin H3. | **merged 2026-04-27** — `app_registry.service_account_email` column added (migration 0020); `/broker/introspect` tries OIDC bearer first, falls through to legacy secret; admin UI field on app detail page. Heroes SA email needs to be populated in the DB before H3 ships. |
| §04 portal deployed | Heroes can begin H3. | pending — awaiting CI deploy + Heroes SA email population in `app_registry`. **Runbook:** see `spec-04-introspect-oidc-auth.md` §"Runbook — Heroes service account email population" for the exact admin-UI / SQL steps and how to look up the Heroes SA email value. |
| Heroes H3 deployed (introspect OIDC sender) | Portal can drop legacy `x-portal-introspect-secret` acceptance on the §04 Day-30 schedule. | **merged 2026-04-27** (Heroes commit `821ec0f`) — `packages/web/src/lib/server/google-oidc.ts` shared singleton; `fetchIntrospect` carries both bearer and legacy secret during dual-mode. Heroes SA email still needs portal-admin population: `coms-aha-heroes-run-sa@fbi-dev-484410.iam.gserviceaccount.com`. Until populated, portal silently falls through to the legacy path and the OIDC migration is not actually exercised. |
| Heroes H4 deployed (stale-serve alerting) | n/a — Heroes-only operational hardening | **merged 2026-04-27** (Heroes commit `40309d2`) — 2-min ring buffer + structured WARNING/ERROR severity in `portal-introspect.ts`; two new `google_monitoring_alert_policy` resources in `infra/modules/monitoring/main.tf`. |
| All specs deployed | Final audit: confirm all `PORTAL_*_SECRET` env vars unset on both sides. | pending — Day-30 follow-up. Heroes-side checklist tracked in `coms-aha-heroes/docs/architecture/rev2/heroes-team-handoff.md` §"Implementation status & deferred follow-ups". |

### Heroes notification (sample message)

> Rev 2 portal-side §01–§04 is **deployed** to production as of 2026-04-27 (CI run `24977680477`). All four Heroes-side items — **H1, H2, H3, and H4** — are now unblocked and can ship in any order at your team's pace. Every portal-side spec is dual-mode, so existing HS256 broker tokens, HMAC webhooks, and shared-secret introspect calls continue to work unchanged.
>
> Read `docs/architecture/rev2/heroes-team-handoff.md` (a mirror copy is in `coms-aha-heroes/docs/architecture/rev2/`) for the per-item briefs, code snippets, and effort estimates. Quick references:
>
> | Item | Spec | Effort | Independent? |
> |---|---|---|---|
> | **H1** — Verify broker tokens via JWKS (ES256 + dual-issuer accept) | Rev 2 §01+§02 | ~2h | unblocked now |
> | **H2** — Verify webhook auth via Google OIDC | Rev 2 §03 | ~2h | unblocked now |
> | **H3** — Send introspect requests with Google OIDC | Rev 2 §04 | ~1h | **blocked on a one-time data step — see below** |
> | **H4** — Stale-serve alerting escalation | Rev 2 §05 | ~2h | always independent of portal; can ship anytime |
>
> Live endpoints to point your verifier at:
> - JWKS: `https://coms.ahacommerce.net/.well-known/jwks.json`
> - OIDC discovery: `https://coms.ahacommerce.net/.well-known/openid-configuration`
> - Issuer (URL-form, ES256 path): `https://coms.ahacommerce.net/broker`
> - Issuer (legacy, HS256 path during dual-mode): `coms-portal-broker` — accept both via the array form per `heroes-team-handoff.md` §H1.
>
> **One operational gate before H3 deploys (not before H1/H2/H4).** Heroes introspect calls authenticated via OIDC need a matching `app_registry.service_account_email` row on the portal side, otherwise the portal silently falls through to the legacy secret path and your OIDC migration is never exercised. Two-step procedure:
>
> 1. **Heroes team:** look up your Cloud Run service account email — find `service_account_email = "..."` in `coms-aha-heroes/infra/modules/cloud-run/main.tf`, OR run `gcloud run services describe coms-aha-heroes-app --region=<region> --format='value(spec.template.spec.serviceAccountName)'`. Send the value to the portal admin.
> 2. **Portal admin:** populate `app_registry.service_account_email` for the Heroes row via the admin UI (`/admin/apps/<heroes-id>` → "Service Account Email" field) or SQL (`UPDATE app_registry SET service_account_email = '<sa>' WHERE slug = 'heroes';`). Confirm with the Heroes team that the value is set before they deploy H3.
>
> Full runbook (including verification via portal logs and the rotation procedure) is in `spec-04-introspect-oidc-auth.md` §"Runbook — Heroes service account email population".
>
> When all four items have shipped and portal logs show 100% OIDC traffic for ≥7 days, the Day-30 cleanup mission begins on the portal side: drop legacy HS256 minting, drop the legacy issuer string, drop `broker_signing_secret` and `introspect_secret` columns, unset all `PORTAL_*_SECRET` env vars on both sides. We'll coordinate that as a separate handoff.

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
