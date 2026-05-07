# Rev 4 — Spec 03: HS256 Broker Token Rip-Out

> **Status: DRAFT 2026-05-07.** Owner: Mr. Door (solo). Trigger fired: post-Spec-01/02 architecture review of the superapp surface for first-party-only deployment identified the dual-mode HS256/ES256 broker path as carrying cost without a consumer.
>
> **Prerequisites:** Spec 01 SDK v1.0 SHIPPED 2026-05-07. Spec 02 §Q5 + §Discovery retired the Heroes Phase 7 gate by establishing that Heroes never calls `verifyBrokerToken` — its set of HS256 calls is empty.
>
> **Sequencing rule:** Portal + SDK v2.0 ship in coordinated week. No Heroes changes required (per Spec 02 §Q5 + §"Heroes-side coordination"). No phased deploy — pre-flight checks confirm zero production HS256 readers, so a single portal PR is safe.

---

## Status — 2026-05-07 (DRAFT)

Specced; not started. Three PRs (one portal, one infra, one SDK) plus a docs cleanup commit. Estimated effort: half a day of code + test rewrites + one drizzle-kit migration.

---

## Problem

`apps/api/src/services/auth-broker.ts` carries a dual-mode signing path established in Rev 2 §01:

- **HS256** — per-app symmetric secret in `app_registry.broker_signing_secret`, falling back to env var `PORTAL_BROKER_SIGNING_SECRET`. Issuer: legacy bare-string `coms-portal-broker`.
- **ES256** — global asymmetric key from `portal_broker_signing_keys` (active row), discoverable via `/.well-known/jwks.json`. Issuer: URL-form `https://coms.ahacommerce.net/broker`.

`signBrokerToken` mints both for every `token_exchange` handoff. `createBrokerHandoff` returns both as siblings (`tokenHs256`, `tokenEs256`, plus `token` deprecated alias) and emits both as redirect query params (`portal_token`, `portal_token_es256`). `verifyBrokerToken` discriminates by `alg` header. Both verify paths accept both issuers (`[PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]`) during the dual-mode window.

The dual-mode was correct under Rev 2 assumptions (Heroes had a presumed in-repo HS256 verifier needing migration). Spec 02 §Discovery overturned those assumptions:

1. Heroes has no in-repo broker-token verifier. It uses the portal's `one_time_code` exchange flow (server-side POST to `/api/auth/broker/exchange`), which returns a JSON `PortalBrokerExchangePayload` containing session-user data — **not** a JWT for the H-app to verify.
2. Heroes therefore never reads `portal_token` (HS256), `portal_token_es256` (ES256), `tokenHs256`, `tokenEs256`, or `token`. Spec 02 §Q5 confirmed: "Heroes' set of HS256 calls is empty."
3. The platform is first-party-only by directive (post-Spec-08 review). Future H-apps onboarded via the same SDK + same `one_time_code` flow inherit the same zero HS256 dependency.

Carrying cost of the dead path:

- ~150 LOC in `auth-broker.ts` (HS256 mint, HS256 verify, dual-issuer plumbing, dual-mode docblock).
- Two test files (`auth-broker-dual-mode.test.ts`, `auth-broker-issuer.test.ts`) whose entire purpose is locking dual-mode invariants that no consumer reads.
- One column (`app_registry.broker_signing_secret`) — universally NULL in production by D1 pre-flight check.
- One Secret Manager secret (`PORTAL_BROKER_SIGNING_SECRET`) + one Cloud Run env binding.
- One graceful-degrade branch (ES256 mint failure → HS256-only) that *masks* ES256 boot failures behind a logger.warn — a real auth posture regression hidden as resilience.
- `LEGACY_PORTAL_BROKER_ISSUER` strings in the broker-token middleware (`apps/api/src/middleware/broker-token.ts`) and the dual-issuer arrays in two `verifyES256BrokerToken` call sites.
- v1.x SDK (`@coms-portal/sdk@v1.0.0`) keeps HS256 in `verifyBrokerToken` for "legacy consumers" that don't exist; v2.0 was explicitly framed in Spec 01 §Q5b as the deletion vehicle and Spec 02 §Q5 unblocked it.

The goal of this spec: rip every line of HS256 code, drop the schema column, retire the secret, and cut SDK v2.0 — all in one coordinated week. After this, the broker surface has one signing algorithm, one issuer, one verify path, and one set of tests.

---

## Scope

**In scope:**

