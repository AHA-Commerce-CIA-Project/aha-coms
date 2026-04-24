# Spec 05 — Architecture Improvements

> Priority: **5 (long-term)**
> Scope: Portal only
> Prerequisites: Can be done independently, but Spec 04 health probe work naturally pairs with the Cloud Tasks migration

---

## Overview

Two structural improvements to the portal's deployment model:

1. **Switch from static SPA to server-side rendering** — the portal currently builds as a static SPA and relies on client-side auth checks, causing a flash of unauthenticated content
2. **Move the webhook delivery worker to Cloud Tasks** — the in-process polling worker doesn't survive Cloud Run's scale-to-zero and creates tight coupling between the API server and background work

---

## 1. Portal SSR Migration

### Current State

The portal's web app uses `@sveltejs/adapter-static` (`apps/web/svelte.config.js:1`):

```javascript
import adapter from '@sveltejs/adapter-static'

const config = {
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
  },
}
```

The Dockerfile (`Dockerfile:25`) builds the SvelteKit app to static files, then the Elysia server serves them as a SPA with catch-all fallback:

```typescript
// apps/api/server.ts
.get('/*', async ({ set, path }) => {
  const file = Bun.file(`${STATIC_DIR}${path}`)
  if (await file.exists()) return file
  set.headers['content-type'] = 'text/html'
  return Bun.file(`${STATIC_DIR}/index.html`)
})
```

**Problem:** All route protection is client-side. The browser loads `index.html`, JavaScript executes, `fetchMe()` checks the session, and if not authenticated, redirects to `/login`. This means:

- Flash of unauthenticated content (dashboard skeleton renders before redirect)
- No server-side session validation on page load
- SEO is irrelevant (internal app), but security and UX suffer

### Target State

SvelteKit runs in SSR mode with server-side route guards. The auth check happens before any HTML is sent to the browser.

### Migration Steps

#### Step 1: Switch Adapter

Replace `adapter-static` with `adapter-node` (or a Bun-compatible adapter):

```bash
cd apps/web
bun remove @sveltejs/adapter-static
bun add @sveltejs/adapter-node
```

> **Note:** SvelteKit's `adapter-node` emits a `polka`-based Node.js server. Bun handles most Node.js APIs but edge cases exist around streaming responses, `set-cookie` header handling, and `__dirname`/`__filename` usage. Test thoroughly. If compatibility issues arise, evaluate the community `adapter-bun` package as an alternative.

Update `apps/web/svelte.config.js`:

```javascript
import adapter from '@sveltejs/adapter-node'

const config = {
  kit: {
    adapter: adapter({
      out: 'build',
    }),
    alias: {
      '$lib': './src/lib',
      '$lib/*': './src/lib/*',
      '~/*': '../api/src/*',
    },
  },
}
```

#### Step 2: Add Server-Side Auth Hook

Create `apps/web/src/hooks.server.ts`:

```typescript
import type { Handle } from '@sveltejs/kit'
import { validateSession } from '~/services/auth'

const AUTHED_PREFIX = '/(authed)'
const AUTH_TIMEOUT_MS = 3_000

export const handle: Handle = async ({ event, resolve }) => {
  const isAuthedRoute = event.route.id?.startsWith(AUTHED_PREFIX)

  if (isAuthedRoute) {
    const sessionCookie = event.cookies.get('__session')
    if (!sessionCookie) {
      return new Response(null, {
        status: 303,
        headers: { location: '/login' },
      })
    }

    // Validate session via direct function call (no loopback HTTP).
    // A timeout prevents a hung auth check from blocking the entire SSR response.
    try {
      const user = await Promise.race([
        validateSession(sessionCookie),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth validation timed out')), AUTH_TIMEOUT_MS),
        ),
      ])

      if (!user) {
        return new Response(null, {
          status: 303,
          headers: { location: '/login' },
        })
      }

      event.locals.user = user
    } catch {
      // Fail-closed: redirect to login rather than rendering authed content.
      return new Response(null, {
        status: 303,
        headers: { location: '/login' },
      })
    }
  }

  return resolve(event)
}
```

> **Design decisions:**
>
> - **Direct function import** instead of a loopback HTTP call. Both processes share the same Bun runtime (Option B), so a direct call avoids an HTTP round-trip per SSR request and eliminates hard-coded port assumptions.
> - **Timeout** (3 s) prevents a stalled auth call from producing blank pages or 500s.
> - **Fail-closed** on error: redirect to `/login` rather than rendering authenticated content. This is the safer default for an internal admin portal.

