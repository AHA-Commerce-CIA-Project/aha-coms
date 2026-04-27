# Rev 2 — Spec 01: RS256 Broker Tokens + JWKS Endpoint

> Priority: **1 (do first — highest leverage in Rev 2)**
> Scope: Portal (key generation, signing, JWKS publish) + Heroes (verification swap)
> Prerequisites: None. Rev 1 Spec 05 unrelated and parallel.

---

## Overview

Today every relying-party app ships a copy of the portal's HS256 broker signing secret. To verify a broker token the app does an HMAC compare with the shared key. This is functional but has three structural problems:

1. **Symmetric crypto = symmetric blast radius.** Anyone who can verify can also mint. A leaked relying-party env var lets an attacker forge tokens for that app.
2. **Per-app secrets** (Rev 1 Spec 01) bound the blast radius to one app, but kept symmetry. Adding a third service means provisioning, distributing, and rotating yet another shared secret.
3. **Rotation is operationally painful** — Rev 1 Spec 01 §5 punts it as future work.

Switching to **RS256 (or ES256) with a JWKS endpoint** flips the model to **asymmetric**: the portal's private key never leaves Secret Manager; relying parties verify with the public key fetched from `GET /.well-known/jwks.json`. Rotation becomes a first-class operation: insert a new key, sign with it, retire the old one after one max-token-TTL grace window. No per-app secret distribution, no per-app rotation, no `_previous` columns.

This is the same model every major IdP (Auth0, Cognito, Entra ID, Google) uses. Adopting it makes the federation OIDC-recognizable (Spec 02 builds on it) and unblocks third-app onboarding without secret distribution.

---

## Decisions Up Front

### Algorithm: ES256 (ECDSA P-256), not RS256

Both are widely supported. Pick **ES256** because:

- Smaller signatures (~64 bytes vs. ~256 bytes for RS256-2048) — tokens fit in URL params more comfortably during launch redirects.
- Smaller keys, faster verification on resource-constrained Cloud Run instances.
- No real interoperability cost — every JWT library that supports JWKS supports ES256 (`jose` certainly does, and Heroes already uses `jose`).

This spec writes "RS256" only in the title for recognizability; everywhere below the alg is `ES256`. Migration path to other algs is via the JWKS `alg` field — no breaking change.

### Where keys live

- **Private key:** Secret Manager. One secret per active key version. Naming: `portal-broker-signing-key-{kid}`.
- **Public key (JWK):** `signing_keys` table in Postgres, served as JWKS via `GET /.well-known/jwks.json`. Public material is not sensitive; storing it in the DB makes rotation transactional and trivially queryable.
- **Why not Cloud KMS asymmetric signing?** KMS would mean an external API call per token sign (~50–100ms added latency). Tokens are minted on every login + every broker handoff; the latency budget matters. Generate the key locally, store the private half in Secret Manager (which is already KMS-backed), serve the public half from JWKS.

### Global vs. per-app keys

**Global.** The `aud` claim disambiguates which app a token is for — symmetric per-app keys were a workaround for the symmetric model, not a fundamental design need. With asymmetric keys, one global private key + the audience claim provide the same security guarantee with much less operational overhead.

If a future requirement demands per-app key isolation (e.g., a regulated tenant), a `signing_keys.audience_filter` column can be added later without redoing the model.

### Key TTL and rotation cadence

- Active key signs new tokens.
- Previous keys remain in JWKS until the max broker-token TTL has passed (today: 5 minutes). After that, they're retired (removed from JWKS).
- **Routine rotation:** every 90 days (a Cloud Scheduler job triggers a rotation endpoint).
- **Emergency rotation:** admin endpoint to insert a new active key immediately and mark the prior one for retirement.

---

## Schema

New table `portal_broker_signing_keys`:

```sql
CREATE TABLE portal_broker_signing_keys (
  kid              VARCHAR(40) PRIMARY KEY,         -- key ID, included in JWT header
  alg              VARCHAR(10) NOT NULL,            -- 'ES256'
  public_jwk       JSONB NOT NULL,                  -- the public key in JWK form (for JWKS endpoint)
  private_secret_name VARCHAR(200) NOT NULL,        -- Secret Manager secret name holding the private PEM
  status           VARCHAR(20) NOT NULL,            -- 'active' | 'retiring' | 'retired'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at       TIMESTAMPTZ                      -- when status moved to 'retired'
);

CREATE UNIQUE INDEX one_active_signing_key
  ON portal_broker_signing_keys (status)
  WHERE status = 'active';

CREATE INDEX signing_keys_jwks_set
  ON portal_broker_signing_keys (status)
  WHERE status IN ('active', 'retiring');
```

