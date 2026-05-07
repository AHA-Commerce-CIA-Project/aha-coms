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

## 0. Pick your path

Three onboarding shapes, three entry points. Pick the one that matches your situation; everything below is keyed off the choice you make here.

### 0.1 Greenfield app (TypeScript / Bun)

You're standing up a new app from scratch and the only constraint is "it integrates with the portal."

1. Register the app via the admin App Registry UI (§1). Pick `slug`, `name`, `url`, leave `handoffMode` at `one_time_code`.
2. `bun add @coms-portal/sdk` and follow §2 (broker handoff) plus §3 (webhook receiver). The SDK ships the verifier, signer, and types — wire each into your framework's idiom (e.g. an Elysia route, a Next.js Route Handler, a Hono handler). Per Spec 06: there is no canonical starter repo — the framework choice is yours.
3. Validate with `bunx coms-portal-cli smoketest <slug>` (Spec 06 PR B). The CLI exercises the registry, your URL, and your webhook receiver from a CD pipeline using your runtime SA's OIDC token; on success it prints `Smoketest OK`.

That's the whole loop. No framework-specific code in this doc — pick what your team already runs.

### 0.2 Retrofit an existing app

You have a working production app and need to plug it into the portal without rewriting it. There's no scaffold or codemod — retrofit is a checklist of decisions, files to wire, invariants to honor, and a single command that validates the result.

**Decisions to make before you write any code:**

| Decision | Options | Why it matters |
|---|---|---|
| Where your session lives | DB row keyed by `user.portalSub`; signed-cookie JWT; existing auth-library wrapper | The handoff handler in §2 must persist the broker payload somewhere; the webhook handlers in §3 mutate that store. They have to agree. |
| Which CD platform mints your OIDC token | GitHub Actions, Cloud Build, GitLab CI, etc. | The mint chain is identical (`gcloud auth print-identity-token --impersonate-service-account=<runtime-sa> --audiences=<portal-url> --include-email`); the YAML wrapping it differs. |
| Which IaC tool declares your IAM bindings | Terraform, OpenTofu, Pulumi, raw `gcloud` | The runtime SA needs `roles/iam.serviceAccountTokenCreator` on itself (so CD can mint impersonated ID tokens) and `roles/run.invoker` on this portal's Cloud Run service. |
| Your framework's request-handler shape | Elysia handler, Next.js Route Handler, SvelteKit endpoint, Express middleware, Hono handler, etc. | The SDK is framework-agnostic. You wire `verifyBrokerToken` and `verifyWebhookSignature` into whatever your framework already uses for request handling. |

**Files to wire (one per concern; framework irrelevant):**

- A **handoff handler** at the path your `app.url` advertises. Receives `?coms_code=<one-time-code>` from the portal, calls `exchangeBrokerToken` against `POST /api/auth/broker/exchange`, then sets your session per the decision above. See §2 for the contract.
- A **webhook handler** at a stable URL you register in App Registry → Webhooks. Verifies HMAC via `verifyWebhookSignature`, deduplicates by `envelope.eventId`, and acks 2xx within 5s. See §3 for the contract and the four invariants.
- A **manifest registration step** in CD. Either land the manifest via the App Registry UI alongside the registry row (one transaction; see §1), or POST `coms-portal-cli register-manifest` from CD using the runtime-SA-impersonated OIDC token. The manifest is required only if your app has portal-managed config knobs.
- A **smoketest step** in CD: `coms-portal-cli smoketest <slug>` after every deploy. Non-zero exit means one of the three onboarding gaps fired (registry mismatch, app URL unreachable, webhook receiver broken). Make CD fail loud on it.

**Invariants your wiring must honor:** the four rules in §3.1 ("Spec 07 envelope contract"). They are non-obvious and have caused production outages. Read them before you wire the webhook handler.

**Validation:** `coms-portal-cli smoketest <slug>` returns `Smoketest OK` both locally (against the deployed app) and in CD (after every successful deploy). If it fails, the failing step name tells you exactly which file is missing.

