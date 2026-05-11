# Rev 2 — Spec 03: Webhook Auth via Google OIDC Service-to-Service Tokens

> Priority: **3 (depends on Rev 1 Spec 05's OIDC verifier code)**
> Scope: Portal (sender) + Heroes (receiver)
> Prerequisites: Rev 1 Spec 05 (Cloud Tasks rollout introduces `OAuth2Client.verifyIdToken()` machinery we'll reuse)

---

## Overview

Today the portal signs every outbound webhook with HMAC-SHA256 using `PORTAL_WEBHOOK_SIGNING_SECRET`. The receiver computes the same HMAC and compares (timing-safe) with the `X-Portal-Signature` header. This works but carries the same drawbacks as broker HS256:

- Symmetric secret distributed to every receiver
- Per-app rotation requires distributing a new secret
- A leaked receiver env var lets an attacker impersonate the portal to that receiver

Google Cloud Run service-to-service authentication via OIDC ID tokens solves this without us having to manage any signing keys at all:

1. **Portal-side:** the Cloud Run service uses Google's metadata server to mint an ID token with `aud = receiver URL`. No code, no key, no secret — Google issues it from the runtime's service account identity.
2. **Receiver-side:** verify the ID token via `google-auth-library`'s `OAuth2Client.verifyIdToken()`, then check the `email` claim matches the portal's known service account email.
3. **Replay protection:** ID tokens carry `iat`/`exp` (1 hour TTL by default). Combine with the existing portal `eventId` dedup table for full at-most-once semantics.

Net effect: `PORTAL_WEBHOOK_SIGNING_SECRET` is gone from every system. No rotation required ever — Google rotates the underlying SA signing material on its own schedule.

---

## How Google OIDC Service-to-Service Works

When Cloud Run service A calls Cloud Run service B:

```
A: GET http://metadata.google.internal/.../identity?audience=https://service-b.run.app
   → returns a Google-signed JWT with:
       iss = https://accounts.google.com
       aud = https://service-b.run.app
       email = service-a@project.iam.gserviceaccount.com
       email_verified = true
       sub = <SA numeric ID>
       iat / exp (1h)

A: POST https://service-b.run.app/api/foo
   Authorization: Bearer <JWT>

B: verifies JWT signature against Google's well-known JWKS
B: checks iss + aud + exp
B: trusts the email claim — that's the caller's identity
```

This is what Pub/Sub push subscriptions, Cloud Scheduler HTTP targets, and Cloud Tasks all use under the hood. Rev 1 Spec 05's Cloud Tasks delivery endpoint already implements the receiver side; this spec generalizes it to outbound webhooks.

---

## Portal-Side: Token Minting

Currently `apps/api/src/services/webhook-dispatcher.ts` does:

```typescript
const signature = createHmac('sha256', secret)
  .update(`${timestamp}.${body}`)
  .digest('hex')

await fetch(endpoint.url, {
  headers: {
    'X-Portal-Signature': `sha256=${signature}`,
    'X-Portal-Timestamp': timestamp,
    ...
  },
  body,
})
```

Becomes:

```typescript
import { GoogleAuth } from 'google-auth-library'

const auth = new GoogleAuth()

async function mintAudienceToken(audience: string): Promise<string> {
  // GoogleAuth picks up the metadata-server identity automatically on Cloud Run.
  // Locally during dev, falls back to ADC.
  const client = await auth.getIdTokenClient(audience)
  const headers = await client.getRequestHeaders()
  // headers.Authorization === `Bearer <id-token>`
  return headers.Authorization!.slice(7)  // strip 'Bearer '
}

async function dispatchWebhook(endpoint: WebhookEndpoint, event: PortalEvent) {
  const audience = new URL(endpoint.url).origin
  const idToken = await mintAudienceToken(audience)

  await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'X-Portal-Event': event.event,
      'X-Portal-Event-Id': event.eventId,
      'X-Portal-Timestamp': new Date().toISOString(),
      // During dual-mode: keep emitting the legacy HMAC headers too.
      'X-Portal-Signature': legacyHmacSignature,
    },
    body: JSON.stringify(event.payload),
  })
}
```

### Token caching

Google ID tokens are valid for 1 hour. `getIdTokenClient` caches internally — repeated calls for the same audience reuse the token until it's near expiry. No code changes needed; the SDK does the right thing.

### Audience format

`audience = new URL(endpoint.url).origin` — e.g. `https://coms-aha-heroes-app-45tyczfska-et.a.run.app` or `https://heroes.ahacommerce.net`. The receiver's verifier checks `aud` matches *its own* hostname.

If a receiver has multiple ingress hostnames (Cloud Run default URL + custom domain), the dispatcher should use the URL the receiver expects — store the canonical URL in `app_registry.url`. Already there; no schema change.

---

## Receiver-Side: Token Verification

`apps/api/src/services/oidc-verifier.ts` (new, shared between webhook and introspect contexts):

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
    throw new Error(`Token email mismatch: expected ${opts.expectedSAEmail}, got ${payload?.email}`)
  }
  return { email: payload.email, sub: payload.sub! }
}
```

### Heroes-Side Changes (H2)

`coms-aha-heroes/packages/server/src/routes/portal-webhooks.ts`:

```typescript
const PORTAL_SA_EMAIL = process.env.PORTAL_SERVICE_ACCOUNT_EMAIL!
// e.g. 'coms-portal-run-sa@coms-portal-prod.iam.gserviceaccount.com'