Drizzle schema in `apps/api/src/db/schema/signing-keys.ts`:

```typescript
export const portalBrokerSigningKeys = pgTable('portal_broker_signing_keys', {
  kid: varchar('kid', { length: 40 }).primaryKey(),
  alg: varchar('alg', { length: 10 }).notNull(),
  publicJwk: jsonb('public_jwk').$type<JsonWebKey>().notNull(),
  privateSecretName: varchar('private_secret_name', { length: 200 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
})
```

Status state machine:

```
created (insert) ──→ active ──→ retiring ──→ retired
                       ↑           │
                       │           │
                  rotation        max-ttl-passed
                  promotes        cleanup job
                  successor       removes from
                                  JWKS
```

The unique partial index enforces "exactly one active key at a time."

---

## Key Generation Service

`apps/api/src/services/signing-keys.ts`:

```typescript
import { generateKeyPair, exportJWK } from 'jose'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
// (Note: Bun-friendly alternative: a thin REST client over Secret Manager API
//  to avoid the gRPC SDK weight, mirroring the Cloud Tasks decision in
//  Rev 1 Spec 05. Decide at impl time based on actual cold-start cost.)

export async function generateAndStoreNewKey(): Promise<{ kid: string; publicJwk: JsonWebKey }> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })

  const kid = `bk-${Date.now()}-${randomBytes(4).toString('hex')}`
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = kid
  publicJwk.alg = 'ES256'
  publicJwk.use = 'sig'

  const privatePem = await exportPKCS8(privateKey)
  const secretName = `portal-broker-signing-key-${kid}`

  // 1. Create Secret Manager secret + version
  await sm.createSecret({ ... })
  await sm.addSecretVersion({ ..., payload: { data: Buffer.from(privatePem) } })

  // 2. Insert row in portal_broker_signing_keys with status = 'created'
  // 3. Promote to active in a separate step (rotation operation)

  return { kid, publicJwk }
}

export async function rotateActiveKey(): Promise<void> {
  // Transaction:
  //   - generate new key (above)
  //   - mark current 'active' row as 'retiring'
  //   - mark new row as 'active'
  // After max broker-token TTL has elapsed, a separate cleanup job moves
  // 'retiring' → 'retired' and disables the Secret Manager version.
}

export async function loadActiveSigningKey(): Promise<{ kid: string; privateKey: KeyLike }> {
  // Query active row, fetch private PEM from Secret Manager (cache for 5min),
  // return imported KeyLike for jose.SignJWT().sign(privateKey)
}
```

**Caching:** the active key's `KeyLike` is cached in-process for 5 minutes. After expiry, re-query the DB for the active row (rotation may have happened) and re-fetch the private PEM. This keeps the hot signing path off Secret Manager for normal traffic.

---

## Updated Token Signing

`apps/api/src/services/auth-broker.ts`:

```typescript
// BEFORE
async function signBrokerToken(payload, app) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(PORTAL_BROKER_ISSUER)
    .setAudience(brokerAudienceFor(payload.appSlug))
    .setIssuedAt(now)
    .setExpirationTime(now + BROKER_TOKEN_TTL_SECONDS)
    .sign(getBrokerSecretForApp(app))
}

// AFTER
async function signBrokerToken(payload, app) {
  const { kid, privateKey } = await loadActiveSigningKey()
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
    .setIssuer(PORTAL_BROKER_ISSUER)
    .setAudience(brokerAudienceFor(payload.appSlug))
    .setIssuedAt(now)
    .setExpirationTime(now + BROKER_TOKEN_TTL_SECONDS)
    .sign(privateKey)
}
```

Note: the `app` parameter is no longer needed for signing — kept in the signature only during dual-mode. After HS256 retirement, simplify.

### Dual-Mode During Transition

While Heroes is still on HS256-only verification:

```typescript
async function signBrokerToken(payload, app) {
  // Sign once with each algorithm. Send both, let the verifier pick.
  const hs256Token = await signLegacyHS256(payload, app)
  const es256Token = await signES256(payload)

  // The exchange response and launch redirect carry both as siblings:
  //   { token_es256: "...", token_hs256: "...", expires_at, ... }
  // Heroes verification picks ES256 if present and verifiable; falls back to HS256.
}
```

After Heroes ships RS256-only verification (H1), portal drops the HS256 sibling.

Alternative considered and rejected: serve only ES256 from the start with feature-flag gating per app slug. Rejected because it couples portal deploy timing to Heroes deploy timing — the dual-mode approach decouples them.

---

## JWKS Endpoint

