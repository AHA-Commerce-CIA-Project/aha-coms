# Heroes Team Handoff — Architecture Rev 2

> **From:** COMS Portal team
> **To:** COMS Heroes team
> **Date:** 2026-04-26 (handoff issued); 2026-04-27 (Heroes implementation merged, deployed, verified, and Day-30 cleanup landed)
> **Repo:** `coms-aha-heroes`
> **Rev 1 retrospective:** `../rev1/heroes-team-handoff.md` (all done)
> **Rev 2 status:** all four items closed; H3 confirmed live on portal side via synthetic introspect; Day-30 cleanup (legacy HMAC + introspect-secret paths removed) merged 2026-04-27 — see "Implementation status & deferred follow-ups" at the bottom.

---

## What's Happening

Rev 2 closes out the symmetric-shared-secret surfaces between portal and Heroes. After Rev 2, the only secrets in play are Google's own SA credentials (managed by Google) and the portal's private signing key (only portal has it). Three of the four `PORTAL_*_SECRET` env vars Heroes ships with today are deleted.

Most of Rev 2 is portal-internal. **Four items require changes in the Heroes repo.** This document explains what, why, and in what order. All four are small (each smaller than Rev 1's H1/H2/H3).

All portal-side specs are in `coms-portal/docs/architecture/rev2/`. Mirror copies live in `coms-aha-heroes/docs/architecture/rev2/`.

---

## Summary of Heroes Changes

| # | Change | Spec | Status | Effort | Removes env var |
|---|--------|------|--------|--------|-----------------|
| H1 | Verify broker tokens via JWKS (RS256/ES256) | Rev 2 Spec 01 + 02 | **closed (no code change)** — broker-JWT path retired by commit `0dbab9c` before this mission; original objective preserved (no shared HMAC secret on broker tokens) | n/a | `PORTAL_BROKER_SIGNING_SECRET` removed from deploy workflow 2026-04-27 |
| H1' | OIDC bearer on the exchange call (opportunistic) | new — see §H1' below | **merged 2026-04-27** (`821ec0f`) — caller auth on `exchangePortalCode` reusing H3's helper | ~10 min on top of H3 | n/a |
| H2 | Verify webhook auth via Google OIDC | Rev 2 Spec 03 | **merged 2026-04-27** (`20a9cff`); HMAC fallback removed Day-30 cleanup 2026-04-27 | Small (~2h) | `PORTAL_WEBHOOK_SIGNING_SECRET` removed from deploy workflow 2026-04-27 |
| H3 | Send introspect requests with Google OIDC | Rev 2 Spec 04 | **closed 2026-04-27** (`821ec0f`) — synthetic introspect at 07:47:20 UTC logged `[introspect] via:oidc app:heroes` on portal side, no legacy-secret warning; legacy header removed Day-30 cleanup 2026-04-27 | Small (~1h) | `PORTAL_INTROSPECT_SECRET` removed from deploy workflow 2026-04-27 |
| H4 | Stale-serve alerting escalation | Rev 2 Spec 05 | **merged 2026-04-27** (`40309d2`) | Small (~2h) | n/a |

Total estimated effort: ~1 day. Each item is independent and can ship at Heroes' pace because the portal ships in dual-mode every time.

---

## H1: Verify Broker Tokens via JWKS — **closed in tree (no code change)**

### What changed in the meantime

The handoff was drafted on the assumption that `packages/web/src/lib/server/portal-broker.ts` still called `jwtVerify(token, HMACsecret)` against a broker-minted JWT. That path was retired by commit `0dbab9c` ("Fix broker exchange to use portal response directly, not JWT") **before** this Rev 2 mission began.

Today's `exchangePortalCode` (`packages/web/src/lib/server/portal-broker.ts:74-95`) just POSTs the one-time `portal_code` to `${PORTAL_ORIGIN}/api/auth/broker/exchange` and accepts the verified session payload as plain JSON over HTTPS. There is no JWT for Heroes to verify, in either HMAC or JWKS form.

### What this means

- **Original objective preserved.** A leaked Heroes env var no longer forges sessions — there is no broker secret to leak.
- **Trust model.** TLS for transport + one-time `portal_code` bound to `appSlug` and `redirect_uri` for authorization. This is OAuth-authorization-code-grant security, the same baseline a public OIDC client uses.
- **What was lost.** The prior broker-JWT design gave Heroes asymmetric verification of the *response payload*. Even if portal-side emitted bad session data, signature check would have caught it. The current design trusts whatever JSON arrives over TLS. This is a real defense-in-depth regression but not a blocker — see "Deferred follow-ups → Remediation #2" at the bottom of this doc.
- **What we did instead.** Caller-side OIDC was added to the exchange call (see §H1' below) using H3's helper. It does not restore response-payload integrity but it does tighten caller authentication beyond "whoever holds the code."

### Day-30 cleanup carryover

- Confirm `PORTAL_BROKER_SIGNING_SECRET` and `PORTAL_TOKEN_AUDIENCE` are not set in any deployment surface (Cloud Run env, Secret Manager, `.env` files). Already absent from source — verify the runtime configuration matches.

---

## H1' (opportunistic): OIDC Bearer on the Exchange Call

### Why

The exchange call (`exchangePortalCode` in `packages/web/src/lib/server/portal-broker.ts:74-95`) historically carried no caller-auth header — the one-time `portal_code` was the entire trust anchor. While that satisfies the OAuth code-grant model, attaching a Google ID token costs nothing extra (the helper already exists for H3, the audience is the same `PORTAL_ORIGIN`, the SA is the same Heroes Cloud Run SA), and it gives the portal a future option to enforce caller identity on the exchange endpoint without another Heroes deploy.

### What shipped (commit `821ec0f`)

`exchangePortalCode` reuses the shared `getOidcAuthHeader` helper from `packages/web/src/lib/server/google-oidc.ts` and attaches `Authorization: Bearer <google-id-token>` opportunistically:

- When token mint succeeds, the bearer header is added.
- When mint fails (no ADC, network error, etc.), the call is sent without the bearer header — preserving today's unauthenticated-call behaviour on the portal side. A single `[google-oidc]` warning is logged per audience (deduped by Set).
- No legacy header is sent or required (the exchange endpoint never had one).

### Status

Live as of `821ec0f`. Will be silently exercised whenever ADC is available; harmless when not.

### Future work (deferred — see "Remediation #2" below)

Even with H1' in place, the exchange *response* is unsigned. To restore the integrity property the original broker-JWT design had, the portal would need to wrap the session payload as a JWS using the JWKS keys and Heroes would verify with `createRemoteJWKSet`. That is portal-side work coordinated separately; tracked under deferred follow-ups.

---

## H2: Verify Webhook Auth via Google OIDC

### Why

Today `packages/server/src/routes/portal-webhooks.ts:22-37` computes an HMAC-SHA256 with `PORTAL_WEBHOOK_SIGNING_SECRET` and compares with the `X-Portal-Signature` header. Rev 2 Spec 03 swaps this for Google ID token verification, eliminating the shared secret.

### What to Do

Add a shared OIDC verifier helper at `packages/web/src/lib/server/oidc.ts` (or `packages/server/src/lib/oidc.ts` — wherever fits the layout):

```typescript
import { OAuth2Client } from 'google-auth-library'

const oauth2 = new OAuth2Client()

export async function verifyGoogleIdToken(opts: {
  idToken: string
  expectedAudience: string
  expectedSAEmail: string
}): Promise<{ email: string; sub: string }> {
  const ticket = await oauth2.verifyIdToken({
    idToken: opts.idToken,
    audience: opts.expectedAudience,
  })
  const payload = ticket.getPayload()
  if (!payload?.email_verified || payload.email !== opts.expectedSAEmail) {
    throw new Error(
      `Token email mismatch: expected ${opts.expectedSAEmail}, got ${payload?.email}`,
    )
  }
  return { email: payload.email, sub: payload.sub! }
}
```

Update `portal-webhooks.ts` to authenticate via OIDC first, fall back to HMAC during dual-mode:

```typescript
const PORTAL_SA_EMAIL = process.env.PORTAL_SERVICE_ACCOUNT_EMAIL!
const SELF_AUDIENCE = process.env.SELF_PUBLIC_URL!

// inside the route handler, before existing event-dispatch logic:
const authHeader = request.headers.get('authorization')
let authenticatedVia: 'oidc' | 'hmac' | null = null

if (authHeader?.startsWith('Bearer ')) {
  try {
    await verifyGoogleIdToken({
      idToken: authHeader.slice(7),
      expectedAudience: SELF_AUDIENCE,
      expectedSAEmail: PORTAL_SA_EMAIL,
    })
    authenticatedVia = 'oidc'
  } catch { /* fall through during dual-mode */ }
}

if (!authenticatedVia) {
  // existing HMAC verification
  const ok = verifyPortalSignature({ ... })
  if (!ok) {
    set.status = 401
    return { message: 'invalid signature' }
  }
  authenticatedVia = 'hmac'
  console.log('[portal-webhook] authenticated via legacy HMAC — migrate sender to OIDC')
}
```

### Add Two Env Vars

```hcl
# infra/modules/cloud-run/main.tf
env {
  name  = "PORTAL_SERVICE_ACCOUNT_EMAIL"
  value = "coms-portal-run-sa@coms-portal-prod.iam.gserviceaccount.com"  # confirm with portal team
}

env {
  name  = "SELF_PUBLIC_URL"
  value = "https://coms-aha-heroes-app-45tyczfska-et.a.run.app"  # or custom domain when live
}
```

`SELF_PUBLIC_URL` must match exactly what the portal sets as `aud` when minting the ID token — the portal computes it from `app_registry.url`.

### Add Dependency

```bash
bun add google-auth-library
```

### When

Portal ships dual-mode dispatch first. From then on Heroes can ship H2; portal continues sending both `Authorization: Bearer` and HMAC headers until Heroes deploys, after which portal drops HMAC.

---

## H3: Send Introspect Requests with Google OIDC

### Why

`packages/web/src/lib/server/portal-introspect.ts:39-52` calls portal introspect with `x-portal-introspect-secret: <shared-secret>`. Rev 2 Spec 04 swaps this for Google ID token caller authentication.

### What to Do

In `portal-introspect.ts`:

```typescript
import { GoogleAuth } from 'google-auth-library'

const auth = new GoogleAuth()

async function fetchIntrospect(args: { userId: string; sessionIssuedAt: string }) {
  const { origin, secret, appSlug } = requireEnv()

  // Mint an ID token for the portal's audience
  const client = await auth.getIdTokenClient(origin)
  const oidcHeaders = await client.getRequestHeaders()

  return fetch(`${origin}/api/auth/broker/introspect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': oidcHeaders.Authorization!,
      // Keep sending the legacy header during dual-mode
      'x-portal-introspect-secret': secret,
    },
    body: JSON.stringify({ userId: args.userId, sessionIssuedAt: args.sessionIssuedAt, appSlug }),
  })
}
```

`getIdTokenClient` caches tokens (~55min) — there's no per-request token mint after the first one.

### Local Development

When running locally with no SA, `GoogleAuth` falls back to ADC. Devs need either:

- `gcloud auth application-default login` (and grant their personal account `roles/run.invoker` on the portal), or
- Continue using the legacy secret in `.env.local` during dual-mode (works fine).

### When

Portal ships dual-mode introspect (accepts OIDC or secret) first; Heroes can ship any time after.

### After

Portal team will populate `app_registry.service_account_email = "coms-aha-heroes-run-sa@..."` for Heroes. Confirm with the portal team that the value matches the SA you actually run as before deploying H3.

Once portal logs show `via: oidc` for 100% of Heroes calls (~Day 7), portal drops the secret-accept code and column. Heroes can then drop:

- `PORTAL_INTROSPECT_SECRET` env var
- `x-portal-introspect-secret` header from `fetchIntrospect`
- The `secret` field from `requireEnv()`

---

## H4: Stale-Serve Alerting Escalation

### Why

Rev 1 Spec 04 §1 required severity escalation on sustained stale-serves; Heroes shipped the cache but not the escalation. Today a multi-minute portal outage is invisible until users start hard-failing.

### What to Do

See Rev 2 Spec 05 (`./spec-05-stale-serve-alerting.md`) for full implementation. Summary:

1. Add a 2-minute ring buffer to `portal-introspect.ts` counting stale-serves.
2. When count crosses 3, log with `severity: 'ERROR'` instead of `'WARNING'`.
3. Hard-fail (no cache + portal down) always logs `severity: 'ERROR'`.
4. Add two Cloud Monitoring alert policies in `infra/modules/monitoring/main.tf` keyed off the structured log messages.

### When

Independent of any portal change. Can ship anytime.

---

## Order

The portal team will deploy Rev 2 specs in this order:

1. Rev 1 Spec 05 (SSR + Cloud Tasks) — portal-only carryover
2. Rev 2 Spec 01 (RS256 + JWKS) → unblocks Heroes H1
3. Rev 2 Spec 02 (OIDC discovery) → no Heroes work; H1 already covers the issuer rename
4. Rev 2 Spec 03 (webhook OIDC) → unblocks Heroes H2
5. Rev 2 Spec 04 (introspect OIDC) → unblocks Heroes H3

Each portal deploy enters dual-mode. Heroes can ship H1/H2/H3 in any order after the matching portal deploy lands; H4 is independent throughout.

---

## Verification After All Items Ship

Run from the Heroes repo root:

```bash
grep -r "PORTAL_.*_SECRET" --include="*.ts" --include="*.tf" --include="*.json" .
```

Expected: no matches in source after the dual-mode periods complete. The only remaining `PORTAL_*` references should be `PORTAL_ORIGIN`, `PORTAL_APP_SLUG`, `PORTAL_SERVICE_ACCOUNT_EMAIL`, `SELF_PUBLIC_URL`. (`PORTAL_TOKEN_AUDIENCE` was associated with the retired broker-JWT path and is no longer needed; verify it is unset.)

**Today (2026-04-27, post Day-30 cleanup):** Day-30 cleanup landed the same day H3 closed (portal team had already retired acceptance, soak window waived by mission lead). Audit grep has been re-run and returns zero `PORTAL_*_SECRET`, `PORTAL_TOKEN_AUDIENCE`, `verifyPortalSignature`, `X-Portal-Signature`, or `x-portal-introspect-secret` matches in source.

---

## Implementation status & deferred follow-ups

### Status as of 2026-04-27

| Item | Commit | Validation |
|------|--------|------------|
| H1 (closed in tree, no code change) | `0dbab9c` (pre-mission) | `jwtVerify` and `createRemoteJWKSet` appear zero times in source; `PORTAL_BROKER_SIGNING_SECRET` and `PORTAL_TOKEN_AUDIENCE` appear zero times in source |
| H1' (opportunistic exchange OIDC) | `821ec0f` | `bun run typecheck` (packages/web) clean |
| H2 (webhook OIDC verifier) | `20a9cff` | `bun run typecheck` (packages/server) clean |
| H3 (introspect OIDC sender) | `821ec0f` | `bun run typecheck` (packages/web) clean; portal-side log confirmation 2026-04-27 07:47:20 UTC (`[introspect] via:oidc app:heroes`) |
| H4 (stale-serve alerting + monitoring TF) | `40309d2` | `bun run typecheck` clean; `tofu validate` (infra/modules/monitoring) clean |
| CI/CD perf (bun cache + buildx GHA cache) | `8e10b79` | exercised on next push |

### Operational gate before H3 fully exercises the OIDC path — **closed 2026-04-27**

Heroes' Cloud Run SA email is **`coms-aha-heroes-run-sa@fbi-dev-484410.iam.gserviceaccount.com`** (derived from `infra/modules/cloud-run/main.tf:4` × `infra/variables.tf` `project_id` default). The portal admin populated `app_registry.service_account_email` for the `heroes` row on 2026-04-27. A synthetic introspect call (impersonated SA, ID token minted with `--include-email`) at 07:47:20.962 UTC was confirmed by the portal team to log `[introspect] via:oidc app:heroes` with no legacy-secret warning — H3 is officially closed.

Historical procedure (kept for reference / future apps):

1. Heroes team — share the SA email with the portal admin.
2. Portal admin — set the value via the admin UI or SQL: `UPDATE app_registry SET service_account_email = 'coms-aha-heroes-run-sa@fbi-dev-484410.iam.gserviceaccount.com' WHERE slug = 'heroes';`

### Deferred follow-ups

Each item below is filed in this doc rather than deleted from the captain's log so future operators inherit an explicit list. Day-30 items completed inline on 2026-04-27 once the portal team confirmed legacy acceptance was retired; soak window was deliberately waived by the mission lead.

#### Pre-Day-30 — partially superseded by early cleanup

1. ~~**Structured-log key + alert on OIDC→HMAC silent fallback (webhook receiver).**~~ **Moot post-cleanup** — there is no longer an HMAC fallback path to silently route to. OIDC verification failure now returns 401 directly. If equivalent observability is still wanted on OIDC verification *failure* (without fallback), promote the `console.warn` line at `packages/server/src/routes/portal-webhooks.ts` to a stable `message` key (e.g. `portal-webhook-oidc-failed`) and alert on it.
2. **`notification_rate_limit` on the two H4 alert policies.** `condition_matched_log` does not self-throttle the way `condition_threshold` does; during a sustained outage with ≥2 replicas, the existing policies could page repeatedly. Add `alert_strategy { notification_rate_limit { period = "300s" } }` to both new policies. **Still valid — independent of cleanup.**
3. **Re-key the dedupe Set in `google-oidc.ts`.** Today keyed by audience only, collapsing distinct failure modes (no creds vs. transient gaxios error vs. IAM revocation) into a single one-shot warning per process. Re-key by `${audience}|${error.code ?? error.name}` or add a TTL. **Still valid — independent of cleanup.**

#### Day-30 cleanup mission — **completed 2026-04-27**

4. ✅ **Done.** HMAC fallback branch removed from `packages/server/src/routes/portal-webhooks.ts` along with `verifyPortalSignature`, `createHmac`/`timingSafeEqual` imports, the `X-Portal-Signature`/`X-Portal-Timestamp` validation, and the 5-min skew check. `PORTAL_WEBHOOK_SIGNING_SECRET` and `PORTAL_BROKER_SIGNING_SECRET` removed from `.github/workflows/deploy.yml --set-secrets` (both staging and production deploys); Secret Manager secrets `portal-webhook-signing-secret` and `portal-broker-signing-secret` left in place pending one final ops cleanup pass.
5. ✅ **Done.** `x-portal-introspect-secret` header dropped from `fetchIntrospect` and `secret` field removed from `requireEnv()` in `packages/web/src/lib/server/portal-introspect.ts`. `PORTAL_INTROSPECT_SECRET` removed from `.github/workflows/deploy.yml`; Secret Manager secret `portal-introspect-secret` left in place pending ops cleanup pass.
6. ✅ **Done.** 401 error message in `portal-introspect.ts` rewritten to reference OIDC failure: "Portal introspection auth rejected (401) — verify Heroes Cloud Run SA matches portal app_registry.service_account_email".
7. **Deferred — no custom domain yet.** Replace the literal `SELF_PUBLIC_URL` value in `infra/modules/cloud-run/main.tf` (and the deploy workflow) with a reference to a custom-domain output once one exists. Today the value is `https://coms-aha-heroes-app-45tyczfska-et.a.run.app`; if the auto-generated suffix changes, OIDC verification will start 401-ing every webhook until updated.
8. **Deferred — no rotation planned.** Confirm with the portal team that the `PORTAL_SERVICE_ACCOUNT_EMAIL` literal in the deploy workflow (`coms-portal-run-sa@coms-portal-prod.iam.gserviceaccount.com`) still matches the SA the portal Cloud Run runs as. Promote to a Terraform variable / repo variable if rotation is on the roadmap.
9. ✅ **Done.** Audit grep returns zero matches across `*.ts`, `*.tf`, `*.json`, `*.yml`, `.env*` for `PORTAL_*_SECRET`, `PORTAL_TOKEN_AUDIENCE`, `verifyPortalSignature`, `X-Portal-Signature`, and `x-portal-introspect-secret`. The only remaining `PORTAL_*` references are `PORTAL_ORIGIN`, `PORTAL_APP_SLUG`, and `PORTAL_SERVICE_ACCOUNT_EMAIL` — exactly the expected end state.