### 0.3 Non-TypeScript app (Python / Go / Rust / etc.)

We do not ship per-language SDKs. The wire protocol is documented in §8 ("Wire protocol reference") in enough detail that a competent dev with standard JOSE + HMAC + HTTP libraries can integrate by hand in roughly 100 lines. Per Spec 06 D4: a per-language SDK is real engineering work and only worth paying once two or more apps in that language exist.

If you are the second app in a non-TS stack: open an issue and the conversation reopens.

---

## 1. Register an app

Use the Portal admin UI at `/admin/apps` or the API directly. Registration is admin-only and lands in `app_registry` (and optionally `app_manifests`) in a single transaction.

**Required fields:**

| Field | Meaning |
|---|---|
| `slug` | Short machine-readable identifier, e.g. `heroes`. Used in broker token audience (`portal:app:{slug}`) and routing. Must be unique. |
| `name` | Human label shown in the launcher and account widget. |
| `url` | Your app's public root URL. Used as the post-logout redirect allowlist and broker origin validation. |
| `handoffMode` | `one_time_code` (default) or `token_exchange`. See §2. |
| `transportMode` | How the portal hands the session to your app. Default `server_middleware`. |

Once registered, the portal assigns a UUID (`id`). Your app appears in the chrome launcher for any user whose team has been granted access.

### Managed config (optional)

The "Managed config" block on the registration form is the way to register an `app_manifests` row alongside the `app_registry` row. Use it when the portal admin needs to control per-user knobs for your app (think: `leaderboard_eligible`, `starting_points`) and broadcast them via the `user.provisioned` / `app.config_updated` webhook envelopes.

| Field | Meaning |
|---|---|
| `configSchema` | JSON object whose keys are knob names and values declare `{ type, default, … }`. Allowed `type` values: `enum` (with `values: string[]`), `boolean`, `integer`, `string`. Leave the textarea blank to skip the manifest entirely — the app boots without managed config. |
| `schemaVersion` | Integer ≥ 1. Bump this each time you widen `configSchema` so consumers can detect drift. |
| `taxonomies` | Comma-separated list of taxonomy IDs (e.g. `branches, teams, departments`). The portal injects current taxonomy entries into your provisioning webhooks for the IDs you subscribe to. |

`configSchema` is for **portal-managed per-user knobs only**. Auth, identity, and RBAC are wired by following the broker (§2) and webhook (§3) sections — never put role, email, or session state in `configSchema`. Apps without managed config can still receive `user.provisioned`, broker tokens, and team-level access grants; only the `appConfig` envelope field will be `null`.

If you need to land a manifest after the fact, use the App Registry detail page (`/admin/apps/:id`) to register/update the manifest row separately. Re-registering with the same slug + a non-empty `configSchema` upserts the manifest row.

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

> **Note (2026-05-07):** the registry advertises two other handoff modes (`token_exchange`, `same_host_cookie`). Both have zero production consumers and are slated for removal in `rev4/spec-03-hs256-rip-out.md`. Until that ships, use `one_time_code`. The legacy modes will be deleted from this section in PR C of Spec 06 (`rev4/spec-06-onboarding-scaffolding.md`) once the post-rip surface is live — see Spec 06's status block for the carry-over.

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

### 3.1 Spec 07 envelope contract — four invariants

These four rules are not optional. Each one corresponds to a production incident from a previous integration that the spec now codifies. Read all four before wiring the webhook handler in §3; if your handler violates any of them it will *appear* to work in dev and silently mis-route in production.