`apps/api/src/routes/well-known.ts`:

```typescript
import { Elysia } from 'elysia'
import { db } from '../db'
import { portalBrokerSigningKeys } from '../db/schema/signing-keys'
import { inArray } from 'drizzle-orm'

const JWKS_CACHE_MAX_AGE_S = 600  // 10 minutes — short enough that rotation propagates fast,
                                   // long enough that a hot consumer doesn't hammer us.

export const wellKnownRoutes = new Elysia({ prefix: '/.well-known' })
  .get('/jwks.json', async ({ set }) => {
    const rows = await db
      .select({ publicJwk: portalBrokerSigningKeys.publicJwk })
      .from(portalBrokerSigningKeys)
      .where(inArray(portalBrokerSigningKeys.status, ['active', 'retiring']))

    set.headers['cache-control'] = `public, max-age=${JWKS_CACHE_MAX_AGE_S}, must-revalidate`
    set.headers['content-type'] = 'application/json'
    return { keys: rows.map(r => r.publicJwk) }
  })
```

The endpoint is **unauthenticated and public** — public keys are not sensitive. Cache headers let consumers cache locally for 10 minutes.

**Mount path:** the portal's existing public path (`https://coms.ahacommerce.net/.well-known/jwks.json`). This is the same origin services already trust for `/api/auth/broker/exchange`.

---

## Heroes-Side Verification Swap (H1)

`coms-aha-heroes/packages/web/src/lib/server/portal-broker.ts` — the place that today does:

```typescript
const secret = new TextEncoder().encode(env.PORTAL_BROKER_SIGNING_SECRET)
const { payload } = await jwtVerify(token, secret, {
  issuer: PORTAL_BROKER_ISSUER,
  audience: env.PORTAL_TOKEN_AUDIENCE,
})
```

Becomes:

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Module-scope: jose's JWK set caches internally with HTTP cache semantics.
const JWKS = createRemoteJWKSet(new URL(`${env.PORTAL_ORIGIN}/.well-known/jwks.json`), {
  // 10-minute cooldown between forced refetches when an unknown kid is seen.
  cooldownDuration: 30_000,
  // Cache JWKS for 10min in normal operation.
  cacheMaxAge: 600_000,
})

const { payload } = await jwtVerify(token, JWKS, {
  issuer: PORTAL_BROKER_ISSUER,
  audience: env.PORTAL_TOKEN_AUDIENCE,
  algorithms: ['ES256', 'HS256'],  // Drop HS256 after dual-mode period.
})
```

For dual-mode: `createRemoteJWKSet` only handles asymmetric algs, so HS256 path stays explicit:

```typescript
async function verifyBrokerToken(token: string) {
  const { alg } = decodeProtectedHeader(token)
  if (alg === 'ES256') {
    return jwtVerify(token, JWKS, { issuer, audience, algorithms: ['ES256'] })
  }
  if (alg === 'HS256') {
    const secret = new TextEncoder().encode(env.PORTAL_BROKER_SIGNING_SECRET)
    return jwtVerify(token, secret, { issuer, audience, algorithms: ['HS256'] })
  }
  throw new Error(`Unsupported alg: ${alg}`)
}
```

After portal drops HS256 minting, delete the HS256 branch and the env var.

---

## Migration Plan

```
Day 0 — Portal: ship key generation service, schema, JWKS endpoint, dual-mode signing.
              JWKS endpoint is live but unused.
              Existing relying parties continue verifying HS256.

Day 1 — Heroes: H1 ships verification swap (dual-mode: ES256 preferred, HS256 fallback).
              No behavioral change: ES256 path is exercised on every login.

Day 7 — Portal: confirm logs show only ES256 verifications succeeding.
              Drop HS256 sibling token from broker endpoints.
              Keep `broker_signing_secret` column nullable for one more cycle in case rollback needed.

Day 30 — Portal: drop `broker_signing_secret` column in a follow-up migration.
              Drop `PORTAL_BROKER_SIGNING_SECRET` env var from Cloud Run.
              Update Rev 1 Spec 01 to mark §1 fully obsolete.
