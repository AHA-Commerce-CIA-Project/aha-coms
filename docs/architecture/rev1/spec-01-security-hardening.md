# Spec 01 — Security Hardening

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

### Current State

The broker launch endpoint in `apps/api/src/routes/auth.ts:171-207`:

```typescript
.get(
  '/broker/launch/:appSlug',
  async ({ request, params, query, set }) => {
    const authUser = await resolveSessionUser(request)
    const app = await findBrokerAppBySlug(params.appSlug)
    const handoff = await createBrokerHandoff(app, authUser, query.redirectTo)
    return new Response(null, { status: 302, headers: { Location: handoff.redirectUrl } })
  },
)
```

This is a GET endpoint that:
1. Reads the `__session` cookie (automatic — `SameSite=Lax` allows GET)
2. Creates a one-time auth handoff code
3. 302-redirects the browser to the target app with the code in the URL

A malicious page on the same site (or a user tricked into clicking a link) could trigger `GET /api/auth/broker/launch/evil-app` and silently redirect the user to a registered app with a valid handoff code.

`SameSite=Lax` mitigates cross-origin attacks (the cookie isn't sent on cross-origin navigation triggered by non-top-level requests), but same-site attacks remain possible.

### Target State

Convert the dashboard app-card launch flow from a direct `<a href>` GET to a form-based POST with a CSRF token.

### Approach: State-Changing Action = POST

**Option A (recommended): Convert to POST**

1. Change the dashboard's `app-card.svelte` (`apps/web/src/lib/components/app-card.svelte`) from an `<a>` tag to a `<form method="POST">` that submits to `/api/auth/broker/launch/:appSlug`
2. The route handler at `apps/api/src/routes/auth.ts` changes from `.get(...)` to `.post(...)`
3. `SameSite=Lax` now fully protects: cross-origin POSTs don't send the cookie

```svelte
<!-- Before -->
<a href={launchHref}>...</a>

<!-- After -->
<form method="POST" action="/api/auth/broker/launch/{app.slug}">
  {#if redirectTo}
    <input type="hidden" name="redirectTo" value={redirectTo} />
  {/if}
  <button type="submit" class="...">...</button>
</form>
```

**Option B: CSRF token on GET (more complex, less benefit)**

Mint a short-lived CSRF token in the dashboard page load, embed in the launch URL as a query param, verify server-side. This adds state management complexity for marginal gain over Option A.

### Recommendation

Option A. The semantic meaning of "launch an app" is a state-changing action (it creates a handoff code and consumes a redirect). POST is correct.

### Migration

The `GET /api/auth/broker/launch/:appSlug` endpoint is also referenced in external documentation. Keep the GET endpoint temporarily but have it return `405 Method Not Allowed` with a message pointing to the POST endpoint, or redirect to the dashboard if no valid session.

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

## Implementation Order

1. **Schema migration** — add both columns (`broker_signing_secret`, `introspect_secret`) to `app_registry` in a single migration
2. **Per-app broker keys** — update `auth-broker.ts` with fallback to env var
3. **Per-app introspect secrets** — update introspect endpoint with fallback to env var + timing-safe comparison
4. **CSRF on launch** — convert GET to POST, update `app-card.svelte`
5. **Data migration** — populate columns for existing apps, distribute new secrets
6. **Deprecate global env vars** — remove fallbacks once all apps have per-app secrets

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