1. **Read role from `envelope.appRole`, never from `configSchema`.** The portal carries the recipient's resolved app-local role on every user-event envelope (`user.provisioned`, `user.updated`, `employment.updated`). `configSchema` is for portal-managed per-user knobs only — it is not an RBAC channel. New apps that put role in `configSchema` look correct in dev but break the moment the portal starts emitting role changes via the dedicated field. Heroes' 2026-05-06 role refactor was specifically to fix this; the contract documents what's already true.
2. **Dedupe by `envelope.eventId` — Cloud Tasks can deliver twice.** The retry layer is at-least-once. Same `eventId` → same logical event → handle once. Persist the seen set keyed by `eventId` (an in-memory LRU is fine for a single-instance receiver; a DB row is required for multi-instance). This is the *only* idempotency guarantee the portal gives you.
3. **Ack 2xx within 5 seconds.** The portal's delivery timeout is 10s, but a 5s budget leaves headroom for tail latencies and clock skew. Slow handlers should queue work to a background task and ack early — do not block on third-party APIs or DB writes inside the request. A receiver that holds the connection for 9.5s and *then* fails will be retried; the tail of those retries is a tarpit you cannot un-stick from the receiver side.
4. **Verify HMAC; OIDC bearer is additive.** Every request carries `X-Portal-Signature` (HMAC-SHA256 over `{timestamp}.{rawBody}` — see §8.2). Production requests *also* carry `Authorization: Bearer <google-oidc-id-token>` so receivers gated on Cloud Run IAM can verify caller identity at the platform layer. Both headers present is normal — use HMAC for content integrity and OIDC for caller authorization. A receiver that rejects requests because both headers are present is broken.

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

---

## 8. Wire protocol reference

This section documents the on-the-wire shapes precisely enough that a non-TypeScript app can integrate using standard JOSE + HMAC + HTTP libraries. The TypeScript SDK in `@coms-portal/sdk` is one implementation of this protocol — every check the SDK does is documented below. There is no hidden contract.

### 8.1 Broker token (ES256 JWT)

The portal issues ES256-signed JWTs. Verifiers fetch the public key set from the JWKS endpoint and verify the signature, issuer, audience, and expiry.

| Field | Value |
|---|---|
| Algorithm | `ES256` (NIST P-256, SHA-256) |
| JWKS URL | `GET {PORTAL_ORIGIN}/.well-known/jwks.json` — JSON document of shape `{ "keys": [<JWK>, …] }`. Cache for 10 min (the portal advertises `Cache-Control: public, max-age=600`). |
| Issuer (`iss`) | `{PORTAL_ORIGIN}/broker` (Rev 2+). Legacy tokens may carry the bare string `coms-portal-broker`; verifiers should accept both during transition. |
| Audience (`aud`) | `portal:app:<appSlug>` — verifiers MUST check this matches their expected slug. |
| Expiry (`exp`) | 5 minutes from `iat`. Reject expired tokens with no grace. |
| `kid` | Header-level key ID. Match against the JWKS `keys[].kid` to pick the verifying key. |

Custom claims carried in the payload (in addition to `sub`/`iss`/`aud`/`iat`/`exp`):

| Claim | Type | Meaning |
|---|---|---|
| `appSlug` | string | The app slug (matches the `aud` suffix). |
| `userId` | uuid | Canonical portal user ID. |
| `gipUid` | string | Google Identity Platform UID. |
| `email` | string | Primary email per Spec 06 §Q8a precedence (workspace if present, else personal-primary). |
| `name` | string | Display name. |
| `portalRole` | string | Portal-level role (`admin` / `member` / etc.). For app-local role, read `appRole` from the user-event webhook envelope (§3.1 invariant 1), not from the broker token. |
| `teamIds` | string[] | Team UUIDs the user belongs to. |
| `apps` | string[] | App slugs the user can access. |
| `redirectTo` | string ?? null | Optional post-handoff redirect path. |

Discovery: `GET {PORTAL_ORIGIN}/.well-known/openid-configuration` returns a JSON document advertising `jwks_uri`, `issuer`, `id_token_signing_alg_values_supported: ["ES256"]`, and the broker exchange endpoint.

### 8.2 Webhook signature (HMAC-SHA256)

Every webhook delivery carries an HMAC-SHA256 signature over a canonical string composed of the timestamp and the raw body. Verifiers MUST use a constant-time comparison (e.g. `hmac.compare_digest` in Python, `subtle.ConstantTimeCompare` in Go).

**Headers:**