const SELF_AUDIENCE = process.env.SELF_PUBLIC_URL!
// e.g. 'https://coms-aha-heroes-app-45tyczfska-et.a.run.app'

export const portalWebhooksRoute = new Elysia().post(
  '/webhooks/portal',
  async ({ request, set }) => {
    const authHeader = request.headers.get('authorization')

    let authenticatedVia: 'oidc' | 'hmac' | null = null

    // --- Try OIDC first ---
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.slice(7)
        await verifyGoogleIdToken({
          idToken,
          expectedAudience: SELF_AUDIENCE,
          expectedSAEmail: PORTAL_SA_EMAIL,
        })
        authenticatedVia = 'oidc'
      } catch (err) {
        // Fall through to HMAC during dual-mode.
        // After HMAC retired, return 401 here.
      }
    }

    // --- Fall back to legacy HMAC (during dual-mode period) ---
    if (!authenticatedVia) {
      const ok = verifyLegacyHmac(request)
      if (!ok) {
        set.status = 401
        return { message: 'unauthorized' }
      }
      authenticatedVia = 'hmac'
      console.log(`[portal-webhook] authenticated via legacy HMAC — migrate sender to OIDC`)
    }

    // ... existing event-handling logic unchanged ...
  },
)
```

Logging the dual-mode path (`authenticatedVia`) lets us watch for when the legacy HMAC code path stops being used; that's the signal to retire the secret.

---

## Replay Protection

**Existing:** receiver dedups by `eventId` via `portal_webhook_events` table (5-min skew window on `X-Portal-Timestamp` header).

**With OIDC:** the ID token's own `iat`/`exp` provide skew protection (1 hour window enforced by `verifyIdToken`). Keep the `eventId` dedup — OIDC prevents impersonation but does nothing for duplicate deliveries (which Cloud Tasks retries can produce).

**Compatibility:** still send `X-Portal-Event-Id` and `X-Portal-Event` headers as today. The HMAC `X-Portal-Signature` and `X-Portal-Timestamp` headers are kept during dual-mode and dropped after.

---

## IAM Setup

For Heroes to verify ID tokens minted with `aud = heroes-url`, no IAM changes are needed — `verifyIdToken` only needs network access to Google's JWKS. Heroes already has that.

For the portal SA to mint ID tokens, the SA needs no special role — token minting from the metadata server is a built-in capability of any Cloud Run workload.

The one IAM concern: ID tokens are minted with the audience as the only authorization claim. **Anyone who can run as a Cloud Run service in the same project can mint a token with any audience.** Verifying the `email` claim against a known SA list closes this — that's already in the receiver code above.

If/when a third app onboards in a different GCP project, this still works; cross-project ID token verification is fine.

---

## Migration Plan

```
Day 0 — Portal: ship dual-mode webhook dispatcher (OIDC + HMAC headers).
              No receiver changes yet.

