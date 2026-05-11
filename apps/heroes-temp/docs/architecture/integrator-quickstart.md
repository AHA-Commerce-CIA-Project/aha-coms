# Integrator Quickstart

**Target:** A working integration in 30 minutes.

**Prerequisites:** Node.js or Bun runtime. Your app registered in COMS Portal (see §1).

**SDK:** `@coms-portal/sdk` v0.1.0 — install once, use for everything below.

```bash
bun add git+https://github.com/mrdoorba/coms-sdk.git#v0.1.0
# or
npm install git+https://github.com/mrdoorba/coms-sdk.git#v0.1.0
```

---

## 1. Register an app

Use the Portal admin UI at `/admin/apps` or the API directly.

**Required fields:**

| Field | Meaning |
|---|---|
| `slug` | Short machine-readable identifier, e.g. `heroes`. Used in broker token audience (`portal:app:{slug}`) and routing. Must be unique. |
| `name` | Human label shown in the launcher and account widget. |
| `url` | Your app's public root URL. Used as the post-logout redirect allowlist and broker origin validation. |
| `handoffMode` | `one_time_code` (default) or `token_exchange`. See §2. |
| `transportMode` | How the portal hands the session to your app. Default `server_middleware`. |

Once registered, the portal assigns a UUID (`id`). Your app appears in the chrome launcher for any user whose team has been granted access.

---

## 2. Exchange a broker token

The portal acts as an identity broker. When a user clicks your app in the launcher, the portal hands off a short-lived credential that your app exchanges for a signed broker token containing the user's session data.

### `one_time_code` flow (recommended)

1. Portal redirects user to `{your-app-url}?coms_code={one_time_code}`.
2. Your server POSTs the code to the portal exchange endpoint.
3. Portal returns a signed ES256 JWT (broker token).
4. Your app verifies the token using `verifyBrokerToken` from the SDK.

```ts
import { verifyBrokerToken } from '@coms-portal/sdk'

// Called from your app's session-init endpoint
async function handleComsHandoff(comsCode: string) {
  // Exchange the one-time code for a broker token
  const exchangeRes = await fetch(`${PORTAL_ORIGIN}/api/auth/broker/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appSlug: 'your-app-slug', code: comsCode }),
  })

  if (!exchangeRes.ok) throw new Error('Handoff exchange failed')
  const { token } = await exchangeRes.json()

  // Verify the token against the portal's JWKS
  const payload = await verifyBrokerToken(token, {
    jwksUri: `${PORTAL_ORIGIN}/.well-known/jwks.json`,
    appSlug: 'your-app-slug',
  })

  // payload.userId, payload.email, payload.name, payload.apps, payload.portalRole
  return payload
}
```

`verifyBrokerToken` fetches and caches the portal's JWKS, verifies the ES256 signature, checks issuer and audience, and rejects expired tokens. The returned payload is the canonical session user object.

**Token TTL:** 5 minutes. Exchange the code immediately; do not cache the code.

---

## 3. Verify a webhook

The portal delivers events to your registered webhook endpoint. Every delivery is signed.

### Envelope shape

```json
{
  "eventId": "uuid",
  "eventType": "employee.updated",
  "occurredAt": "2026-04-29T12:00:00.000Z",
  "payload": { ... }
}
```

`eventId` is the idempotency handle — use it to deduplicate retries.

### Verification

```ts
import { verifyWebhookSignature } from '@coms-portal/sdk'