#### Step 3: Update Authed Layout

Remove client-side auth checking from `apps/web/src/routes/(authed)/+layout.svelte` — the server hook already handled it. Add a `+layout.server.ts` that passes the user from `event.locals`:

```typescript
// apps/web/src/routes/(authed)/+layout.server.ts
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  return { user: locals.user }
}
```

#### Step 4: Update Dockerfile

The Dockerfile currently builds static files and copies them to `public/`. With SSR, the SvelteKit build produces a Node.js/Bun server.

**New architecture options:**

**Option A: Two-process (recommended)**

Run the Elysia API and SvelteKit SSR as separate processes. The Elysia API serves `/api/*`, SvelteKit serves everything else. A lightweight reverse proxy (or Cloud Run's port mapping) routes between them.

```dockerfile
# SvelteKit build produces a server in apps/web/build/
# Elysia API runs on port 3001
# SvelteKit runs on port 3000 and proxies /api/* to Elysia
```

**Option B: Single-process with Elysia serving SvelteKit**

Mount SvelteKit's handler as Elysia middleware. This is tighter coupling but simpler deployment.

```typescript
// apps/api/server.ts
import { handler } from '../web/build/handler.js'

const server = new Elysia()
  .use(app)  // /api/*
  .get('/*', ({ request }) => handler(request))  // SvelteKit SSR for everything else
```

**Recommendation:** Option B for simplicity — the portal is a single Cloud Run service, and the Elysia API and SvelteKit SSR share the same session cookie. Option A is better if the team wants to scale API and SSR independently.

#### Step 5: Update Build Scripts

```json
// apps/web/package.json scripts:
{
  "build": "vite build",
  "preview": "node build"
}
```

Root `package.json` build order remains the same: shared → api → web.

### Client-Side Changes

- Remove `fetchMe()` call from client-side auth guard (it's now done server-side)
- Remove the SPA fallback logic from `apps/api/server.ts`
- Firebase client-side SDK (`apps/web/src/lib/firebase.ts`) remains for the login page (Google sign-in popup still runs in the browser)

### Risks

- **adapter-node with Bun**: SvelteKit's `adapter-node` emits a Node.js server. Bun is compatible with most Node.js APIs but edge cases exist with streaming responses and `set-cookie` handling. Test thoroughly; fall back to community `adapter-bun` if needed.
- **Route ID matching**: The hook checks `event.route.id?.startsWith('/(authed)')` which depends on SvelteKit's internal route ID format. If routes are reorganized or grouped differently, this could silently break. Pin a smoke test that asserts the route IDs match expectations.
- **Build time**: SSR builds are slower than static builds. Not a concern at this scale.

---

## 2. Webhook Worker to Cloud Tasks

### Current State

The webhook delivery worker runs as an in-process polling loop:

- Started in `apps/api/src/index.ts:18-19`: `startWebhookDeliveryWorker()`
- Polls `webhook_delivery_jobs` table every 30 seconds
- Uses `SKIP LOCKED` for multi-instance safety
- Retry cadence: 30s → 2min → disable after 3 failures

**Problems:**

1. **Scale-to-zero**: Cloud Run scales to zero instances when idle. When the last instance shuts down, the polling loop stops. Webhook retries stall until the next HTTP request wakes an instance.
2. **Cold start**: When an instance starts, the worker begins polling immediately — adding latency to the first request.
3. **Resource coupling**: The worker competes for CPU/memory with the API server on the same instance.

### Target State

Webhook delivery is handled by Cloud Tasks:
- The dispatcher enqueues a Cloud Task instead of inserting a `webhook_delivery_jobs` row
- Cloud Tasks handles retry scheduling with exponential backoff
- A dedicated HTTP endpoint receives and processes each task
- The in-process polling worker is removed

### Cloud Tasks Architecture

```
Webhook event occurs
  │
  ├── Inline attempt (same as today)
  │     ├── Success → done
  │     └── Failure → enqueue Cloud Task
  │
  └── Cloud Task enqueued
        │
        ├── Cloud Tasks calls POST /api/internal/webhook-delivery
        │     ├── Success → done
        │     └── Failure → Cloud Tasks retries automatically
        │
        └── After max retries → disable endpoint (via callback)
```

### Implementation Steps

#### Step 1: Create Cloud Tasks Queue

OpenTofu in `infra/`:

```hcl
resource "google_cloud_tasks_queue" "webhook_delivery" {
  name     = "coms-portal-webhook-delivery"
  location = var.region

  retry_config {
    max_attempts       = 3
    min_backoff        = "30s"
    max_backoff        = "300s"
    max_doublings      = 2
  }

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 5
  }
}
```

#### Step 2: Add Internal Delivery Endpoint

New route in `apps/api/src/routes/internal.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library'

const authClient = new OAuth2Client()
const TASK_SA_EMAIL = process.env.CLOUD_TASKS_SA_EMAIL!
const SERVICE_URL = process.env.SERVICE_URL!

export const internalRoutes = new Elysia({ prefix: '/internal' })
  .post('/webhook-delivery', async ({ body, request, set }) => {
    // --- OIDC token verification ---
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      set.status = 401
      return { message: 'Unauthorized' }
    }

    try {
      const ticket = await authClient.verifyIdToken({
        idToken: authHeader.slice(7),
        audience: SERVICE_URL,
      })
      const payload = ticket.getPayload()
      if (payload?.email !== TASK_SA_EMAIL) {
        set.status = 403
        return { message: 'Forbidden' }
      }
    } catch {
      set.status = 401
      return { message: 'Invalid token' }
    }

    // --- Process the delivery ---
    const { endpointId, event, eventId, jsonBody, occurredAt } = body
    // ... delivery logic from webhook-dispatcher.ts ...
  })
```

#### Step 3: Modify Dispatcher

In `apps/api/src/services/webhook-dispatcher.ts`, replace the `webhook_delivery_jobs` insert with a Cloud Tasks enqueue:

```typescript
// Before (on inline failure):
await db.insert(webhookDeliveryJobs).values({ ... })

// After:
// Use the Cloud Tasks REST API directly instead of @google-cloud/tasks SDK.
// The SDK pulls in google-gax + grpc-js (~20 MB) which is heavy for Bun;
// a single fetch call is sufficient for task creation.
const { GoogleAuth } = await import('google-auth-library')
const auth = new GoogleAuth()
const accessToken = await auth.getAccessToken()

const parent = `projects/${projectId}/locations/${region}/queues/coms-portal-webhook-delivery`
await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
  method: 'POST',
  headers: {
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${serviceUrl}/api/internal/webhook-delivery`,
        headers: { 'content-type': 'application/json' },
        body: btoa(JSON.stringify({
          endpointId: endpoint.id,
          event,
          eventId,
          jsonBody,
          occurredAt,
        })),
        oidcToken: { serviceAccountEmail: taskServiceAccount },
      },
      scheduleTime: new Date(Date.now() + 30_000).toISOString(),
    },
  }),
})
```

#### Step 4: Handle Max Retries (Dead-Letter Queue)

Cloud Tasks automatically retries based on the queue config. After `maxAttempts` failures, the task is dropped. To detect this and disable the endpoint, use a **dead-letter queue**:

> **Why not check `X-CloudTasks-TaskRetryCount`?** Checking the retry count header in the delivery endpoint and disabling on the last attempt has a race condition: Cloud Tasks may retry due to transient network issues without incrementing the attempt count, leading to premature endpoint disabling. A dead-letter queue is more robust because it only fires after Cloud Tasks has definitively given up.

```hcl
# infra/cloud-tasks.tf — add dead-letter topic
resource "google_pubsub_topic" "webhook_dlq" {
  name = "coms-portal-webhook-dlq"
}

