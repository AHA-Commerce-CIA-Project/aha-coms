# Spec 04 — Resilience

> **Status: IMPLEMENTED, ONE GAP (2026-04-26)** — §1 stale-while-revalidate is shipped in Heroes (`packages/web/src/lib/server/portal-introspect.ts:15-19, 87-92, 113-120`). §2 health probe service and §3 dashboard degraded state are shipped in portal. The §1 alerting escalation (severity bump on threshold crossing + Cloud Monitoring alert policy) is **NOT** implemented and is tracked in Rev 2 spec-05.

> Priority: **4 (availability)**
> Scope: Portal (health checks, dashboard) + Heroes (introspect resilience)
> Prerequisites: None

---

## Overview

The portal is a hard dependency for all relying-party apps. If it goes down:

- Users can't log in (expected — the portal is the IdP)
- Users who are already logged in to a service lose session validation within 30 seconds (unexpected — they should be able to continue working)
- The dashboard shows app cards with no awareness of whether the target app is actually running

This spec addresses three gaps: introspect resilience, health probing, and degraded state display.

---

## 1. Introspect Fail-Degraded Policy

### Current State

Heroes validates sessions by calling the portal's `/api/auth/broker/introspect` endpoint. The logic is in `coms_aha_heroes/packages/web/src/lib/server/portal-introspect.ts`:

```typescript
const CACHE_TTL_MS = 30_000        // 30s cache
const RETRY_DELAYS_MS = [200, 600, 1200]  // 3 retries

// On success: cache for 30s
// On 503: retry up to 3 times
// On exhausted retries: throw PortalIntrospectUnavailableError
```

When the portal is unreachable for > ~32 seconds (30s cache + retry delays), the `PortalIntrospectUnavailableError` propagates through the auth hooks and blocks all authenticated routes.

Heroes already creates a local session (`createLocalSessionForPortalUser` in `packages/shared/src/auth/session.ts`). The local session has a 7-day TTL. The introspect call is a liveness check — "is this session still valid at the portal level?"

### Target State

When the portal is unreachable, Heroes degrades gracefully:

- Cached introspect results continue to be trusted for an extended grace period
- New sessions that were validated within the grace window continue to work
- A warning is logged but auth doesn't hard-fail

### Approach: Stale-While-Revalidate

Modify the introspect client in Heroes to use a two-tier cache:

```
FRESH_TTL  = 30s     (current behavior — actively re-validate)
STALE_TTL  = 5min    (grace period — trust cached result if portal is down)
```

```typescript
// Pseudocode for the modified introspect flow
async function introspectSession(args) {
  const cached = cache.get(sessionId)

  if (cached && cached.freshUntil > Date.now()) {
    // Fresh — return immediately, no network call
    return cached.result
  }

  if (cached && cached.staleUntil > Date.now()) {
    // Stale — try to revalidate, but fall back to cached if portal is down
    try {
      const result = await fetchIntrospectWithRetry(args)
      cache.set(sessionId, { result, freshUntil: now + FRESH_TTL, staleUntil: now + STALE_TTL })
      return result
    } catch (err) {
      if (err instanceof PortalIntrospectUnavailableError) {
        console.warn('[portal-introspect] portal unreachable, serving stale result for session', sessionId)
        return cached.result
      }
      throw err
    }
  }

  // No cache — must fetch (first request for this session)
  const result = await fetchIntrospectWithRetry(args)
  cache.set(sessionId, { result, freshUntil: now + FRESH_TTL, staleUntil: now + STALE_TTL })
  return result
}
```

### Cache Entry Shape

```typescript
type CacheEntry = {
  result: IntrospectResult
  freshUntil: number   // Date.now() + 30_000
  staleUntil: number   // Date.now() + 300_000
}
```

### Edge Cases

| Scenario | Behavior |
|---|---|
| Portal down, session in fresh cache | Served from cache, no network call |
| Portal down, session in stale cache | Served from stale cache with warning log |
| Portal down, session not in cache | Fails — user must re-authenticate (cannot validate unknown sessions) |
| Portal returns `active: false` | Cached immediately, session revoked |
| Portal down, stale cache says `active: false` | Session stays revoked (conservative — don't un-revoke) |

### Security Consideration

Stale-while-revalidate introduces a window where a revoked session might still be honored (up to 5 minutes). This is an acceptable tradeoff:

- The portal's webhook system (`session.revoked`) pushes revocations to Heroes independently of introspect
- The 5-minute window is bounded and logged
- The alternative (hard failure) denies service to all users when the portal has a transient outage

### Alerting on Stale-Serve

When a stale cache result is served, the `console.warn` log is necessary but not sufficient — if the portal is down for minutes, ops needs to know. Heroes should:

- Emit a structured log with `severity: 'WARNING'` when serving a stale result
- If stale-serves exceed a threshold (e.g. 5 in a 2-minute window), escalate to `severity: 'ERROR'`
- Create a Cloud Monitoring alert policy on the escalated log to page the on-call team

Without alerting, a 5-minute stale-serve window is invisible unless someone checks the logs manually.

---

## 2. App Health Check System

### Current State

`app_registry` has a `lastVerifiedAt` column (`apps/api/src/db/schema/apps.ts:28`) but nothing writes to it. The dashboard shows all active apps regardless of health.

### Target State

The portal periodically probes each registered app's health endpoint and records the result.

### Schema Change

Add a health status column to `app_registry`:

```sql
ALTER TABLE app_registry
ADD COLUMN health_status VARCHAR(20) NOT NULL DEFAULT 'unknown';

ALTER TABLE app_registry
ADD COLUMN last_health_check_at TIMESTAMPTZ;

ALTER TABLE app_registry
ADD COLUMN last_health_error TEXT;

COMMENT ON COLUMN app_registry.health_status IS
  'Last known health: unknown, healthy, degraded, unhealthy';
```

Drizzle schema in `apps/api/src/db/schema/apps.ts`:

```typescript
healthStatus: varchar('health_status', { length: 20 }).notNull().default('unknown'),
lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
lastHealthError: text('last_health_error'),
```

### Health Probe Logic

New service: `apps/api/src/services/health-probe.ts`

```typescript
export async function probeAppHealth(app: { id: string; url: string; slug: string }): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  error?: string
}> {
  const healthUrl = new URL('/api/health', app.url).toString()

  try {
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (res.ok) return { status: 'healthy' }
    if (res.status === 404) return { status: 'unknown', error: 'No /api/health endpoint' }
    if (res.status >= 500) return { status: 'unhealthy', error: `HTTP ${res.status}` }
    return { status: 'degraded', error: `HTTP ${res.status}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'unhealthy', error: message }
  }
}