app.post('/webhooks/coms', async (req, res) => {
  const signature = req.headers['x-coms-signature']
  const timestamp = req.headers['x-coms-timestamp']
  const rawBody = req.rawBody // string, not parsed

  const isValid = await verifyWebhookSignature({
    signature,
    timestamp,
    body: rawBody,
    secret: process.env.COMS_WEBHOOK_SECRET,
  })

  if (!isValid) return res.status(401).send('Invalid signature')

  const event = JSON.parse(rawBody)
  // event.eventId — idempotency key
  // event.eventType — e.g. 'employee.updated'
  res.status(200).send('ok')
})
```

### Retry semantics

The portal retries failed deliveries up to 3 times with exponential backoff via Cloud Tasks. On the 3rd failure the endpoint is automatically set to `disabled` status in the portal. You can re-enable it from the admin UI at `/admin/apps/{slug}/webhooks` or via `POST /api/v1/apps/{slug}/webhooks/{id}/enable`.

**Return 2xx within 10 seconds** to acknowledge. Any non-2xx or timeout counts as a failure.

---

## 4. Look up an alias

Aliases are human-readable identifiers (e.g. employee IDs, email addresses) that resolve to a portal user.

```ts
import { resolveAlias } from '@coms-portal/sdk'

// client: { appToken, portalOrigin }
const result = await resolveAlias(client, 'alice@example.com')

if (result.match) {
  console.log(result.match.portalSub) // canonical portal user ID
  console.log(result.match.isPrimary) // true if this is the user's primary alias
}
```

For batch lookups use `resolveBatch`:

```ts
const results = await resolveAlias(client, ['alice@example.com', 'emp-1234'])
```

### Rate limits

20 RPS sustained, 40 burst per app. On `429`, the response includes `Retry-After: 1`. The SDK handles `Retry-After` automatically on a single retry.

---

## 5. Read your tenant's audit log

Every action involving your app — both actions your app takes and admin actions taken on your behalf — appears in your audit log feed.

```ts
import { getAuditLog } from '@coms-portal/sdk'

// client: { brokerToken, portalOrigin }
const { entries, nextCursor } = await getAuditLog(client, {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // last 24h
  to: new Date().toISOString(),
})

for (const entry of entries) {
  console.log(entry.occurredAt, entry.action, entry.actorId)
  // entry.requestId — correlates with X-Coms-Request-Id response header
  // entry.actorAppId — your app's ID when your app was the actor
  // entry.targetAppId — your app's ID when an admin acted on your behalf
}

// Paginate
if (nextCursor) {
  const nextPage = await getAuditLog(client, { cursor: nextCursor })
}
```

### Scope predicate

The endpoint returns rows where `actor_app_id = your_app_id OR target_app_id = your_app_id`. This means:

- **Your actions:** rows where your app issued a broker-token-authenticated request (actor_app_id = your app).
- **Admin actions on your behalf:** rows where a portal admin performed an action that targeted your app specifically (target_app_id = your app). Cross-cutting admin actions (e.g. signing-key rotation) have both columns NULL and are not visible to tenants.

### Pagination

`nextCursor` is an opaque base64url string. Pass it as `cursor` in the next call to retrieve the next page. `nextCursor` is `null` when there are no more results.

### Date range

Default window: last 24 hours. Maximum: 30 days. Both `from` and `to` accept ISO 8601 strings.

### Privacy

`actor_ip` is never returned. The endpoint is authenticated by broker token (the same token your app already holds from the handoff flow).

---

## 6. Beyond the SDK

The SDK covers the four hot paths (broker handoff, webhook verification, alias resolution, audit log). For the full API surface:

- **OpenAPI spec:** `GET /api/openapi.json` — machine-readable OpenAPI 3.x document.
- **Swagger UI:** `/api/docs` — interactive browser UI, grouped by tag. Integrator-relevant routes are under the `auth`, `aliases`, `users`, `webhooks`, `apps`, `employees`, `access`, and `audit` tags.

Any endpoint not covered by the SDK is callable directly via HTTP using your app token or broker token as the `Authorization: Bearer` header.

---

## 7. What this doc is NOT

- **Heroes-specific integration details** — handoff flow customisations, Heroes-specific event types, and tenant configuration details belong in `heroes-integration-handoff.md`.
- **Migration runbooks** — database migration instructions, schema change guides, and upgrade procedures belong in per-migration docs under `docs/architecture/rev*/`.
- **Portal administration** — signing-key rotation, team/app provisioning, and admin-only flows are documented in `docs/architecture/rev3/`.
