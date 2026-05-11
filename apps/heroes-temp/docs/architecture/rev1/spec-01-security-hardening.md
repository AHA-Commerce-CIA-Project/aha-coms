# Spec 01 — Security Hardening

> **Status: IMPLEMENTED (2026-04-26)** — sections §1, §2, §3 are shipped in the portal codebase. The env-var fallbacks in §4 remain enabled and §5 (dual-secret rotation) is not implemented; both are obviated by Rev 2 (RS256/JWKS removes the broker secret entirely; OIDC service-to-service for introspect removes that secret too). §6 (KMS envelope encryption) is deferred. The body is preserved as historical context.
>
> Verification:
> - `apps/api/src/db/schema/apps.ts:26-27` — `broker_signing_secret` and `introspect_secret` columns
> - `apps/api/src/services/auth-broker.ts:110-119` — per-app secret lookup with env fallback
> - `apps/api/src/routes/auth.ts:271-279` — per-app introspect with `timingSafeEqual`
> - `apps/api/src/routes/auth.ts` `/broker/launch/:appSlug` — POST-only, GET returns 405

> Priority: **1 (do first)**
> Scope: Portal only — no changes to relying-party apps
> Prerequisites: None

---

## Overview

Three security gaps must be closed before onboarding additional services:

1. **Per-app broker signing keys** — the single global `PORTAL_BROKER_SIGNING_SECRET` means a compromised service can forge tokens for every other service
2. **CSRF protection on the broker launch endpoint** — `GET /api/auth/broker/launch/:appSlug` is cookie-authenticated with no CSRF token
3. **Per-app introspect secrets** — the global `PORTAL_INTROSPECT_SECRET` means any service that knows the secret can introspect sessions for any other service

---

## 1. Per-App Broker Signing Keys

### Current State

A single HS256 secret is loaded from `process.env.PORTAL_BROKER_SIGNING_SECRET` in:

- `apps/api/src/services/auth-broker.ts:110-115` — `getBrokerSecret()` reads the env var
- Used by `signBrokerToken()` (line 146) and `exchangeBrokerHandoff()` (line 311)

All apps share this key. If any relying-party app's environment is compromised (leaked env, log exposure, etc.), an attacker can:
- Forge broker tokens with `iss: coms-portal-broker` for **any** app audience
- Mint sessions as any user in any service

### Target State

Each app gets its own HS256 signing key, stored in the `app_registry` table and looked up at handoff/exchange time.

### Schema Migration

Add column to `app_registry`:

```sql
ALTER TABLE app_registry
ADD COLUMN broker_signing_secret TEXT;

COMMENT ON COLUMN app_registry.broker_signing_secret IS
  'Per-app HS256 secret for broker token signing. NULL = app uses same_host_cookie transport and does not need a broker secret.';
```

Drizzle schema change in `apps/api/src/db/schema/apps.ts`:

```typescript
// Add to appRegistry table definition:
brokerSigningSecret: text('broker_signing_secret'),
```

### Data Migration

For existing apps currently using `token_exchange` or `one_time_code` handoff modes:

1. Generate a unique secret per app: `openssl rand -base64 32`
2. Write to the new column via SQL or the admin UI
3. Distribute the new per-app secret to each relying-party app's environment
4. Once all apps have migrated, remove the global `PORTAL_BROKER_SIGNING_SECRET` env var

Transition period: `getBrokerSecret()` falls back to the global env var if the per-app column is NULL, allowing incremental migration.

### Code Changes

**`apps/api/src/services/auth-broker.ts`**

Replace `getBrokerSecret()` (line 110-115):

```typescript
// Before
function getBrokerSecret(): Uint8Array {
  const secret = process.env.PORTAL_BROKER_SIGNING_SECRET
  if (!secret) throw new BrokerValidationError('...')
  return new TextEncoder().encode(secret)
}

// After
function getBrokerSecretForApp(app: BrokerCapableApp): Uint8Array {
  const secret = app.brokerSigningSecret ?? process.env.PORTAL_BROKER_SIGNING_SECRET
  if (!secret) {
    throw new BrokerValidationError(
      `No broker signing secret configured for app "${app.slug}". ` +
      'Set broker_signing_secret in app_registry or PORTAL_BROKER_SIGNING_SECRET as fallback.'
    )
  }
  return new TextEncoder().encode(secret)
}
```

Update `BrokerCapableApp` type to include `brokerSigningSecret`:

```typescript
type BrokerCapableApp = Pick<
  AppRegistry,
  'slug' | 'url' | 'transportMode' | 'handoffMode' | 'brokerOrigin' | 'status' | 'brokerSigningSecret'
>
```

Update `findBrokerAppBySlug()` (line 178-192) to select `brokerSigningSecret`.

