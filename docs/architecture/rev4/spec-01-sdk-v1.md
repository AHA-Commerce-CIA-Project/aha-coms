# Rev 4 — Spec 01: SDK v1.0 — Contract Lock & Onboarding Surface

> **Status: SHIPPED 2026-05-07** as `@coms-portal/sdk@v1.0.0`. Trigger fired: post-Spec-08 architecture review identified H-app onboarding friction as the #1 platform-quality gap. Owner: Mr. Door (solo).
>
> **Prerequisites:** Rev 3 closed (Spec 06 dual-email, Spec 07 org-taxonomies, Spec 08 Heroes cutover all SHIPPED). Hotspot refactors landed 2026-05-07 (`82d54dc..18016d9`) — broker dispatcher, employee paths, web↔api decoupling — putting the broker verifier seam in shape for SDK extraction.
>
> **Sequencing rule:** SDK v1.0 shipped entirely on the portal/SDK side; **no Heroes changes were required for v1.0**. Heroes adoption is opt-in and post-v1.0. SDK v2.0 (HS256 drop) is gated on Heroes Phase 7 (HS256-verify drop).

---

## Status — 2026-05-07 (SHIPPED)

All eight PRs (A → H) landed across `mrdoorba/coms-sdk` (eight commits, `85573b5..v1.0.0`) and `mrdoorba/coms_portal` (PR D portal-side route, `cb34577`). SDK released as `v1.0.0` git tag.

| PR | Scope | Status |
|----|---|---|
| A | SDK repo prep — version-bump strategy, CHANGELOG header for v1.0 milestone, baseline test pass on v0.1.1 surface. | SHIPPED — SDK `85573b5` (v0.2.0) |
| B | Typed webhook envelope (`PortalWebhookEnvelope<T>`, `defineWebhookHandler`, `getAppRole`). | SHIPPED — SDK `fc75e1c` (v0.3.0) |
| C | Contract-version constants + `assertContractVersionCompatible` + `ContractVersionMismatchError`. | SHIPPED — SDK `5c44844` (v0.4.0) |
| D | Manifest helpers (`defineManifest` author-time validator + `registerManifest` runtime client) + portal-side `POST /v1/apps/:slug/manifest` route under `requireAppToken`. | SHIPPED — SDK `8fd6de3` (v0.5.0) + portal `cb34577` |
| E | `coms-portal-cli` binary (`bin` entry in SDK package.json). Single command: `register-manifest`. | SHIPPED — SDK `c9be52f` (v0.6.0) |
| F | Elysia adapter at `@coms-portal/sdk/elysia` subpath — `requireBrokerAuth()` plugin. | SHIPPED — SDK `888bc30` (v0.7.0) |
| G | Test-kit at `@coms-portal/sdk/testing` subpath — `mintTestBrokerToken`, `buildEnvelope`, `stubJwks`. | SHIPPED — SDK `b5cbc22` (v0.8.0) |
| H | v1.0 cut: README rewrite, migration guide v0 → v1, SUPPORTED_VERSIONS update, semver lock, GitHub release tag `v1.0.0`. | SHIPPED — SDK `v1.0.0` tag |

Heroes-side PRs (separate repo, post-v1.0, optional):

| PR | Scope | Status |
|----|---|---|
| H-1 | Heroes drops in-repo broker verifier; depends on `@coms-portal/sdk@^1.0.0`. | Out of scope (Heroes-side spec) |
| H-2 | Heroes manifest moves to `portal-manifest.ts` + CD-pipeline `coms-portal-cli register-manifest`. | Out of scope (Heroes-side spec) |
| H-3 | Heroes Phase 7 — drop HS256 verify path. **Prerequisite for SDK v2.0.** | Out of scope (Heroes-side spec) |

---

## Problem

The current SDK (`@coms-portal/sdk` v0.1.1, repo `mrdoorba/coms-sdk`) ships:

- `verifyBrokerToken(token, options)` — both ES256 + HS256, JWKS-backed, typed `BrokerTokenError` codes.
- `verifyWebhookSignature` + `signWebhookPayload` — HMAC-SHA256, constant-time.
- `resolveAlias`, `introspectSession`, `getAuditLog` — three thin HTTP client helpers.