| Header | Value |
|---|---|
| `X-Portal-Signature` | `sha256=<hex>` where `<hex>` = lowercase hex of `HMAC-SHA256(secret, "<timestamp>.<rawBody>")`. |
| `X-Portal-Event` | The event name (e.g. `user.provisioned`). |
| `X-Portal-Event-Id` | UUID — the idempotency handle. Dedupe by this (§3.1 invariant 2). |
| `X-Portal-Timestamp` | ISO 8601 UTC string used in the canonical signing input. |
| `Authorization` | `Bearer <google-oidc-id-token>` — additive; present in production. Audience claim is the receiver's origin. Use for caller authorization at the platform layer; HMAC remains the content-integrity check (§3.1 invariant 4). |

**Canonical signing input:** `{timestamp}.{rawBody}` — concatenation, ASCII period, no whitespace, no normalisation. The body is the raw bytes the receiver receives, before any JSON parsing.

**Receiver pseudocode (any language):**

```
mac    = HMAC_SHA256(secret, timestamp + "." + raw_body)
expect = "sha256=" + hex(mac)
if not constant_time_equal(received_signature_header, expect):
    return 401
```

### 8.3 HTTP endpoints

All endpoints are JSON over HTTPS. Auth requirements are noted per route.

**`POST /api/auth/broker/exchange`** — exchange a one-time code for a broker token. No auth header required (the code is the credential).

```
Request:  { "appSlug": "<slug>", "code": "<one-time-code>" }
Response: { "token": "<es256-jwt>", "user": { … } }   // 200
          { "message": "<reason>" }                    // 400
```

**`GET /api/admin/aliases/:alias`** — resolve a human-readable alias to a portal user. Auth: app-token (broker token) as `Authorization: Bearer <token>`.

```
Response: { "match": { "portalSub": "<uuid>", "isPrimary": true } }   // 200
          { "match": null }                                            // 200, no match
          { "message": "rate_limited" }                                // 429, with Retry-After header
```

**`POST /api/v1/apps/:slug/manifest`** — register a manifest from CD. Auth: Google OIDC ID token from the runtime SA. Audience MUST equal the portal's Cloud Run service URL.

```
Request:  { "appId": "<slug>", "displayName": "<name>", "schemaVersion": <int>, "configSchema": { … }, "taxonomies": [ … ] }
Response: { "schemaVersion": <int>, "registeredAt": "<iso>" }  // 200
```

**`POST /api/v1/apps/:slug/smoketest`** — exercise the integration end-to-end (Spec 06 PR A). Auth: same as manifest. Returns the registry summary plus per-endpoint webhook dispatch results, so the CLI can render its three-step checklist in one round trip.

```
Response: {
  "app": { "id": "<uuid>", "slug": "<slug>", "name": "<name>", "url": "<url>", "status": "active", "handoffMode": "one_time_code" },
  "endpoints": [ { "endpointId": "<uuid>", "url": "<url>", "status": <int|null>, "latencyMs": <int>, "error": "<msg>?" } ],
  "ok": <bool>
}
```

**`GET {PORTAL_ORIGIN}/.well-known/jwks.json`** — public key set for ES256 verification. No auth. Cache ≤ 10 min.

**`GET {PORTAL_ORIGIN}/.well-known/openid-configuration`** — discovery document. No auth. Cache ≤ 1 hour.

### 8.4 Minting an OIDC ID token from CD (any platform)

The mint chain is identical regardless of CI provider; only the YAML wrapping differs.

```
gcloud auth print-identity-token \
  --impersonate-service-account=<runtime-sa> \
  --audiences=<portal-url> \
  --include-email
```

Required IAM bindings on the runtime SA:

- `roles/iam.serviceAccountTokenCreator` on itself — lets CD mint impersonated ID tokens.
- `roles/run.invoker` on the portal's Cloud Run service — lets the runtime SA's token actually reach `/api/v1/apps/:slug/manifest` and `/smoketest`.

The portal verifies the OIDC token's `email` claim against `app_registry.service_account_email` for the slug carried in the URL. Mismatch → 403.
