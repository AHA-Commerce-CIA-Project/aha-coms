# Rev 2 — Spec 04: Introspect Auth via Google OIDC Service-to-Service Tokens

> Priority: **4 (mirrors Spec 03 in the inbound direction)**
> Scope: Portal (verifier) + Heroes (caller)
> Prerequisites: Spec 03 (Heroes will already have `oidc.ts` verifier helper from §03)

---

## Overview

Spec 03 closes the portal → app webhook auth surface. This spec closes the app → portal introspect auth surface — the same pattern, opposite direction.

Today every relying-party app calls `POST /api/auth/broker/introspect` with `x-portal-introspect-secret: <shared-secret>` (Rev 1 Spec 01 §3 made this per-app, but it's still a symmetric secret distributed to each app).

After this spec: relying parties authenticate to the introspect endpoint with a Google ID token. The portal verifies the token signature against Google JWKS, checks `aud = portal-url` and `email` matches a known relying-party SA. No shared secret involved.

This **fully retires** the dual-secret rotation question from Rev 1 Spec 01 §5 — there is no introspect secret to rotate.

---

## Why This Mirrors Spec 03

Spec 03 ships:

- Portal Cloud Run mints ID tokens via metadata server with `aud = heroes-url`
- Heroes verifies via `verifyGoogleIdToken({ expectedAudience: SELF_AUDIENCE, expectedSAEmail: PORTAL_SA_EMAIL })`

This spec ships the inverse:

- Heroes Cloud Run mints ID tokens via metadata server with `aud = portal-url`
- Portal verifies via `verifyGoogleIdToken({ expectedAudience: SELF_AUDIENCE, expectedSAEmail: <looked up from app_registry> })`

The verifier helper from §03 is reused. The interesting question is: how does the portal know which SA email is allowed to call introspect for a given `appSlug`?

---

## Schema Change

Add a column to `app_registry` for the relying-party SA email:

```sql
ALTER TABLE app_registry
ADD COLUMN service_account_email VARCHAR(200);

COMMENT ON COLUMN app_registry.service_account_email IS
  'Google service account email of this app''s Cloud Run runtime. Used to authenticate the app when it calls portal endpoints (introspect, etc.) via OIDC ID tokens.';
```

Drizzle (`apps/api/src/db/schema/apps.ts`):

```typescript
serviceAccountEmail: varchar('service_account_email', { length: 200 }),
```

For Heroes, populate with `coms-aha-heroes-run-sa@<project>.iam.gserviceaccount.com` (visible in `infra/modules/cloud-run/main.tf:3`).

---

## Portal-Side: Introspect Endpoint

Currently `apps/api/src/routes/auth.ts:260-351`:

```typescript
const { userId, sessionIssuedAt, appSlug } = body
const app = await db.query.appRegistry.findFirst({
  where: eq(appRegistry.slug, appSlug),
  columns: { introspectSecret: true },
})
const expectedSecret = app.introspectSecret ?? process.env.PORTAL_INTROSPECT_SECRET
const provided = request.headers.get('x-portal-introspect-secret') ?? ''
if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expectedSecret))) {
  set.status = 401
  return { message: 'Unauthorized' }
}
```

Becomes:

```typescript
const SELF_AUDIENCE = process.env.PORTAL_PUBLIC_ORIGIN!  // e.g. https://coms.ahacommerce.net

async function authenticateIntrospectCaller(
  request: Request,
  appSlug: string,
): Promise<{ via: 'oidc' | 'secret'; ok: boolean }> {
  const app = await db.query.appRegistry.findFirst({
    where: eq(appRegistry.slug, appSlug),
    columns: { introspectSecret: true, serviceAccountEmail: true },
  })
  if (!app) return { via: 'oidc', ok: false }

  const authHeader = request.headers.get('authorization')

  // --- Try OIDC first ---
  if (authHeader?.startsWith('Bearer ') && app.serviceAccountEmail) {
    try {
      await verifyGoogleIdToken({
        idToken: authHeader.slice(7),
        expectedAudience: SELF_AUDIENCE,
        expectedSAEmail: app.serviceAccountEmail,
      })
      return { via: 'oidc', ok: true }
    } catch {
      // fall through during dual-mode
    }
  }

  // --- Fall back to legacy shared-secret header ---
  const provided = request.headers.get('x-portal-introspect-secret')
  if (provided && app.introspectSecret) {
    const ok = timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(app.introspectSecret),
    )
    if (ok) {
      console.warn(
        `[introspect] app "${appSlug}" used legacy secret auth — migrate to OIDC`,
      )
      return { via: 'secret', ok: true }
    }
  }

  return { via: 'oidc', ok: false }
}
```

Wire into the existing route handler:

```typescript
.post('/broker/introspect', async ({ request, body, set }) => {
  const { userId, sessionIssuedAt, appSlug } = body
  const auth = await authenticateIntrospectCaller(request, appSlug)
  if (!auth.ok) {
    set.status = 401
    return { message: 'Unauthorized' }
  }
  // ... existing introspect logic ...
})
```

---

## Heroes-Side: Caller Changes (H3)

`coms-aha-heroes/packages/web/src/lib/server/portal-introspect.ts` `fetchIntrospect()`:

```typescript
import { GoogleAuth } from 'google-auth-library'

const auth = new GoogleAuth()

async function getPortalAuthHeader(portalOrigin: string): Promise<string> {
  const client = await auth.getIdTokenClient(portalOrigin)
  const headers = await client.getRequestHeaders()
  return headers.Authorization!  // 'Bearer <id-token>'
}

async function fetchIntrospect(args: { userId: string; sessionIssuedAt: string }) {
  const { origin, secret, appSlug } = requireEnv()
  const authHeader = await getPortalAuthHeader(origin)

  return fetch(`${origin}/api/auth/broker/introspect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': authHeader,
      // During dual-mode: keep emitting the legacy header so portal can
      // accept either. After portal drops the secret path, remove this line
      // and the env var.
      'x-portal-introspect-secret': secret,
    },
    body: JSON.stringify({
      userId: args.userId,
      sessionIssuedAt: args.sessionIssuedAt,
      appSlug,
    }),
  })
}
```

The `requireEnv()` helper continues to require `PORTAL_INTROSPECT_SECRET` during dual-mode; after migration, that env var becomes optional and is eventually deleted.

`getIdTokenClient()` caches tokens for ~55 minutes; the introspect path will mostly hit a warm token. First call after a cold start incurs one metadata-server round-trip (~5–20ms).

---

## Local Development

Locally, `GoogleAuth` falls back to Application Default Credentials (ADC). Developers running Heroes against a local portal need to either:

- Use the legacy secret path (works during dual-mode, indefinitely if you keep `PORTAL_INTROSPECT_SECRET` in `.env.local`).
- Or run `gcloud auth application-default login` and grant the personal account the same `roles/run.invoker` permission on the portal that the Heroes SA has.

Document this in the Heroes README during H3 rollout.

---

## Migration Plan

```
Day 0 — Portal: ship dual-mode introspect (OIDC + secret).
              `app_registry.service_account_email` populated for Heroes.
              Heroes still calling with secret only.