These cover the cryptographic primitives. They do **not** cover the parts of the H-app integration story that still live as tribal knowledge in `docs/architecture/integrator-quickstart.md`:

1. **Typed webhook envelopes.** H-apps receive `PortalWebhookEnvelope<T>` from the portal (Spec 07 envelope: `event`, `eventId`, `occurredAt`, `appSlug`, `payload`, plus the user envelope's `portalSub` + `appRole` invariants). The SDK gives them raw HMAC verify; envelope shape, event names, and per-event payload types must be re-declared in every H-app.
2. **App-role envelope reader.** Per the 2026-05-06 role refactor (commit `fb3b3ac`-era), future H-apps read role from `envelope.appRole`, never from `configSchema`. The SDK has no helper; H-apps reach into the envelope manually with no type guard.
3. **Manifest authoring.** Today, an H-app's `configSchema` and `taxonomies` are POSTed via the portal admin UI by a human. Drift between H-app code and portal DB has no source of truth. There's no path for an H-app to author `portal-manifest.ts` in its own repo and have the portal absorb it during the H-app's deploy.
4. **Framework wiring.** Heroes (and every future Elysia-stack H-app) writes the same auth middleware: extract `Authorization: Bearer`, call `verifyBrokerToken`, attach the user to context, refuse on error. ~30 lines of boilerplate per app, written from the docs each time.
5. **Contract-version negotiation.** The wire shape carries `contractVersion: number` (auth + webhook). The SDK decodes whatever it gets; there is no opt-in strict-mode rejection of future major versions, and no exported constants H-apps can pin against.
6. **Test fixtures.** No `mintTestBrokerToken` / `buildEnvelope` / `stubJwks` helpers exist. H-apps either skip auth-path testing or write their own JWT minting code.

The combined effect: onboarding a new H-app is 1–3 days of reading `integrator-quickstart.md`, copy-pasting verifier code, hand-typing envelope shapes, and figuring out where the manifest gets registered. This is not how AWS / GCP / Stripe SDKs feel.

The goal of this spec is to close those six gaps and cut a v1.0 release that commits to semver. After this, onboarding a new H-app is `bun add @coms-portal/sdk` + import + ~30 lines of glue.

---

## Scope

**In scope:**
- New SDK exports: typed webhook envelope + handler dispatch, role envelope reader, contract-version constants + assertion helper, manifest helpers, Elysia adapter, test-kit.
- New SDK CLI binary (`coms-portal-cli`) shipped as a `bin` entry in the SDK package.
- Portal-side: a single new route `POST /v1/apps/:slug/manifest` under `requireAppToken` middleware accepting the SDK's manifest payload.
- Re-exports from `@coms-portal/shared` so H-apps import everything from `@coms-portal/sdk`.
- README rewrite, migration guide v0 → v1, semver lock at v1.0.0, support-policy update.
- Backwards compatibility for the v0.1.x surface (no breaking changes to `verifyBrokerToken`, `verifyWebhookSignature`, etc.).

**Out of scope:**
- Adapter packages for non-Elysia frameworks (Hono, Express, Fastify) — added later if and when a real consumer asks. See Q3.
- Heroes-side adoption — separate Heroes-side spec, ships post-v1.0 (see "Heroes-side coordination").
- HS256 removal — gated on Heroes Phase 7; ships in SDK v2.0.
- Multi-portal-instance support (one portal per SDK install — fine for now).
- SDK-side caching of `/userinfo` or session state — H-apps own their session shape.
- Bidirectional sync for `app_user_config` — still a portal-owned admin surface.
- New CLI commands beyond `register-manifest`. The CLI ships with one verb. More commands added by future specs as needed.

---

## Decisions log (all locked)

| # | Question | Decision | Reason |
|---|---|---|---|
| Q1 | Package shape — one or split? | **One package: `@coms-portal/sdk`.** No rename, no split. New surface ships as additional exports + subpaths. | AWS-style split-by-service is for huge surfaces; yours is small. Stripe / Twilio / Sentry all ship one package. Splitting later is non-breaking; renaming now is. |
| Q2 | Contract types — bundle or keep `@coms-portal/shared` separate? | **SDK re-exports types from `@coms-portal/shared` (transitive dep).** H-apps import only from `@coms-portal/sdk`. Heroes can keep importing from `shared` during transition. | Single import source for consumers (Stripe SDK pattern). Shared stays the source of truth; SDK is the consumer-facing surface. |
| Q3 | Adapter framework strategy? | **Elysia only, at `@coms-portal/sdk/elysia` subpath.** No Hono / Express / Fastify until a real consumer asks. | Premature adapter breadth bakes in framework assumptions before there's a real shape to test against. Bun + Elysia is the established stack. |
| Q4 | Manifest registration mechanism? | **Standalone CLI binary `coms-portal-cli`** shipped as a `bin` entry in the SDK package. Invoked from the H-app's CD pipeline. Auth via the H-app's GCP service account ID token (same path as `requireAppToken` middleware). | Matches `gcloud`, `stripe`, `aws` CLI pattern. H-app's runtime tree stays clean of "configure portal" code. CD-time invocation makes manifest a deploy artifact, not a runtime concern. |
| Q5a | When to cut v1.0? | **After PRs A–G land.** Cut v1.0.0 once the surface is complete. | AWS SDK v3 / GCP SDK cadence — one stability commitment, no `(preview)` label rot. H-apps integrate against a complete, stable surface. |
| Q5b | When to drop HS256 from the SDK? | **Keep in v1.x; drop in v2.0** after Heroes Phase 7 (HS256-verify drop). | Standard major-version transition. AWS SDK v2/v3 coexisted for years. SDK release stays decoupled from Heroes timeline. |
| Q6 | Test-kit subpath? | **Yes, ship `@coms-portal/sdk/testing`.** Tree-shakeable, no production deps pulled. | Every serious SDK ships fakes — `@aws-sdk/client-mock`, `stripe-mock`, GCP emulators. Without it, every H-app team writes the same fakes. |
| Q7 | Runtime floor — keep or raise? | **Keep current: Bun ≥ 1.0 / Node ≥ 18, ESM-only.** | Same as AWS SDK v3 / GCP / Stripe. No reason to raise unless a Node 20+ feature is needed (none on the horizon). v1.0 cut is the right moment to commit. |
| Q8 | Contract-version mismatch behaviour? | **Strict — throw `ContractVersionMismatchError` (typed).** SDK refuses to decode envelopes from a future major version it doesn't recognize. | Same fail-loud model as Stripe-Version header. Predictable; H-app authors get an actionable signal instead of silent partial-data bugs. |
| Q9 | CLI distribution mechanism? | **Bundled in the SDK package via `bin` entry.** No separate `coms-portal-cli` npm package, no separate Go/Rust binary. | One install (`bun add @coms-portal/sdk` puts the CLI on `$PATH` via package-manager bin linking). Stripe SDK ships CLI helpers the same way; Stripe's standalone CLI is a separate concern (their CLI does much more — webhook forwarding, dashboard tunneling — none of which we need yet). |
| Q10 | CLI auth — what credential does `register-manifest` present? | **Google OIDC ID token** minted from the H-app's CD-pipeline GCP service account. Identical path to `apps/api/src/middleware/app-token.ts`. | Reuses existing `requireAppToken` middleware unchanged on the portal side — one auth model for all H-app→portal calls. No new secret to provision. |

---

## Surface (v1.0 exports)

### Top-level exports (`@coms-portal/sdk`)

```typescript
// === Existing (preserved unchanged) ===
export { verifyBrokerToken, BrokerTokenError } from './broker-token'
export type { BrokerTokenPayload, VerifyBrokerTokenOptions } from './broker-token'
export type { BrokerTokenErrorCode } from './errors'
export { verifyWebhookSignature, signWebhookPayload } from './webhook'
export { resolveAlias, introspectSession, getAuditLog } from './client'
export type {
  ComsClient, AliasResult, ResolveAliasResponse,
  SessionUser, IntrospectSessionResponse,
  AuditLogEntry, GetAuditLogParams, GetAuditLogResponse,
} from './client'

// === New in v1.0 ===

// Re-exports from @coms-portal/shared so H-apps import only from sdk (Q2).
export type {
  PortalWebhookEnvelope,
  PortalWebhookEvent,
  UserProvisionedPayload,
  UserUpdatedPayload,
  UserOffboardedPayload,
  // ...one re-export per Spec 07 event payload type
} from '@coms-portal/shared/contracts/webhook-events'

export type {
  PortalSessionUser,
  PortalRole,
  AppRole,
} from '@coms-portal/shared/contracts/session'

export type {
  ManifestDefinition,
  ConfigField,
  FieldType,
} from '@coms-portal/shared/contracts/integration-manifest'

// Typed webhook handler dispatch (PR B)
export { defineWebhookHandler } from './webhook-typed'
export type { WebhookHandlerMap, WebhookHandlerContext } from './webhook-typed'

// Role envelope reader (PR B)
export { getAppRole } from './role-envelope'

// Contract-version surface (PR C)
export {
  PORTAL_AUTH_CONTRACT_VERSION,
  PORTAL_WEBHOOK_CONTRACT_VERSION,
  assertContractVersionCompatible,
  ContractVersionMismatchError,
} from './contract-version'

// Manifest helpers (PR D)
export { defineManifest, registerManifest } from './manifest'
export type { RegisterManifestOptions } from './manifest'
```

### Adapter subpath: `@coms-portal/sdk/elysia` (PR F)

```typescript
import type Elysia from 'elysia'

export type RequireBrokerAuthOptions = {
  appSlug: string
  jwksUrl: string
  issuer?: string | string[]
}

/**
 * Elysia plugin that gates downstream routes on a valid portal broker token.
 * Adds `user: BrokerTokenPayload` to the route context. Throws 401 with a
 * structured error body on any verification failure.
 */
export function requireBrokerAuth(options: RequireBrokerAuthOptions): Elysia
```

### Test-kit subpath: `@coms-portal/sdk/testing` (PR G)

```typescript
export function mintTestBrokerToken(payload: Partial<BrokerTokenPayload>, opts?: {
  alg?: 'ES256' | 'HS256'
  appSlug?: string
  expiresInSeconds?: number
}): Promise<{ token: string; jwk: JsonWebKey }>

export function buildEnvelope<E extends PortalWebhookEvent>(
  event: E,
  payload: PayloadFor<E>,
  opts?: { appSlug?: string; eventId?: string; occurredAt?: string },
): PortalWebhookEnvelope<PayloadFor<E>>

export function stubJwks(jwks: { keys: JsonWebKey[] }): {
  url: string
  restore: () => void
}
```

### CLI binary: `coms-portal-cli` (PR E)

```bash
# Run from the H-app's CD pipeline. Requires GOOGLE_APPLICATION_CREDENTIALS
# (or workload-identity in CI) so the CLI can mint an OIDC ID token.
coms-portal-cli register-manifest \
  --portal-url https://coms.ahacommerce.net \
  --app-slug heroes \
  --manifest ./portal-manifest.ts

# Exit codes:
#   0 — manifest registered (or no-change idempotent UPSERT)
#   1 — auth failure (no GCP creds, app not registered with serviceAccountEmail)
#   2 — manifest validation failure (configSchema shape error)
#   3 — network / portal error (5xx from portal)
```

The CLI imports `defineManifest` + `registerManifest` from the SDK at runtime; loads the H-app's `portal-manifest.ts` via dynamic import; calls `registerManifest()` which POSTs to the portal.

### Sample H-app integration (the "what onboarding looks like" target)

```typescript
// 1. portal-manifest.ts in the H-app repo
import { defineManifest } from '@coms-portal/sdk'

export default defineManifest({
  appId: 'heroes',
  displayName: 'Heroes',
  schemaVersion: 1,
  configSchema: {
    weeklyDigestDay: { type: 'enum', values: ['mon', 'tue', 'wed', 'thu', 'fri'], default: 'fri' },
    notifyOnAssignment: { type: 'boolean', default: true },
  },
  taxonomies: ['team', 'department'],
})

// 2. server.ts in the H-app repo
import { Elysia } from 'elysia'
import { requireBrokerAuth } from '@coms-portal/sdk/elysia'
import { defineWebhookHandler, verifyWebhookSignature } from '@coms-portal/sdk'

const app = new Elysia()
  .use(requireBrokerAuth({
    appSlug: 'heroes',
    jwksUrl: 'https://coms.ahacommerce.net/.well-known/jwks.json',
  }))
  .get('/me', ({ user }) => ({ portalSub: user.userId, role: user.portalRole }))

const handlePortalEvents = defineWebhookHandler({
  'user.provisioned': async ({ payload, envelope }) => { /* ... */ },
  'user.updated':     async ({ payload, envelope }) => { /* ... */ },
  'user.offboarded':  async ({ payload, envelope }) => { /* ... */ },
})

app.post('/portal/webhook', async ({ request }) => {
  const body = await request.text()
  if (!verifyWebhookSignature(
    process.env.WEBHOOK_SECRET!,
    request.headers.get('x-portal-webhook-timestamp')!,
    body,
    request.headers.get('x-portal-webhook-signature')!,
  )) return new Response('Invalid signature', { status: 401 })

  await handlePortalEvents(JSON.parse(body))
  return new Response('OK')
})
```

That is the full H-app integration. ~30 lines of glue, no crypto code.

### Portal-side surface change (PR D)

One new route in `apps/api/src/routes/apps.ts` (or a new `routes/app-manifest.ts`):

```typescript
// POST /v1/apps/:slug/manifest
//   Auth: requireAppToken (Google OIDC ID token, app's registered serviceAccountEmail)
//   Body: ManifestDefinition (validated against same shape as services/manifests.ts:validateConfigSchemaShape)
//   Behaviour: idempotent UPSERT via existing services/manifests.ts:registerManifest()
//   Response: 200 { schemaVersion: number, registeredAt: ISO8601 }
//             409 { error: 'app_slug_mismatch' } if body.appId !== params.slug
//             422 { error: 'validation_failed', details: [...] } on configSchema shape errors
//             401 / 403 from requireAppToken middleware
```

No new tables, no schema migration, no new auth model. The `services/manifests.ts:registerManifest()` function already exists and already enforces the `GREATEST(schemaVersion)` non-regression rule.

---

## Versioning & migration policy

### Semver commitment from v1.0.0

- **Major (X.0.0):** breaking changes to any public export. Currently planned: v2.0.0 drops HS256 verification (post Heroes Phase 7).
- **Minor (1.X.0):** additive surface — new exports, new optional parameters, new event types, new adapter subpaths.
- **Patch (1.0.X):** bug fixes, documentation, internal refactors.

### Pre-1.0 behaviour (v0.x.x)

PRs A–G ship as v0.2.0 → v0.8.0 (one minor per PR). Pre-1.0 versions remain SHA-pinned in consumer `package.json` per existing `SUPPORTED_VERSIONS.md` policy. After PR G, cut v1.0.0; consumers may switch to `^1.0.0` semver-range pinning.

### Migration v0 → v1

The v0.1.x surface is preserved verbatim in v1.0. No code changes required for an H-app already on v0.1.x:

```diff
-"@coms-portal/sdk": "git+https://github.com/mrdoorba/coms-sdk.git#v0.1.1"
+"@coms-portal/sdk": "git+https://github.com/mrdoorba/coms-sdk.git#v1.0.0"
```

New v1.0 features (typed envelope, manifest helpers, adapter, test-kit) are additive opt-in.

### Deprecation policy

Any v1.x export marked deprecated stays in v1.x for ≥ 6 months, then removed in the next major. Deprecation is announced via:
1. JSDoc `@deprecated` tag on the export.
2. Entry in `CHANGELOG.md` under a "Deprecated" heading.
3. README mention.

---

## Phases / PR breakdown

Every PR includes its own tests (the SDK repo already has `bun test` wired). Each PR ends with a `/mr-door-commit`. Each PR cuts a tagged release on `mrdoorba/coms-sdk` so portal-side and H-app-side consumers can pin to a specific surface.

### PR A — Repo prep + baseline

- Tag current `main` on `mrdoorba/coms-sdk` as `v0.1.1` if not already.
- Bump `package.json` version to `0.2.0` (the working version while v1 work is in flight).
- Update `CHANGELOG.md` with a `## [Unreleased] (v1.0 milestone)` heading.
- Update `SUPPORTED_VERSIONS.md` to add a "v1.0 in progress" note.
- Add `@coms-portal/shared` as a runtime dep in `package.json` (currently absent — needed for the re-exports in PRs B/C/D).
- Confirm baseline `bun test` and `bun run typecheck` pass on the v0.1.1 surface.

### PR B — Typed webhook envelope + role envelope reader

- New file `src/webhook-typed.ts`:
  - `defineWebhookHandler(map: WebhookHandlerMap)` returns `(envelope: unknown) => Promise<void>` that type-discriminates on `envelope.event` and dispatches to the right handler with the matching payload type.
  - `WebhookHandlerContext<E>` type — handler signature receives `{ payload: PayloadFor<E>, envelope: PortalWebhookEnvelope<PayloadFor<E>> }`.
- New file `src/role-envelope.ts`:
  - `getAppRole(envelope, appSlug): AppRole | null` — extracts the app-scoped role from the envelope's `appRole` map (Spec 07 user envelope shape). Returns `null` if absent.
- Re-exports in `src/index.ts` for the new symbols + the `@coms-portal/shared` types listed in the Surface section.
- Tests in `src/__tests__/webhook-typed.test.ts` and `src/__tests__/role-envelope.test.ts`.

### PR C — Contract-version surface

- New file `src/contract-version.ts`:
  - `PORTAL_AUTH_CONTRACT_VERSION` constant (matches portal's `PLATFORM_AUTH_CONTRACT_VERSION` from `@coms-portal/shared`).
  - `PORTAL_WEBHOOK_CONTRACT_VERSION` constant (matches portal's `PORTAL_WEBHOOK_CONTRACT_VERSION`).
  - `assertContractVersionCompatible(received: number, supported: number, kind: 'auth' | 'webhook'): void` — throws `ContractVersionMismatchError` if `Math.floor(received) > supported` (future major version). Permits same-major minor bumps.
  - `ContractVersionMismatchError extends Error` — typed `code: 'auth_version_mismatch' | 'webhook_version_mismatch'`, `received: number`, `supported: number`.
- Wire into `verifyBrokerToken` as opt-in via a new option `strictContractVersion?: boolean` (default `false` for back-compat). When `true`, `verifyBrokerToken` calls `assertContractVersionCompatible` after decoding.
- Wire into `defineWebhookHandler` similarly — opt-in strict mode.
- Tests in `src/__tests__/contract-version.test.ts`.

### PR D — Manifest helpers + portal-side route

**SDK side:**
- New file `src/manifest.ts`:
  - `defineManifest(def: ManifestDefinition): ManifestDefinition` — identity function that constrains the input type at author time. Lets H-apps get type-checking on `configSchema` field shapes without runtime cost.
  - `registerManifest(opts: RegisterManifestOptions): Promise<{ schemaVersion: number; registeredAt: string }>` — POSTs to `${portalUrl}/v1/apps/${appSlug}/manifest`. Auth via OIDC ID token minted from `google-auth-library` (same library the portal uses). Throws on non-2xx.
- Tests in `src/__tests__/manifest.test.ts` using `stubJwks` (PR G's test-kit) once that lands; until then, mock `fetch`.

**Portal side (in coms_portal repo, separate commit):**
- New route file `apps/api/src/routes/app-manifest.ts` mounted under `/v1/apps/:slug/manifest`:
  - Uses existing `requireAppToken()` middleware for auth.
  - Validates `params.slug === body.appId` (409 if not).
  - Calls existing `services/manifests.ts:registerManifest()` (already enforces GREATEST schemaVersion).
  - Returns `{ schemaVersion, registeredAt }` on success.
- Mount the route in `apps/api/src/index.ts` under the existing `/v1` group (not behind `authPlugin` — broker-token auth is the only gate, same as `app-webhooks.ts`).
- Tests in `apps/api/src/routes/__tests__/app-manifest.test.ts`.

### PR E — `coms-portal-cli` binary

- Add `bin` entry to `package.json`: `{ "coms-portal-cli": "./dist/cli.js" }`.
- New file `src/cli.ts`:
  - Argument parsing: simple `node:util.parseArgs` — no external CLI framework dep.
  - `register-manifest --portal-url <url> --app-slug <slug> --manifest <path>` subcommand.
  - Loads the manifest file via `await import(path)` (TS files: rely on Bun's transpile-on-import, or fall back to compiled `.js` for Node).
  - Calls `registerManifest()` from PR D.
  - Exit codes per the Surface section (0 / 1 / 2 / 3).
- Build step: `bun build src/cli.ts --target node --outfile dist/cli.js` added to `package.json` `prepack` script.
- Tests in `src/__tests__/cli.test.ts` — invoke via `Bun.spawn` against a mocked portal HTTP server.

### PR F — Elysia adapter

- New subpath in `package.json` `exports`: `"./elysia": "./src/elysia.ts"`.
- New file `src/elysia.ts`:
  - `requireBrokerAuth(options): Elysia` — Elysia plugin (`new Elysia({ name: 'require-broker-auth' }).derive(...)`).
  - Extracts `Authorization: Bearer <token>` from the request.
  - Calls `verifyBrokerToken(token, options)`.
  - On success: derives `{ user: BrokerTokenPayload }` into the route context.
  - On failure: throws `status(401, { error: 'unauthorized', code: errorCode })` where `errorCode` matches `BrokerTokenError.code`.
- Add `elysia` as a peer dep (not a runtime dep) in `package.json`.
- Tests in `src/__tests__/elysia.test.ts` — boot a mini Elysia app, hit it with valid + invalid tokens.

### PR G — Test-kit subpath

- New subpath in `package.json` `exports`: `"./testing": "./src/testing/index.ts"`.
- New files:
  - `src/testing/mint-test-broker-token.ts` — uses `jose.SignJWT` to mint a token signed with a generated ES256 or HS256 key. Returns `{ token, jwk }` so callers can also stub the JWKS.
  - `src/testing/build-envelope.ts` — constructs a full `PortalWebhookEnvelope<T>` with sensible defaults; deterministic when seeded.
  - `src/testing/stub-jwks.ts` — installs a fetch interceptor (using `jose`'s in-memory JWKS support — no actual HTTP) and returns `{ url, restore }`.
- All testing utilities must not import production-side fetch / network code beyond what's already in `jose`.
- Tests in `src/__tests__/testing-kit.test.ts`.

### PR H — v1.0 cut

- Rewrite `README.md`:
  - Quick-start (5 lines: install, defineManifest, requireBrokerAuth, defineWebhookHandler).
  - Full export reference grouped by concern.
  - Migration from v0.1.x section.
- New file `MIGRATION.md`: v0 → v1 walkthrough (mostly "no changes required, here are the new opt-ins").
- Update `SUPPORTED_VERSIONS.md` to add v1.0 row, mark v0.1.x security-only.
- Update `CHANGELOG.md` with full v1.0.0 entry.
- Bump `package.json` version to `1.0.0`.
- Tag `v1.0.0` on `mrdoorba/coms-sdk` `main`. Push tag.
- Mark Spec 09 as SHIPPED in `docs/architecture/rev4/spec-00-implementation-timeline.md`.

---

## Heroes-side coordination

> **Amended 2026-05-07 — Spec 02 supersedes this section.** The
> placeholders below were drafted before the Heroes auth model was
> inspected; Heroes never had an in-repo broker verifier (H-1 is moot)
> and never called `verifyBrokerToken` (H-3 / "Heroes Phase 7" is moot
> as a v2.0 gate). See [spec-02-sdk-v1-heroes-adoption.md](spec-02-sdk-v1-heroes-adoption.md)
> §Discovery for the actual model and §Q5 for the v2.0 gate
> re-evaluation. The "Heroes Phase 7" terminology is retired.

Heroes is in dual-mode (HS256 + ES256 verify) as of Phase 6 (shipped 2026-05-06). This spec ships entirely without touching Heroes.

**Heroes-side adoption work moved to Spec 02 (SDK v1.0 Heroes Adoption & Verification):**

- **H-1 (retired by discovery).** Heroes has no in-repo broker verifier to migrate — user auth runs through the portal's one-time `portal_code` exchange flow, not direct broker-token decode. The 150-line refactor described here does not exist.
- **H-2 → Spec 02 §HB.** Heroes' manifest-as-code (`portal-manifest.ts` + `coms-portal-cli register-manifest` in CD) ships in Spec 02 PR HB.
- **H-3 (retired by discovery).** "Heroes Phase 7" was the prerequisite for SDK v2.0 because the SDK keeps HS256 verification in 1.x for legacy consumers. Heroes is not such a consumer — `verifyBrokerToken` is never called. The remaining v2.0 gate is "no SDK consumer relies on HS256 verify"; today's known consumer set is `{Heroes}` and Heroes' HS256 call set is empty. **SDK v2.0 is unblocked from Heroes' side as of 2026-05-07** (Spec 02 §Q5).

Spec 02 also adds two SDK-repo verification artefacts (PRs VA and VB) that close §AC #1 and §AC #5 against real consumer code rather than the SDK's own test suite, plus PR SA which cuts SDK v1.1.0 with a single APP_LAUNCHER re-export so Heroes can complete the import migration in Spec 02 PR HA without leaving a stranded `@coms-portal/shared` import.

---

## Acceptance criteria

Locked at write time. SDK v1.0 ships only when every item below is true.

1. **Onboarding is `bun add` + ~30 lines.** A fresh H-app with no portal integration code can verify portal tokens, handle webhooks, and register a manifest without writing any crypto code or any envelope-shape declarations. The sample integration in §Surface compiles and runs against a stubbed portal.
2. **Manifest is authored in TypeScript in the H-app repo,** type-checked there, and registered with one CLI command in the H-app's CD pipeline. The portal-side admin UI continues to work for human-driven registration; CLI is opt-in.
3. **All eight decisions (Q1–Q10) are reflected in the shipped surface.** No `(preview)` flags, no surface added beyond what's listed in §Surface.
4. **Semver is locked at v1.0.0.** `SUPPORTED_VERSIONS.md` lists v1.0 as Active, v0.1.x as Security-only.
5. **Backwards compatibility verified.** A consumer pinned to v0.1.1 importing `verifyBrokerToken`, `verifyWebhookSignature`, `resolveAlias`, `introspectSession`, `getAuditLog` works against v1.0 with zero code changes.
6. **Test-kit is consumable.** A sample H-app test using `mintTestBrokerToken` + `stubJwks` to test its `requireBrokerAuth`-protected route runs green without spinning up a real portal.
7. **Portal `POST /v1/apps/:slug/manifest` is live** and tested under `requireAppToken`. Idempotent. 409 on slug mismatch. 422 on shape error. 401 / 403 on auth failure.
8. **Heroes is unblocked but uncoupled.** SDK v1.0 ships without Heroes scheduling pressure. Heroes can adopt H-1 / H-2 / H-3 at its own pace.
9. **CHANGELOG, README, MIGRATION.md, and SUPPORTED_VERSIONS** are all updated and consistent.
10. **Spec 01 is marked SHIPPED in spec-00-implementation-timeline.md** with the SDK release tag and date.

---

## Out of scope (until trigger fires)

- **Adapters for non-Elysia frameworks** (Hono, Express, Fastify, Koa, Hapi). Add when the first non-Elysia consumer asks. Q3 locked this — premature breadth bakes in framework assumptions.
- **OpenAPI / TypeSpec generation** of the SDK from the portal's Elysia routes. Today's `@elysiajs/swagger` already generates a runtime spec; auto-generating TS clients from it is a separate spec.
- **Multi-portal-instance routing.** SDK assumes one portal per install. Multi-tenant routing is a future v2.x or v3.0 concern.
- **GraphQL surface, webhook subscriptions panel, OAuth2 client registration.** Not needed today.
- **Replacement of `@coms-portal/shared`.** Shared stays the source of truth for contract types. SDK is the consumer-facing facade only.
- **Removing the existing portal admin UI for app/manifest registration.** Manifest-as-code is opt-in alongside the admin UI; the UI remains for human-driven registration and emergency edits.