Day 1 — Heroes: H2 ships dual-mode receiver (OIDC preferred, HMAC fallback).
              Watch the `authenticatedVia` log to confirm OIDC path is exercised.

Day 7 — Portal: confirm logs show only OIDC succeeding for Heroes.
              Drop HMAC headers from dispatcher (per-endpoint flag if multi-app).

Day 14 — Portal: drop `webhook_signing_secret` columns / Secret Manager secrets
              for app endpoints that have migrated.

Day 30 — Portal: drop the HMAC sign code path entirely.
              Heroes drops the HMAC verify code path entirely.
              `PORTAL_WEBHOOK_SIGNING_SECRET` env var unset on both sides.
```

---

## What This Removes

- `PORTAL_WEBHOOK_SIGNING_SECRET` env var from every receiver.
- Secret Manager entries for per-endpoint webhook signing secrets (if those exist; check `apps/api/src/db/schema/app-webhook-endpoints.ts`).
- HMAC computation code in both dispatcher and receivers.
- Manual rotation procedure for webhook secrets.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Portal SA email changes (re-deploy with new SA) | `expectedSAEmail` is config in receiver; update in env. |
| Cloud Run cold start, metadata server slow | `getIdTokenClient` has internal retry; if unavailable, dispatch fails — Cloud Tasks (Rev 1 Spec 05) will retry. |
| Receiver behind a custom domain | Use the canonical URL the receiver expects as audience. Stored in `app_registry.url`. |
| Token expires mid-retry | Each retry re-fetches via `getIdTokenClient` (cached until 5 min before expiry). |
| Receiver in a different GCP project | No change. Cross-project verification works via Google's global JWKS. |

---

## Files Modified

### Portal

| File | Change |
|------|--------|
| `apps/api/src/services/webhook-dispatcher.ts` | Dual-mode: emit OIDC `Authorization: Bearer` + legacy HMAC headers |
| `apps/api/src/services/oidc-verifier.ts` | New (or extend Rev 1 Spec 05 version): shared OIDC token verifier |
| `apps/api/src/db/schema/app-webhook-endpoints.ts` | Remove `signingSecret` column after migration |
| `apps/api/package.json` | `google-auth-library` dependency (likely already present after Spec 05) |

### Heroes (see Rev 2 handoff)

| File | Change |
|------|--------|
| `packages/server/src/routes/portal-webhooks.ts` | Dual-mode auth: try OIDC, fall back to HMAC |
| `packages/web/src/lib/server/oidc.ts` | New: shared OIDC verifier (used by §03 and §04) |
| `package.json` | Add `google-auth-library` |
| `infra/modules/cloud-run/main.tf` | Set `PORTAL_SERVICE_ACCOUNT_EMAIL` and `SELF_PUBLIC_URL` env vars |
| Env: `PORTAL_WEBHOOK_SIGNING_SECRET` | Retired after dual-mode period |

---

## Success Criteria

1. Portal webhooks include `Authorization: Bearer <google-id-token>` header.
2. Heroes verifies ID token signature, audience, and SA email; rejects all three failure modes (bad sig, wrong aud, wrong email).
3. Logs in Heroes show `authenticatedVia: 'oidc'` for all portal webhooks; HMAC path unused.
4. `PORTAL_WEBHOOK_SIGNING_SECRET` env var removed from both portal and Heroes.
5. Webhook dedup via `eventId` continues to work; replay test produces a single side-effect.