Day 1 — Heroes: H3 ships dual-mode caller (OIDC + secret headers).
              Verify portal logs show `via: oidc` for Heroes calls.

Day 7 — Portal: drop `x-portal-introspect-secret` accepting code.
              Drop `app_registry.introspect_secret` column.
              Drop `PORTAL_INTROSPECT_SECRET` env var.

Day 30 — Heroes: stop sending `x-portal-introspect-secret` header.
              Drop `PORTAL_INTROSPECT_SECRET` env var.
              Drop the legacy code path entirely.
```

---

## What This Removes

- `app_registry.introspect_secret` column (Drizzle migration to drop).
- `PORTAL_INTROSPECT_SECRET` env var on both portal and Heroes Cloud Run configs.
- Secret distribution / rotation procedure for introspect.
- The `?? process.env.PORTAL_INTROSPECT_SECRET` fallback chain from Rev 1 Spec 01.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Heroes SA changes | Portal admin updates `app_registry.service_account_email` for the heroes row. |
| Portal `PORTAL_PUBLIC_ORIGIN` changes (rare) | Heroes' next `getIdTokenClient(newOrigin)` call mints a new-audience token. No coordination needed beyond updating Heroes env. |
| Token verification fails because clock-skew | `verifyIdToken` allows 60s skew by default. Increase if Cloud Run regional clocks drift more than that (extremely rare). |
| Heroes introspect after portal SA change but before column updated | OIDC fails (email mismatch); during dual-mode the secret path keeps it working. After dual-mode retires, this becomes a hard outage on misconfiguration — make the column update part of the SA-rotation runbook. |
| Stale-while-revalidate cache (Rev 1 Spec 04 §1) | Unchanged. The OIDC swap is purely an authentication mechanism change; the caching, retry, and SWR semantics are untouched. |

---

## Interaction with Stale-While-Revalidate (Rev 1 Spec 04 §1)

Heroes already serves stale cache when the portal returns 503 / network error. If portal-side OIDC verification rejects a token (returns 401), Heroes should **not** treat 401 as portal-down — it's a deterministic auth misconfiguration. The existing 401 handler in `portal-introspect.ts:96-99` already short-circuits cleanly:

```typescript
if (res.status === 401) {
  console.error('[portal-introspect] 401 from portal — auth misconfigured')
  throw new Error('Portal introspection auth rejected (401)')
}
```

That branch will newly fire if (a) `service_account_email` is wrong in the portal DB, or (b) Heroes SA changed without the column update. Spec 05 alerting will catch repeated 401s.

---

## Files Modified

### Portal

| File | Change |
|------|--------|
| `apps/api/src/db/schema/apps.ts` | Add `serviceAccountEmail` column |
| `apps/api/src/routes/auth.ts` | Dual-mode introspect auth (OIDC + secret) |
| `apps/api/src/services/oidc-verifier.ts` | Reused from Spec 03; no new code |
| New migration | `service_account_email` column |
| Follow-up migration (Day 7) | Drop `introspect_secret` column |
| Admin UI | Field for setting/viewing `service_account_email` per app |

### Heroes (see Rev 2 handoff)

| File | Change |
|------|--------|
| `packages/web/src/lib/server/portal-introspect.ts` | `fetchIntrospect()` mints ID token; sends both Authorization and legacy secret during dual-mode |
| `packages/web/src/lib/server/oidc.ts` | Reused from Spec 03 |
| Env: `PORTAL_INTROSPECT_SECRET` | Optional during dual-mode; retired after |
| README | Local dev instructions for ADC |

---

## Success Criteria

1. `app_registry.service_account_email` populated for all active apps.
2. Heroes introspect calls carry `Authorization: Bearer <google-id-token>`.
3. Portal logs show `via: oidc` for 100% of Heroes introspect calls; legacy path unused.
4. `PORTAL_INTROSPECT_SECRET` env var removed from both portal and Heroes.
5. After all Rev 2 specs deployed: a `grep PORTAL_.*_SECRET infra/ apps/ packages/` over both repos returns nothing.