- Portal: delete `signHS256BrokerToken`, `verifyHS256BrokerToken`, `getBrokerSecretForApp`, `LEGACY_PORTAL_BROKER_ISSUER`. Simplify `signBrokerToken` and `verifyBrokerToken` to ES256-only. Drop `tokenHs256` and `token` fields from the handoff response, drop `portal_token` from the redirect query params. Drop the `BrokerCapableApp.brokerSigningSecret` projection from DB queries.
- Portal: drop `app_registry.broker_signing_secret` column via a new drizzle-kit migration (per `feedback_drizzle_migrations.md` — never hand-write the journal).
- Portal: drop `brokerSigningSecret` from `AppIntegrationMetadata` and `resolveAppIntegrationMetadata`. Update `apps.test.ts` fixture assertion.
- Portal: collapse the broker-token middleware's `issuer: [PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` to a single string.
- Portal: replace the ES256-mint-failure-degrades-to-HS256 branch with a startup assertion that an active signing key exists (refuse to boot otherwise).
- Tests: delete `auth-broker-dual-mode.test.ts` and `auth-broker-issuer.test.ts` outright. Port `auth-broker-audience.test.ts` from HS256-minted fixtures to ES256. Rewrite `auth-broker.test.ts` mocks so the signing-keys fixture provides a valid ES256 key (today's "no active key → degrade" path is gone).
- Infra: drop `PORTAL_BROKER_SIGNING_SECRET` env binding from `infra/cloud-run.tf`. **Retire the Secret Manager secret immediately in the same PR window** (no soak — D3 locked).
- SDK v2.0 (`mrdoorba/coms-sdk`): delete `tokenHs256` and `token` from `PortalBrokerHandoffResponse`. Delete the HS256 branch from `verifyBrokerToken`. Drop the `alg?: 'ES256' | 'HS256'` option. Bump major to v2.0.0.
- Shared contract: bump `PORTAL_CLAIMS_VERSION` from 2 → 3 (D2 locked). Update `shared-contract.test.ts`.
- Docs: strip HS256 / `portal_token` / dual-mode language from `docs/architecture/integrator-quickstart.md`. Add a one-line "superseded by Spec 03" pointer to the dual-mode docblock in any rev3 spec that referenced it.

**Out of scope:**

- Heroes-side changes — none required. Per Spec 02 §Q5: "SDK v2.0 is therefore unblocked from Heroes' side as of 2026-05-07." Heroes' `package.json` SDK pin stays at v1.x indefinitely; Heroes adopts v2.0 only when it has a reason to.
- Exchange-flow (`one_time_code`) changes. The exchange response (`PortalBrokerExchangePayload`) returns session-user data, not tokens; it is unaffected.
- Webhook HMAC removal. The portal-→app webhook signature path (`signWebhookPayload`, HMAC-SHA256, `PORTAL_WEBHOOK_SIGNATURE_HEADER`) is a different auth path with a different threat model. Out of scope here; tracked separately as a candidate for a future Rev 4 spec.
- `same_host_cookie` / `token_exchange` transport-mode pruning. Architecture review flagged these as over-built for first-party-only, but pruning is a separate question from HS256.
- Multi-portal-instance support. Still one portal per SDK install.

---

## Decisions log (all locked)

| # | Question | Decision | Reason |
|---|---|---|---|
| D1 | Single PR or phased (mint-drop → wait TTL → verify-drop)? | **Single PR.** Pre-flight checks (below) confirm zero production HS256 readers — the phased approach exists to protect live readers, of which there are none. | `BROKER_TOKEN_TTL_SECONDS` is short-window handoff credentials, not long-lived state. In-flight tokens at deploy time are users mid-click; they re-click. Heroes ignores `portal_token` either way. |
| D2 | Bump `PORTAL_CLAIMS_VERSION`? | **Yes, 2 → 3.** | Removing fields from `PortalBrokerHandoffResponse` (`tokenHs256`, `token`) is a contract narrowing. The version was set to 2 when dual-mode widened the response; the symmetric narrow earns a bump. SDK v2.0 release pins to claims version 3. |
| D3 | Soak window before retiring the Secret Manager secret? | **No — retire immediately, same PR window.** | Soak windows protect against emergency rollback needing the old credential. After this PR there is no code path that reads the secret; rollback would mean reverting the portal too, at which point re-creating the secret is part of the rollback. No asymmetry is created by retiring eagerly. |
| D4 | Behavior on ES256 mint failure (today: degrades to HS256-only with logger.warn)? | **Throw. Refuse to mint.** Plus: add a startup-time assertion that an active signing key exists; refuse to boot if absent. | The degrade was a Rev-2-era safety net for live HS256 receivers. Without HS256 receivers it just hides a key-bootstrap bug as a silent auth-posture regression. Failing loud at startup beats failing soft per request. |
| D5 | SDK v2.0 timing relative to portal PR? | **Coordinated week, parallel cut.** Either order is safe at runtime. | Portal sending fewer fields than SDK type expects: fine (extra-field tolerance). SDK v2.0 dropping fields portal still sends: fine (unread). The two PRs interlock only via the shared contract version (D2), which is updated in both. |
| D6 | What happens to `PORTAL_BROKER_SIGNING_SECRET` env var in `.env.example`? | **Removed in same portal PR.** | Single source of truth for the secret's existence is the codebase; if the code doesn't read it, the example file shouldn't list it. |

---

## Pre-flight checks (must all pass before merge)

These three checks turn the "is HS256 actually dead?" question into evidence. Run from a portal admin shell against production:

1. **No `token_exchange` handoff in production.**
   ```sql
   SELECT slug, handoff_mode FROM app_registry
   WHERE handoff_mode = 'token_exchange' AND status = 'active';
   ```
   Expected: zero rows. (Test fixture `orbit` exists in code but not in production data.) Any non-empty result names an app that consumes `portal_token` (HS256) or `tokenHs256` and would break — escalate to phased plan.

2. **No per-app broker signing secrets.**
   ```sql
   SELECT slug FROM app_registry WHERE broker_signing_secret IS NOT NULL;
   ```
   Expected: zero rows. Non-empty result means the column carries data and the migration must include a backfill / archival step before drop.

3. **No reads on the Secret Manager secret in the last 30 days.**
   Cloud Logging on `secretmanager.googleapis.com/SecretVersion.access` for `PORTAL_BROKER_SIGNING_SECRET`, last 30d, filter to non-portal callers. Expected: only portal startup reads; zero application-path reads.

If any check fails: stop. Re-evaluate scope. The single-PR plan assumes all three pass.

---

## File-level changes

### `apps/api/src/services/auth-broker.ts`

Delete:

- `LEGACY_PORTAL_BROKER_ISSUER` constant (line 51).
- `getBrokerSecretForApp` function (lines 143–152).
- `signHS256BrokerToken` function (lines 195–207).
- `verifyHS256BrokerToken` function (lines 423–434).

Modify:

- `BrokerCapableApp` `Pick<>` (line 128): remove `'brokerSigningSecret'`.
- `findBrokerAppBySlug` DB select projection (line ~283): remove `brokerSigningSecret: true`.
- The second DB projection at line ~476 (in `verifyBrokerToken` lookup): same removal.
- `signBrokerToken` (lines 237–249) → return `Promise<string>` (just the ES256 token). Remove the try/catch degrade-to-HS256 branch. Per D4, mint failure throws.
- `verifyBrokerToken` (lines 442–461) → keep the `alg` discriminator but reduce to: `if (header.alg !== 'ES256') throw new BrokerValidationError(...)`; call `verifyES256BrokerToken` and return. Drop the HS256 branch.
- `verifyES256BrokerToken` (line ~545–546): collapse `issuer: [PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` to `issuer: PORTAL_BROKER_ISSUER`. Drop the comment about "Day-30 cleanup" — Day 30 is now.
- `createBrokerHandoff` `token_exchange` branch (lines ~308–348): drop `tokenHs256` and `token` from the returned object. Drop `portal_token` from `buildRedirectUrl`. Rename the local `hs256` / `es256` destructuring to a single `token` since `signBrokerToken` now returns one string.
- File-level docblock (lines 25–44): rewrite as a four-line summary — "ES256 broker tokens, signed by the active signing key, verifiable via JWKS at `/.well-known/jwks.json`. Issuer: `${PORTAL_ORIGIN}/broker`. Audience: `portal:app:{slug}`. TTL: `BROKER_TOKEN_TTL_SECONDS`."

Add (per D4 startup assertion):

- In `apps/api/src/index.ts` startup path (or wherever `app.listen` is called), invoke a new `assertActiveSigningKeyExists()` from `apps/api/src/services/signing-keys.ts` (or wherever `getActiveSigningKey` lives). If no row with `status='active'`, log and `process.exit(1)`. Refusing to boot beats serving 500s on first user click.

### `apps/api/src/middleware/broker-token.ts`

- Delete `LEGACY_PORTAL_BROKER_ISSUER` constant (line 10).
- `jwtVerify` config (line 54): collapse `issuer: [PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` to `issuer: PORTAL_BROKER_ISSUER`.
- Audit the import line for `PORTAL_BROKER_ISSUER` from `~/services/auth-broker` — keep if still re-exported, otherwise resolve.

### `apps/api/src/services/apps.ts`

- `AppIntegrationMetadata` interface (line 35): remove `brokerSigningSecret: string | null`.
- `resolveAppIntegrationMetadata` (line ~65): remove `brokerSigningSecret: input.brokerSigningSecret ?? null`.
- `validateAppIntegrationMetadata` (lines 73–106): no change — the function never referenced `brokerSigningSecret`.

### `apps/api/src/db/schema/apps.ts`

- Drop the `brokerSigningSecret: text('broker_signing_secret')` column (line 26) from the `appRegistry` `pgTable` definition.

### `apps/api/drizzle/migrations/`

- Generate a new migration via `bun run db:generate` (per `feedback_drizzle_migrations.md` — drizzle-kit owns the journal entry; hand-written timestamps cause ordering bugs).
- Resulting SQL: `ALTER TABLE app_registry DROP COLUMN broker_signing_secret;`. The column is `text` (not crossing type families), so no `USING` clause needed (per `feedback_drizzle_text_uuid_cast.md` — that hazard applies to UUID/text crossings only).
- Verify generated migration on a copy of production data first.

### Tests

Delete outright:

- `apps/api/src/services/__tests__/auth-broker-dual-mode.test.ts` — entire file. Its purpose was locking the dual-mode invariant that no longer exists.
- `apps/api/src/services/__tests__/auth-broker-issuer.test.ts` — entire file. Dual-issuer accept is gone; the surviving single-issuer ES256 case is covered by `auth-broker.test.ts` after rewrite.

Modify:

- `apps/api/src/services/__tests__/auth-broker-audience.test.ts` (line 61): the test mints with `alg: 'HS256'` to assert audience-claim handling. Audience handling is alg-agnostic; port the fixture to ES256 using a generated test JWK (the SDK's `@coms-portal/sdk/testing` exports `mintTestBrokerToken` per Spec 01 PR G — depend on it here, or inline `jose.SignJWT` with a generated EC key).
- `apps/api/src/services/__tests__/auth-broker.test.ts`: the file's mock block (lines 68–83) describes the "no active signing key → throws → signBrokerToken catches and degrades" assumption. After D4 that path is gone — the test must provide a valid signing-keys fixture (active row + a private key the test controls). Remove the comment block; flip the mock from "empty" to "one active key."
- `apps/api/src/services/__tests__/apps.test.ts:104`: drop the `brokerSigningSecret: null` line from the asserted shape.
- `apps/api/src/__tests__/shared-contract.test.ts:25` (and surrounding): bump `PORTAL_CLAIMS_VERSION` expectation from 2 to 3.

### `infra/cloud-run.tf`

- Delete the env block at line 145 (`PORTAL_BROKER_SIGNING_SECRET`). No replacement.
- Per D3: in the same PR series, retire the Secret Manager secret. Either remove the `google_secret_manager_secret` resource and let `tofu apply` destroy it, or `gcloud secrets delete` outside Terraform if the secret pre-dates the IaC. Confirm with `gcloud secrets list` post-apply.

### `.env.example`

- Strip `PORTAL_BROKER_SIGNING_SECRET` and any associated comment lines.

### `@coms-portal/sdk` v2.0 (separate repo `mrdoorba/coms-sdk`)

- Drop `tokenHs256` and `token` (deprecated alias) fields from `PortalBrokerHandoffResponse` type.
- Drop the HS256 branch from `verifyBrokerToken`. Drop the `alg?: 'ES256' | 'HS256'` parameter on options. Drop the `mint-test-broker-token.ts` HS256 branch in `@coms-portal/sdk/testing` (per Spec 01 PR G).
- Bump `PORTAL_CLAIMS_VERSION` constant to 3 (mirrors the portal-side bump).
- Bump major: `v2.0.0`. CHANGELOG entry under "Breaking changes" naming the deleted exports/fields.
- Release notes: cite Spec 02 §Q5 + this Spec 03 as the rationale; record that the Spec 01 §Q5b "Heroes Phase 7" gate was retired by Spec 02 discovery.

### Docs

- `docs/architecture/integrator-quickstart.md`: search for `HS256`, `portal_token`, `tokenHs256`, `token:`, `dual-mode` — strip or rewrite. The §2 broker section already centers on `one_time_code`; trim the `token_exchange` subsection's references.
- Any rev3 spec that referenced dual-mode (Rev 2 §01, §02): leave as historical record; add a one-line trailing note "Superseded by Rev 4 Spec 03 (HS256 rip-out, 2026-05-07)."

---

## PR breakdown

| PR | Repo | Scope | Depends on |
|----|------|-------|------------|
| A | `mrdoorba/coms_portal` | All portal-side changes above (auth-broker, middleware, services/apps, schema, migration, tests, infra cloud-run.tf, .env.example, integrator-quickstart docs). One commit, single review pass. | Pre-flight checks 1–3 pass. |
| B | `mrdoorba/coms_portal` | Secret Manager secret retire (Terraform resource removal + `tofu apply`, or out-of-band `gcloud secrets delete`). | PR A merged + deployed. |
| C | `mrdoorba/coms-sdk` | SDK v2.0 — drop fields from `PortalBrokerHandoffResponse`, drop HS256 verify branch, bump claims version to 3, semver bump to 2.0.0, CHANGELOG, git tag `v2.0.0`. | Independent of A/B at runtime; coordinate timing within the same week. |

---

## Heroes-side coordination

**None required.** Per Spec 02 §Q5 + §"Heroes-side coordination" (2026-05-07): Heroes does not call `verifyBrokerToken`, has no in-repo HS256 verifier, and has no HS256 call set to drop. The originally-scoped "Heroes Phase 7" was retired by discovery and reframed as "no SDK consumer relies on HS256 verify" — today's known SDK consumer set is `{Heroes}` and Heroes' HS256 call set is empty.

Heroes' SDK pin stays at `v1.x` indefinitely. If Heroes ever adopts SDK v2.0 (e.g. for a future v2.x feature), it does so on its own schedule with no HS256-related code changes.

---

## Acceptance criteria

- `git grep -i 'hs256\|HS256\|broker_signing_secret\|brokerSigningSecret\|LEGACY_PORTAL_BROKER_ISSUER\|portal_token=\|tokenHs256\|degrade.*HS256'` in `apps/api/` returns zero hits (allowing for matches in CHANGELOG / historical specs).
- `apps/api/src/services/__tests__/auth-broker-dual-mode.test.ts` and `auth-broker-issuer.test.ts` no longer exist.
- `bun run typecheck && bun run test` passes.
- `bun run db:migrate` on a copy of production drops `app_registry.broker_signing_secret` cleanly.
- Cloud Run revision after PR A deploy has no `PORTAL_BROKER_SIGNING_SECRET` env var.
- Cloud Run revision after PR B deploy has no Secret Manager binding for the secret. `gcloud secrets list` shows the secret deleted.
- `@coms-portal/sdk@v2.0.0` git-tagged in `mrdoorba/coms-sdk`. CHANGELOG names the breaking changes. `PORTAL_CLAIMS_VERSION === 3` exported.
- A real broker handoff in `token_exchange` mode (test against a staging-equivalent app) emits `portal_token_es256` only; no `portal_token` query param; the JSON response has `tokenEs256` only; Heroes-style `one_time_code` flow continues to work unchanged.
- Portal refuses to boot when `portal_broker_signing_keys` has no `status='active'` row (D4 startup assertion).

---

## Out of scope (until trigger fires)

- **Webhook HMAC removal.** Different auth path, different threat model. Candidate for future spec when first-party-only audit covers webhooks.
- **`same_host_cookie` / `token_exchange` transport-mode pruning.** Rev 4 architecture review flagged these as over-built for first-party-only; pruning is a separate question from HS256 and gated on confirming no first-party app uses `token_exchange` (pre-flight check 1 supplies that evidence as a side effect, but the pruning itself is a separate spec).
- **Per-app HMAC for any other purpose.** None exists today; if introduced later it gets its own column with its own name, never the resurrected `broker_signing_secret`.
- **Re-introducing HS256 for a hypothetical third-party app.** Per directive: there will be no third-party app. If that ever changes, HS256 is not the answer — issue ES256 broker tokens and let the third party verify against JWKS like every modern OAuth/OIDC integration.