resource "google_pubsub_subscription" "webhook_dlq_push" {
  name  = "coms-portal-webhook-dlq-push"
  topic = google_pubsub_topic.webhook_dlq.name

  push_config {
    push_endpoint = "${var.service_url}/api/internal/webhook-dlq"
    oidc_token {
      service_account_email = var.task_service_account
    }
  }
}
```

Add a DLQ handler endpoint:

```typescript
// apps/api/src/routes/internal.ts
.post('/webhook-dlq', async ({ body, request, set }) => {
  // Verify OIDC token (same pattern as /webhook-delivery)
  // ...

  // Decode the original task payload from the Pub/Sub message
  const message = JSON.parse(Buffer.from(body.message.data, 'base64').toString())
  const { endpointId } = message

  // Disable the webhook endpoint after exhausting retries
  await db
    .update(webhookEndpoints)
    .set({ enabled: false })
    .where(eq(webhookEndpoints.id, endpointId))

  console.log(`Webhook endpoint ${endpointId} disabled after max retries`)
})

#### Step 5: Delivery Observability

The in-process worker currently provides implicit observability via the `webhook_delivery_jobs` table. After migrating to Cloud Tasks, replace this with structured logging:

```typescript
// In the /webhook-delivery handler, log every attempt:
console.log(JSON.stringify({
  severity: 'INFO',
  message: 'webhook_delivery_attempt',
  endpointId,
  eventId,
  event,
  retryCount: request.headers.get('x-cloudtasks-taskretrycount') ?? '0',
  status: result.ok ? 'success' : 'failure',
  httpStatus: result.status,
  durationMs: Date.now() - start,
}))
```

