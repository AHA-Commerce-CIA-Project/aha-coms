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

1. **Rev 1 Spec 05** — SSR migration, Cloud Tasks, Cloud Scheduler health probe (already planned).
2. **Rev 2 Spec 01** — RS256 + JWKS. Biggest leverage; before any third-app onboarding.
3. **Rev 2 Spec 02** — OIDC discovery. Trivial once §01 ships.
4. **Rev 2 Spec 03** — Webhook auth via Google OIDC. Reuses OIDC verifier patterns.
5. **Rev 2 Spec 04** — Introspect auth via Google OIDC. Mirror of §03 for the inbound direction.
6. **Rev 2 Spec 05** — Heroes alerting escalation. Can land any time; cheapest item.

§02, §03, §05 can run in parallel after §01 is done.

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

| When | What |
|------|------|
| Before §01 implementation | Notify Heroes team — H1 (RS256/JWKS) is the largest piece. |
| §01 portal deployed (dual-mode HS256+RS256) | Heroes can begin H1 verification swap. |
| Heroes H1 deployed | Portal can drop HS256 minting. |
| §03 portal deployed (dual-mode HMAC+OIDC) | Heroes can begin H2. |
| §04 portal deployed (dual-mode secret+OIDC) | Heroes can begin H3. |
| All specs deployed | Final audit: confirm all `PORTAL_*_SECRET` env vars unset on both sides. |

---

## Rev 1 Carryover

Rev 1 Spec 05 is not yet started:

- SSR migration (`adapter-static` → `adapter-node`)
- Cloud Tasks for webhook delivery
- Cloud Scheduler-driven health probe
- Remove in-process worker + health probe interval

This is portal-only and independent of Rev 2 specs — but Rev 2 §03 builds on the OIDC verifier code that Rev 1 §05 introduces for Cloud Tasks. Sequence Rev 1 Spec 05 → Rev 2 Spec 03.

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
| `apps/api/src/services/oidc-verifier.ts` (new — shared) | 03, 04 |
| `apps/api/src/routes/auth.ts` | 04 |
| `infra/secrets.tf` | 01 |
| New migrations | 01 |

### Heroes

| File | Spec |
|------|------|
| `packages/web/src/lib/server/portal-broker.ts` | 01 |
| `packages/server/src/routes/portal-webhooks.ts` | 03 |
| `packages/web/src/lib/server/portal-introspect.ts` | 04, 05 |
| `packages/web/src/lib/server/oidc.ts` (new) | 03, 04 |
| `infra/modules/cloud-run/main.tf` | 03, 04 (SA permissions) |
