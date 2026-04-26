# Heroes Team Handoff — Architecture Rev 2

> **From:** COMS Portal team
> **To:** COMS Heroes team
> **Date:** 2026-04-26
> **Repo:** `coms-aha-heroes`
> **Rev 1 retrospective:** `../rev1/heroes-team-handoff.md` (all done)

---

## What's Happening

Rev 2 closes out the symmetric-shared-secret surfaces between portal and Heroes. After Rev 2, the only secrets in play are Google's own SA credentials (managed by Google) and the portal's private signing key (only portal has it). Three of the four `PORTAL_*_SECRET` env vars Heroes ships with today are deleted.

Most of Rev 2 is portal-internal. **Four items require changes in the Heroes repo.** This document explains what, why, and in what order. All four are small (each smaller than Rev 1's H1/H2/H3).

All portal-side specs are in `coms-portal/docs/architecture/rev2/`. Mirror copies live in `coms-aha-heroes/docs/architecture/rev2/`.

---

## Summary of Heroes Changes

| # | Change | Spec | Blocking? | Effort | Removes env var |
|---|--------|------|-----------|--------|-----------------|
| H1 | Verify broker tokens via JWKS (RS256/ES256) | Rev 2 Spec 01 + 02 | Portal must ship JWKS first | Small (~2h) | `PORTAL_BROKER_SIGNING_SECRET` |
| H2 | Verify webhook auth via Google OIDC | Rev 2 Spec 03 | Portal must ship dual-mode dispatcher first | Small (~2h) | `PORTAL_WEBHOOK_SIGNING_SECRET` |
| H3 | Send introspect requests with Google OIDC | Rev 2 Spec 04 | Portal must ship dual-mode introspect first | Small (~1h) | `PORTAL_INTROSPECT_SECRET` |
| H4 | Stale-serve alerting escalation | Rev 2 Spec 05 | None — independent | Small (~2h) | n/a |

Total estimated effort: ~1 day. Each item is independent and can ship at Heroes' pace because the portal ships in dual-mode every time.

---

## H1: Verify Broker Tokens via JWKS

### Why

Today the Heroes web layer verifies broker tokens with `jwtVerify(token, HMACsecret)`. The shared secret means a leaked Heroes env var lets an attacker forge tokens for Heroes. Rev 2 Spec 01 switches the portal to ES256 with public-key verification — Heroes verifies against a public key fetched from `https://coms.ahacommerce.net/.well-known/jwks.json`. No shared secret.

### What to Do

In `packages/web/src/lib/server/portal-broker.ts` (or wherever `jwtVerify` is called for broker tokens):

```typescript
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL(`${env.PORTAL_ORIGIN}/.well-known/jwks.json`),
  { cooldownDuration: 30_000, cacheMaxAge: 600_000 },
)

const ACCEPTED_ISSUERS = [
  'coms-portal-broker',                          // legacy (Rev 1)
  `${env.PORTAL_ORIGIN}/broker`,                 // new (Rev 2 Spec 02)
]

async function verifyBrokerToken(token: string) {
  const { alg } = decodeProtectedHeader(token)

  if (alg === 'ES256') {
    return jwtVerify(token, JWKS, {
      issuer: ACCEPTED_ISSUERS,
      audience: env.PORTAL_TOKEN_AUDIENCE,
      algorithms: ['ES256'],
      clockTolerance: '30s',
    })
  }

  if (alg === 'HS256') {
    // Legacy path; remove after portal drops HS256 minting.
    const secret = new TextEncoder().encode(env.PORTAL_BROKER_SIGNING_SECRET)
    return jwtVerify(token, secret, {
      issuer: ACCEPTED_ISSUERS,
      audience: env.PORTAL_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: '30s',
    })
  }

  throw new Error(`Unsupported alg: ${alg}`)
}
```

### When

Portal will publish a "JWKS endpoint live" notification when Spec 01 deploys. From that moment Heroes can ship H1 — the portal will be emitting both ES256 and HS256 tokens during dual-mode, so existing verification continues to work and the new path is exercised on every login.

### After

Once `[broker-verify] alg=ES256` shows up in 100% of Heroes logs, the portal team will drop HS256 minting (Day 7 in the migration timeline). At that point Heroes can:

- Remove the HS256 branch from `verifyBrokerToken`.
- Remove `PORTAL_BROKER_SIGNING_SECRET` from Cloud Run env and Secret Manager.
- Remove the `coms-portal-broker` legacy issuer from `ACCEPTED_ISSUERS` (Day 30).

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

Expected: no matches in source after the dual-mode periods complete. The only remaining `PORTAL_*` references should be `PORTAL_ORIGIN`, `PORTAL_APP_SLUG`, `PORTAL_TOKEN_AUDIENCE`, `PORTAL_SERVICE_ACCOUNT_EMAIL`, `SELF_PUBLIC_URL`.

---

## Questions / Blockers

If anything is unclear:

1. **What's the exact portal SA email?** — Confirm with portal team before populating `PORTAL_SERVICE_ACCOUNT_EMAIL` env var. Should be `coms-portal-run-sa@<portal-project-id>.iam.gserviceaccount.com` or whatever name the portal Cloud Run service runs as.
2. **What's the canonical `aud` for portal calls from Heroes?** — Should be `${PORTAL_ORIGIN}` exactly. If portal moves domains, both sides update simultaneously.
3. **Local dev story for H2/H3** — devs without ADC will need to continue running with the legacy secret path during the dual-mode period. After dual-mode, local dev requires either ADC or a separate dev-only relaxed verification mode (out of scope for Rev 2).
4. **Heroes SA email change** (rare): treat as a coordinated rotation — portal admin updates `app_registry.service_account_email` first, Heroes redeploys with new SA second. During the gap, the legacy secret path keeps things working (during dual-mode) or there's a short outage (after dual-mode retires).

Reach out to the portal team with answers or any other questions before starting implementation.