export async function probeAllApps(): Promise<void> {
  const apps = await db
    .select({ id: appRegistry.id, url: appRegistry.url, slug: appRegistry.slug })
    .from(appRegistry)
    .where(eq(appRegistry.status, 'active'))

  const results = await Promise.allSettled(
    apps.map(async (app) => {
      const result = await probeAppHealth(app)
      await db.update(appRegistry).set({
        healthStatus: result.status,
        lastHealthCheckAt: new Date(),
        lastHealthError: result.error ?? null,
        lastVerifiedAt: result.status === 'healthy' ? new Date() : undefined,
      }).where(eq(appRegistry.id, app.id))
    })
  )

  const healthy = results.filter(r => r.status === 'fulfilled').length
  console.log(`[health-probe] checked ${apps.length} apps, ${healthy} succeeded`)
}
```

### Trigger Mechanism

**Option A: Internal cron (simple, good for now)**

Add a periodic probe in the API server startup, similar to the webhook delivery worker:

```typescript
// In apps/api/src/index.ts
if (process.env.NODE_ENV !== 'test') {
  startWebhookDeliveryWorker()
  startHealthProbeInterval()  // Every 60 seconds
}
```

**Option B: Cloud Scheduler (production-grade)**

Create a Cloud Scheduler job that calls `POST /api/v1/admin/health-probe` every 60 seconds. The endpoint triggers `probeAllApps()`. This survives scale-to-zero because the Scheduler's HTTP call wakes the instance.

### Recommendation

Start with Option A. Move to Option B when the webhook worker moves to Cloud Tasks (Spec 05). Both changes are part of the same "externalize background work" migration.

> **Action item:** Track the Option A → Option B migration in Spec 05's scope. The health probe has the same scale-to-zero problem as the webhook worker — when Cloud Run scales to zero, the `setInterval` stops and health statuses go stale. Adding a Cloud Scheduler job for the health probe should be a step in Spec 05's implementation order.

### API Endpoint

Add an admin-only endpoint for manual health checks:

```
POST /api/v1/admin/health-probe   — Trigger immediate health check of all apps
GET  /api/v1/admin/health-status  — Return health status of all apps
```

---

## 3. Dashboard Degraded State

### Current State

`apps/web/src/lib/components/app-card.svelte` renders all apps the same way regardless of health.

### Target State

The app card shows a visual indicator when an app is unhealthy or in an unknown state.

### Dashboard API Change

The dashboard endpoint (`apps/api/src/routes/dashboard.ts`) should include `healthStatus` in its response:

```typescript
// Add to the dashboard query:
healthStatus: appRegistry.healthStatus,
lastHealthCheckAt: appRegistry.lastHealthCheckAt,
```

### UI Change

`apps/web/src/lib/components/app-card.svelte`:

```svelte
<!-- Add health indicator to the card -->
{#if app.healthStatus === 'unhealthy'}
  <div class="mt-2 flex items-center gap-1 text-xs text-red-500">
    <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
    Unavailable
  </div>
{:else if app.healthStatus === 'degraded'}
  <div class="mt-2 flex items-center gap-1 text-xs text-yellow-500">
    <span class="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
    Degraded
  </div>
{:else if app.healthStatus === 'unknown'}
  <div class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
    <span class="h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
    Status unknown
  </div>
{/if}
```

Unhealthy apps should still be clickable (the app may be partially functional), but the indicator sets expectations.

---

## Implementation Order

1. **Schema migration** — add `healthStatus`, `lastHealthCheckAt`, `lastHealthError` to `app_registry`
2. **Health probe service** — `apps/api/src/services/health-probe.ts`
3. **Probe trigger** — interval in server startup + admin API endpoint
4. **Dashboard API** — include health status in response
5. **App card UI** — degraded state indicator
6. **Heroes introspect resilience** — stale-while-revalidate (Heroes team work)

Steps 1-5 are portal. Step 6 is Heroes (see `heroes-team-handoff.md`).

---

## Files Modified

### Portal

| File | Change |
|------|--------|
| `apps/api/src/db/schema/apps.ts` | Add health columns |
| `apps/api/src/services/health-probe.ts` | New: probe logic + interval |
| `apps/api/src/routes/dashboard.ts` | Include `healthStatus` in response |
| `apps/web/src/lib/components/app-card.svelte` | Health indicator |
| `apps/web/src/lib/queries/dashboard.ts` | Updated query type |
| New migration file | `drizzle-kit generate` |

### Heroes (see handoff doc)

| File | Change |
|------|--------|
| `packages/web/src/lib/server/portal-introspect.ts` | Stale-while-revalidate cache |