Thread `app` through `signBrokerToken()` and `exchangeBrokerHandoff()` so the per-app key is used.

For `exchangeBrokerHandoff()` (line 271-325): the exchange endpoint receives `appSlug`, looks up the app, and uses its key for `jwtVerify`.

**`apps/api/src/routes/auth.ts`**

No route-level changes — the app is already looked up before calling `createBrokerHandoff()` and `exchangeBrokerHandoff()`. Just ensure `findBrokerAppBySlug()` returns the new column.

### Validation

- Apps with `transportMode = 'portable_token'` and `handoffMode != 'none'` MUST have `broker_signing_secret` set (enforced in `validateAppIntegrationMetadata()` in `apps/api/src/services/apps.ts`)
- Apps with `transportMode = 'same_host_cookie'` MAY leave it NULL

---

## 2. CSRF Protection on Broker Launch

### Current State (Implemented)

The broker launch endpoint is POST-only. `GET` returns `405 Method Not Allowed`.

The POST endpoint reads `redirectTo` from **query params** (not the request body) to avoid Elysia body-validation failures on form-encoded submissions:

```typescript
.post(
  '/broker/launch/:appSlug',
  async ({ request, params, query, set, redirect }) => {
    const authUser = await resolveSessionUser(request)
    const app = await findBrokerAppBySlug(params.appSlug)
    const handoff = await createBrokerHandoff(app, authUser, query.redirectTo)
    return redirect(handoff.redirectUrl)
  },
  { query: t.Object({ redirectTo: t.Optional(t.String()) }) },
)
```

`SameSite=Lax` fully protects: cross-origin POSTs don't send the session cookie.

### All Launch Callers

Every path that triggers a broker launch must use POST. Three caller types exist:

1. **`app-card.svelte`** — `<form method="POST">` with `redirectTo` in the action URL query string
2. **`ServiceBar.svelte`** — `<form method="POST">` (no `redirectTo`)
3. **`portal-handoff.ts` → `navigateToLaunch()`** — programmatically creates and submits a POST form for handoff intents (post-login redirect, deep-link interception)

### Design Decisions

**Why query params instead of body for `redirectTo`?**

HTML `<form method="POST">` sends hidden inputs as `application/x-www-form-urlencoded`. Elysia's `t.Object()` body schema validates against JSON — an empty form-encoded body (no inputs) fails with "Expected object". Moving `redirectTo` to query params avoids body validation entirely while keeping the POST method for CSRF protection.

**Why `navigateToLaunch()` instead of `window.location.assign()`?**

`window.location.assign(url)` performs a GET request. The old `buildLaunchUrl()` helper built GET URLs, which would hit the 405 stub. `navigateToLaunch()` creates a hidden `<form method="POST">`, sets the action URL (with `redirectTo` as a query param if present), and submits it — producing a same-origin POST that carries the session cookie.

### Migration

The `GET /api/auth/broker/launch/:appSlug` stub returns `405 Method Not Allowed` for any remaining external references.

---

## 3. Per-App Introspect Secrets

### Current State

The introspect endpoint in `apps/api/src/routes/auth.ts:260-351` validates a single global secret:

```typescript
const secret = process.env.PORTAL_INTROSPECT_SECRET
const provided = request.headers.get('x-portal-introspect-secret') ?? ''
if (provided !== secret) {
  set.status = 401
  return { message: 'Unauthorized' }
}
```

Any service that knows `PORTAL_INTROSPECT_SECRET` can introspect sessions for any user in any app. The `appSlug` in the request body is used for access-list checking but not for authenticating the caller.

### Target State

Each app gets its own introspect secret. The portal validates that the provided secret matches the target app's stored secret.

### Schema Migration

Add column to `app_registry`:

```sql
ALTER TABLE app_registry
ADD COLUMN introspect_secret TEXT;

COMMENT ON COLUMN app_registry.introspect_secret IS
  'Per-app shared secret for session introspection. NULL = introspection not enabled for this app.';
```

Drizzle schema change in `apps/api/src/db/schema/apps.ts`:

```typescript
introspectSecret: text('introspect_secret'),
```

### Data Migration

Same pattern as broker signing keys:
1. Write the current global secret value into the column for each existing app
2. Generate unique secrets for new apps going forward
3. Distribute to each service
4. Remove global env var after full migration

### Code Changes

**`apps/api/src/routes/auth.ts` — introspect endpoint (line 260-351)**