#### One-off ops cleanup (out of repo) — **completed 2026-04-27**

10. ✅ **Done.** Secret Manager secrets `portal-introspect-secret`, `portal-webhook-signing-secret`, and `portal-broker-signing-secret` deleted from project `fbi-dev-484410`. Cloud Run revision `coms-aha-heroes-app` now serves traffic with only the auth/sheets secrets bound — verified via `gcloud run services describe`. (Note: `portal-introspect-secret` had already been deleted out-of-band before this mission, which is what caused the earlier failed deploy on commit `1eb76a0`; the cleanup commit `b01023a` resolved that by removing the stale binding from the deploy workflow.)

#### Portal-side hygiene flags raised by Heroes during H3 verification (filed on portal's Day-30 list)

These are *not* Heroes work — listed here for traceability of the H3 closure conversation. Portal team confirmed both will be addressed in their Day-30 cleanup alongside dropping `PORTAL_*_SECRET` env vars and the legacy-header acceptance branch.

12. **SQL schema leak in introspect 500 response.** When `userId` does not match an `identity_users` row, the portal currently surfaces the raw SQL error in the 500 body. Portal will map unknown-user lookups to a generic 404. (Discovered via the synthetic H3 verification call.)
13. **Portal 401 ambiguity.** The portal returns the same 401 status for "OIDC verify failed" vs "missing auth header entirely". Portal will distinguish these in structured logs (and possibly in error codes) so future operator triage can tell them apart without log archaeology.