```

---

## Rotation Operation

Routine 90-day rotation runs as a Cloud Scheduler-driven endpoint:

```
POST /api/v1/admin/signing-keys/rotate
```

Flow:

1. Generate new ES256 key pair.
2. Insert into Secret Manager + DB row with status = `created`.
3. In a transaction: flip current `active` → `retiring`, new row → `active`.
4. Bump JWKS cache by setting `created_at` such that `cache-control max-age` lets the world pick up the new key within 10 minutes.
5. Schedule a follow-up Cloud Task (firing in `BROKER_TOKEN_TTL_SECONDS + 60s`) that moves the retiring key → `retired` and disables its Secret Manager version.

Emergency rotation (suspected key compromise) is the same flow with the cleanup task scheduled immediately: there will be brief verification failures for tokens already in flight, which is the right behavior under compromise.

---

## Failure Modes & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Active key DB row corrupted/missing | Sign fails fast; broker launch returns 500 with logged error. No silent fallback to a stale key. |
| Heroes JWKS fetch fails on cold start | `jose` retries internally; if exhausted, broker exchange fails with clear error. Heroes already has retry on 503; pattern reused. |
| Two active rows (constraint violation) | Insert fails the rotation transaction. Partial index enforces invariant. |
| Token signed with a `kid` that has aged out | `jose` re-fetches JWKS once (the `cooldownDuration` is per-kid). If still missing, verification fails — correct behavior. |
| Clock skew | `jose` defaults to ±0s on `iat`/`exp`. Add `clockTolerance: '30s'` on the verifier side. Already present in the HS256 path; preserve. |

---

## Observability

Add structured logs:

- `signing_key_rotated` — kid old, kid new, trigger ('scheduled' or 'manual'), success
- `broker_token_signed` — kid, app slug, audience, exp (DEBUG only; high volume)
- `broker_token_verified` (Heroes) — kid, alg, success/failure (DEBUG only)
- `jwks_endpoint_request` — keys returned, cache headers (INFO sampled)

Cloud Monitoring log-based metric on `signing_key_rotated` with severity escalation if rotation fails twice in a row.

---

## Files Modified

### Portal

| File | Change |
|------|--------|
| `apps/api/src/db/schema/signing-keys.ts` | New: table + Drizzle schema |
| `apps/api/src/services/signing-keys.ts` | New: generation, loading, rotation |
| `apps/api/src/services/auth-broker.ts` | `signBrokerToken()` → ES256; dual-mode emits both |
| `apps/api/src/routes/well-known.ts` | New: `/jwks.json` |
| `apps/api/src/routes/auth.ts` | Exchange response payload includes both `token_hs256` and `token_es256` siblings during dual-mode |
| `apps/api/src/routes/admin/signing-keys.ts` | New: rotation endpoint (admin-only) |
| `apps/api/src/index.ts` | Register `wellKnownRoutes`, admin signing-keys route |
| `infra/main.tf` (or new file) | Cloud Scheduler job for 90-day rotation |
| `infra/cloud-run.tf` | SA permission `roles/secretmanager.admin` scoped to `portal-broker-signing-key-*` secrets |
| New migration (`drizzle-kit generate`) | `portal_broker_signing_keys` table |
| Bootstrap script | Idempotent CLI (`apps/api/scripts/bootstrap-signing-key.ts`) that mints the first ES256 key. Wired into `.github/workflows/deploy.yml` immediately after `db:migrate`, so it runs on every push to `main` — first run inserts the active key, subsequent runs detect it and exit early. Manual invocation: `bun run --cwd apps/api scripts/bootstrap-signing-key.ts` with `DATABASE_URL` and `GCP_PROJECT_ID` env vars. |

### Heroes (see Rev 2 handoff)

| File | Change |
|------|--------|
| `packages/web/src/lib/server/portal-broker.ts` | `jwtVerify` accepts ES256 via remote JWKS, HS256 fallback during transition |
| `packages/shared/src/auth/session.ts` | No change — types come from `@coms-portal/shared` |
| Env: `PORTAL_BROKER_SIGNING_SECRET` | Retired after dual-mode period |

---

## Out of Scope

- **Per-app `audience_filter` keys.** Single global key set covers all apps for now.
- **HSM-backed keys.** Secret Manager + Google's KMS-at-rest is sufficient.
- **Authorization Code flow / PKCE.** Out of scope; the existing one-time-code flow stays. Spec 02 documents what we have.
- **JWE encryption of broker tokens.** Tokens carry only session identity, not secrets. Plain JWS (signed) is sufficient.

---

## Success Criteria

1. JWKS endpoint live at `https://coms.ahacommerce.net/.well-known/jwks.json` returning at least one ES256 key.
2. Heroes verifies ES256 broker tokens end-to-end (login → exchange → local session).
3. Routine rotation runs successfully (manually triggered first, then via Scheduler) and Heroes picks up the new key within 10 minutes.
4. `PORTAL_BROKER_SIGNING_SECRET` env var removed from both portal and Heroes Cloud Run configs.
5. Onboarding documentation for a hypothetical third app references `jwks_uri` only — no mention of distributing a shared secret.