```typescript
// Before
const secret = process.env.PORTAL_INTROSPECT_SECRET
const provided = request.headers.get('x-portal-introspect-secret') ?? ''
if (provided !== secret) { ... }
const { userId, sessionIssuedAt, appSlug } = body

// After
const { userId, sessionIssuedAt, appSlug } = body

// Look up the app to get its introspect secret
const app = await db.query.appRegistry.findFirst({
  where: eq(appRegistry.slug, appSlug),
  columns: { introspectSecret: true },
})

if (!app) {
  set.status = 404
  return { message: 'App not found' }
}

const expectedSecret = app.introspectSecret ?? process.env.PORTAL_INTROSPECT_SECRET
if (!expectedSecret) {
  set.status = 503
  return { message: 'Introspection is not configured for this app' }
}

const provided = request.headers.get('x-portal-introspect-secret') ?? ''
if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expectedSecret))) {
  set.status = 401
  return { message: 'Unauthorized' }
}
```

Note: Use `timingSafeEqual` from `node:crypto` instead of `!==` for constant-time comparison (the current code uses plain string comparison, which is a minor timing side-channel).

### Validation

- Apps that set `handoffMode != 'none'` SHOULD have `introspect_secret` set (warn in admin UI, don't hard-block — some apps may not use introspection)
- The admin UI for app management should allow generating and viewing the introspect secret

---

## 4. Fallback Deprecation Enforcement

The env var fallbacks (`?? process.env.PORTAL_BROKER_SIGNING_SECRET` and `?? process.env.PORTAL_INTROSPECT_SECRET`) are temporary migration aids. To ensure they don't linger indefinitely:

- **Log a deprecation warning** every time a fallback is used, including the app slug:
  ```typescript
  console.warn(`[auth-broker] app "${app.slug}" using global PORTAL_BROKER_SIGNING_SECRET fallback — migrate to per-app secret`)
  ```
- Once all apps have per-app secrets populated, remove the fallback code paths entirely and delete the global env vars from the deployment config.

---

## 5. Secret Rotation

No rotation mechanism currently exists. If a per-app secret is compromised, the admin must update the DB column and coordinate with the relying-party app for a simultaneous switch — any gap causes auth failures.

### Future: Dual-Secret Rotation Window

When secret rotation is needed, support accepting two secrets simultaneously during a transition period:

1. Add a `broker_signing_secret_previous` column (and equivalent for introspect)
2. On verification, try the current secret first; if it fails, try the previous secret
3. Admin UI: "Rotate secret" generates a new secret, moves the current one to `_previous`, and shows the new value for the relying-party team to adopt
4. After the relying-party app has updated, clear `_previous`

This is not needed at current scale (2 apps) but becomes important as more services onboard.

---

## 6. Secrets at Rest

`broker_signing_secret` and `introspect_secret` are stored as plaintext `text` columns. If the database is compromised (leaked backup, SQL injection in a future feature), all signing keys are exposed.

### Current Mitigation

Cloud SQL encrypts data at rest by default (Google-managed keys). This protects against disk-level theft but not application-level DB access.

### Future: Application-Level Envelope Encryption

For stronger isolation, encrypt secrets with a KMS-wrapped data encryption key (DEK) before storing:

1. Generate a DEK per secret (or per app) using Cloud KMS
2. Encrypt the secret value with the DEK before writing to Postgres
3. Decrypt on read using the KEK stored in KMS
4. Only the portal's service account can call KMS — a DB dump alone is useless

Low priority at current scale but worth revisiting before onboarding apps from external teams.

---

## Implementation Order

1. **Schema migration** — add both columns (`broker_signing_secret`, `introspect_secret`) to `app_registry` in a single migration
2. **Per-app broker keys** — update `auth-broker.ts` with fallback to env var
3. **Per-app introspect secrets** — update introspect endpoint with fallback to env var + timing-safe comparison
4. **CSRF on launch** — convert GET to POST, update `app-card.svelte`
5. **Data migration** — populate columns for existing apps, distribute new secrets
6. **Deprecate global env vars** — add deprecation logging on fallback use, remove fallbacks once all apps have per-app secrets

Steps 2-4 can be done in parallel. Step 5 requires coordination with relying-party teams (see `heroes-team-handoff.md`).

---

## Files Modified (Portal)

| File | Change |
|------|--------|
| `apps/api/src/db/schema/apps.ts` | Add `brokerSigningSecret`, `introspectSecret` columns |
| `apps/api/src/services/auth-broker.ts` | Per-app secret lookup with env var fallback |
| `apps/api/src/services/apps.ts` | Validation: require broker secret for portable_token apps |
| `apps/api/src/routes/auth.ts` | Per-app introspect secret, timing-safe compare; launch POST |
| `apps/web/src/lib/components/app-card.svelte` | `<a>` → `<form method="POST">` |
| `packages/shared/src/contracts/auth.ts` | No changes needed (types are transport-agnostic) |
| New migration file | `drizzle-kit generate` for the two new columns |