#### Deferred design (no deadline)

10. **Remediation #2 — signed exchange response.** Portal wraps the session payload returned from `/api/auth/broker/exchange` as a JWS using the JWKS keys; Heroes verifies via `createRemoteJWKSet`. Restores the asymmetric response-payload integrity property the original broker-JWT design had, and that the current TLS-only model lacks. Lower priority because (a) caller-side OIDC (H1') is already in place and (b) TLS+CA is the industry-standard trust anchor for OAuth code-grant flows; only worth the cost if defense-in-depth requirements rise. Requires a portal-side change too — coordinate as a separate spec.

#### Pre-existing nits (low priority, out of scope this mission)

11. `tofu fmt` alignment drift in the pre-existing `locals.auth_secrets` block of `infra/modules/cloud-run/main.tf`. Predates Rev 2; pick up alongside any other TF cleanup.

---

## Questions / Blockers

If anything is unclear:

1. **What's the exact portal SA email?** — Confirm with portal team before populating `PORTAL_SERVICE_ACCOUNT_EMAIL` env var. Should be `coms-portal-run-sa@<portal-project-id>.iam.gserviceaccount.com` or whatever name the portal Cloud Run service runs as.
2. **What's the canonical `aud` for portal calls from Heroes?** — Should be `${PORTAL_ORIGIN}` exactly. If portal moves domains, both sides update simultaneously.
3. **Local dev story for H2/H3** — devs without ADC will need to continue running with the legacy secret path during the dual-mode period. After dual-mode, local dev requires either ADC or a separate dev-only relaxed verification mode (out of scope for Rev 2).
4. **Heroes SA email change** (rare): treat as a coordinated rotation — portal admin updates `app_registry.service_account_email` first, Heroes redeploys with new SA second. During the gap, the legacy secret path keeps things working (during dual-mode) or there's a short outage (after dual-mode retires).

Reach out to the portal team with answers or any other questions before starting implementation.