> Cloud Logging ingests structured JSON from stdout automatically on Cloud Run. Use `severity` for log level filtering and create a log-based metric on `webhook_delivery_attempt` to build a delivery success rate dashboard. The `webhook_delivery_jobs` table can be kept as a historical audit trail or dropped once the team is confident in the logging pipeline.

#### Step 6: Remove In-Process Worker

- Delete `apps/api/src/services/webhook-delivery-worker.ts`
- Remove `startWebhookDeliveryWorker()` from `apps/api/src/index.ts`
- The `webhook_delivery_jobs` table can be kept for historical audit or dropped

#### Step 7: Migration Period

Run both systems in parallel during transition:
1. Deploy the Cloud Tasks endpoint
2. Switch the dispatcher to enqueue Cloud Tasks
3. Let the polling worker drain existing `webhook_delivery_jobs` rows
4. Once the jobs table is empty, remove the worker
5. Optionally drop the `webhook_delivery_jobs` table

### Dependencies

- `google-auth-library` package (for OIDC verification and access token generation — avoids the heavy `@google-cloud/tasks` gRPC SDK)
- Cloud Tasks API enabled in GCP project
- Pub/Sub API enabled in GCP project (for dead-letter queue)
- Service account with Cloud Tasks Enqueuer role
- OIDC authentication for task-to-service calls

### Cost

Cloud Tasks pricing: first 1 million operations/month free. At current scale (< 1000 webhook deliveries/day), cost is effectively $0.

---

## Implementation Order

1. **SSR migration** — can be done independently, high UX impact
2. **Cloud Tasks setup** — OpenTofu queue + service account
3. **Internal delivery endpoint** — new route
4. **Dispatcher switch** — Cloud Tasks enqueue instead of DB insert
5. **Worker drain + removal** — after jobs table is empty
6. **Health probe to Cloud Scheduler** — move `startHealthProbeInterval()` from in-process `setInterval` to a Cloud Scheduler job calling `POST /api/v1/admin/health-probe` every 60s (see Spec 04). Same scale-to-zero problem as the webhook worker — without this, health statuses go stale when Cloud Run scales to zero.

SSR (step 1) and Cloud Tasks (steps 2-6) are independent and can be done in parallel.

---

## Files Modified

### SSR Migration

| File | Change |
|------|--------|
| `apps/web/package.json` | `adapter-static` → `adapter-node` |
| `apps/web/svelte.config.js` | Adapter config |
| `apps/web/src/hooks.server.ts` | New: server-side auth hook |
| `apps/web/src/routes/(authed)/+layout.server.ts` | New: pass user from locals |
| `apps/web/src/routes/(authed)/+layout.svelte` | Remove client-side auth check |
| `apps/api/server.ts` | Replace static file serving with SvelteKit handler mount |
| `Dockerfile` | Build SvelteKit SSR instead of static files |

### Cloud Tasks Migration

| File | Change |
|------|--------|
| `infra/cloud-tasks.tf` | New: Cloud Tasks queue + Pub/Sub dead-letter topic/subscription |
| `apps/api/src/routes/internal.ts` | New: webhook delivery endpoint + DLQ handler, with OIDC verification |
| `apps/api/src/index.ts` | Register internal routes, remove `startWebhookDeliveryWorker()` |
| `apps/api/src/services/webhook-dispatcher.ts` | Enqueue via Cloud Tasks REST API instead of DB insert |
| `apps/api/src/services/webhook-delivery-worker.ts` | Remove (after drain) |
| `apps/api/package.json` | Add `google-auth-library` dependency |
