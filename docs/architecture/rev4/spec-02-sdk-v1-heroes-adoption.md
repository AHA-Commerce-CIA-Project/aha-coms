# Rev 4 — Spec 02: SDK v1.0 Heroes Adoption & Verification

> **Status: SHIPPED 2026-05-07** — five planned PRs landed, four follow-up bugs (D1–D4) surfaced at deploy time, nine follow-up patches (F1–F9) landed at ship, two post-ship follow-ups (F10–F11) closed filed issues #3 and #4 same day, AC #2 verified live in production. SDK released as `@coms-portal/sdk@v1.2.0`.

## Commit ledger (all repos, draft → production-verified)

### Planned PRs (the five from §PR breakdown)

| PR | Scope | Repo / commit | Tag |
|---|---|---|---|
| SA | `APP_LAUNCHER` re-export through SDK barrel | `mrdoorba/coms-sdk` `c98b2c5` | `v1.1.0` |
| VA | `examples/v0-compat-smoketest/` | `mrdoorba/coms-sdk` `e854e97` | — |
| VB | `examples/onboarding-scratch/` | `mrdoorba/coms-sdk` `f8ae1b4` | — |
| HA | Heroes 16-import migration to `@coms-portal/sdk` | `mrdoorba/coms_aha_heroes` `d59a5ca` | — |
| HB | Heroes `portal-manifest.ts` + `register-manifest` CD step | `mrdoorba/coms_aha_heroes` `536099d` | — |

### Follow-up patches (discovered while shipping; see §Post-ship discoveries)

| # | Scope | Repo / commit | Tag |
|---|---|---|---|
| F1 | Heroes infra: `iam.serviceAccountTokenCreator` for deployer SA on runtime SA (OpenTofu) | `mrdoorba/coms_aha_heroes` `527b77a` | — |
| F2 | Heroes lockfile regen against published `v1.1.0` | `mrdoorba/coms_aha_heroes` `0412ce0` | — |
| F3 | SDK `sideEffects: false` + `./constants/app-launcher` subpath (browser-bundle fix) | `mrdoorba/coms-sdk` `fc4153a` | `v1.1.1` |
| F4 | Heroes consumes v1.1.1; layout flips to subpath import | `mrdoorba/coms_aha_heroes` `a74f320` | — |
| F5 | SDK `COMS_PORTAL_CLI_OIDC_TOKEN` env-var path on the CLI (production WIF + impersonation) | `mrdoorba/coms-sdk` `a91acc3` | `v1.2.0` |
| F6 | Heroes consumes v1.2.0; auth action to `token_format: id_token` | `mrdoorba/coms_aha_heroes` `a2d25f8` | — |
| F7 | Heroes workflow swaps to `gcloud auth print-identity-token --impersonate-service-account` (auth action's id_token path returned 403) | `mrdoorba/coms_aha_heroes` `137aa0a` | — |
| F8 | Portal route param rename `:slug` → `:id` (memoirist trie conflict with `apps.ts` / `app-webhooks.ts`) + `route-compose.test.ts` regression | `mrdoorba/coms_portal` `abd3b21` | — |
| F9 | Portal route-compose test extension fix (drop `.ts` to satisfy tsc) | `mrdoorba/coms_portal` `ce4d3c9` | — |

### Post-ship follow-ups (closed filed issues #3, #4 same day as ship)

| # | Scope | Repo / commit | Tag | Closes |
|---|---|---|---|---|
| F10 | Portal: split `services/manifests.ts` into shell + `manifests-internal.ts` to break the cross-file mock pollution loop. Bun's `mock.module` is process-global and keyed by resolved abs path, AND `export *` propagates a mock through the live binding to the source module — so any mock on `manifests.ts` was poisoning `manifests-internal.ts` too. The shell now uses const-bound re-exports (`export const X = impl.X`) which capture function references at load time and stand alone; `manifests.test.ts` imports `'../manifests-internal'` directly and is now isolated from the polluters | `mrdoorba/coms_portal` (current commit) | — | #4 |
| F11 | Portal: `__tests__/route-compose.test.ts` generalised — alongside the original "first request doesn't throw" check, walks the composed `app.routes` trie and explicitly surfaces every memoirist param-name conflict with a friendly diagnostic (conflicting position + both route paths + both names), so a future D4-style mismatch is caught even if memoirist's compose-time throw ever stops firing. Two self-verification cases guard the helper against silent regressions | `mrdoorba/coms_portal` (current commit) | — | #3 |

### Portal docs

| Scope | Repo / commit |
|---|---|
| Spec 02 marked SHIPPED, Spec 01 §coordination amended, Spec 00 timeline updated | `mrdoorba/coms_portal` `8736d0d` |
| Spec 02 commit ledger + post-ship discoveries (this update) | `mrdoorba/coms_portal` (current commit) |

**Prerequisites:** Spec 01 SHIPPED (`@coms-portal/sdk@v1.0.0` tagged 2026-05-07; portal-side `POST /v1/apps/:slug/manifest` route landed in `cb34577` — though see §Post-ship discoveries D4 for why that route did not actually serve traffic until F8).

**Sequencing rule:** This spec was drafted as a Heroes-side-only piece against an already-published v1.0.0 SDK. The follow-up patches show that assumption did not hold — three of the four discovered bugs required SDK or portal changes.

---

## Acceptance result (live-verified at SHIPPED time)

1. **AC #1 — Heroes typecheck after import migration:** `bun run --filter=* typecheck` exits 0 across all three Heroes packages (5993 svelte-check files, 0 errors, 0 warnings) on PR HA's working tree, identical to `main` pre-migration.
2. **AC #2 — Heroes manifest-as-code first run is a no-op:** ✅ Verified live in production CD. Heroes deploy run `25477615331` (re-run of the gcloud-mint workflow after F8 portal fix, 2026-05-07T05:42 UTC) logged: `Registered manifest for "heroes" — schemaVersion=2, registeredAt=2026-05-07T05:42:32.600Z`. The recorded `schemaVersion=2` is identical to the row already in `app_manifests` for `slug='heroes'` — the GREATEST(schemaVersion) non-regression rule turned the call into a no-op as planned. Production traffic shifted to 100% on the same run.
3. **AC #3 — Spec 01 §AC #5 falsifiable:** PR VA (`mrdoorba/coms-sdk` `e854e97`) ships `examples/v0-compat-smoketest/index.ts`; `bun run examples/v0-compat-smoketest/index.ts` exits 0 with all 6 v0 names resolving as functions.
4. **AC #4 — Spec 01 §AC #1 substantiated:** PR VB (`mrdoorba/coms-sdk` `f8ae1b4`) ships `examples/onboarding-scratch/`. Recorded LOC against Spec 01's "~30 lines" claim: `portal-manifest.ts` 11 non-blank, `server.ts` 30 non-blank as written in Spec 01 verbatim, total 41 — claim verified. With 7 lines of testability scaffolding (factory + options interface), total integration glue is 48 non-blank lines.
5. **AC #5 — SDK v2.0 gate explicitly unblocked-from-Heroes:** Portal docs amended in `docs/architecture/rev4/spec-01-sdk-v1.md` §"Heroes-side coordination" and `docs/architecture/rev4/spec-00-implementation-timeline.md`. The "Heroes Phase 7" terminology is retired.
6. **AC #6 — 16-import inventory re-captured after PR HA:** `grep -rn "from ['\"]@coms-portal/shared" packages` (excluding `node_modules`, `.svelte-kit`, build artefacts) returns 0 matches in `coms_aha_heroes` post-migration. Post-F4 the count of `@coms-portal/sdk` imports is still 16: 15 top-level barrel imports (server-side, type-only) plus 1 subpath import (`@coms-portal/sdk/constants/app-launcher`, browser-bundled).
7. **AC #7 — No regression in the SDK's test suite:** Final SDK release at `v1.2.0` runs 85 tests (was 81 pre-spec; +4 from `app-launcher-reexport.test.ts` and `cli.test.ts:COMS_PORTAL_CLI_OIDC_TOKEN`), 0 fail. `bun run typecheck` clean. Portal typecheck untouched by Spec 02's planned PRs; F8/F9 added one test file (`route-compose.test.ts`) and renamed one route param.
8. **AC #8 — Spec 02 marked SHIPPED in spec-00:** Done. Spec 00 timeline now records all five planned PRs, the nine follow-up patches, and the SDK tag at `v1.2.0`.

---

## Post-ship discoveries

Four bugs surfaced between the planned PRs landing and AC #2 being live-verified. None invalidates the spec; each is documented here so a future operator can recognize the failure mode.

### D1 — SDK barrel barred browser bundles

**Symptom:** Heroes' first CD run after F1 (the IAM apply, run `25477146036`) died at `vite-plugin-sveltekit-compile`:

> `node_modules/.bun/@coms-portal+sdk@.../webhook.ts (1:9): "createHmac" is not exported by "__vite-browser-external"`

**Cause:** `(authed)/+layout.svelte` imports `APP_LAUNCHER` from the SDK barrel. The SDK's `package.json` had no `sideEffects` declaration, so Vite/Rollup treated every barrel re-export as potentially-side-effectful and pulled `webhook.ts` (`node:crypto`) and `manifest.ts` (lazy `google-auth-library`) into the browser graph. Tree-shaking does not look at consumer code — it conservatively keeps the whole module if it cannot prove the module is pure.

**Fix:** F3 — declared `"sideEffects": false` package-wide AND opened a `./constants/app-launcher` subpath. F4 — Heroes' layout imports `from '@coms-portal/sdk/constants/app-launcher'`. The subpath sidesteps barrel scanning entirely; the `sideEffects: false` is the right declaration regardless. SDK cut at `v1.1.1`.

**Why neither §VA nor §VB caught it:** Both verification artefacts run in Node/Bun. Spec 02 has no browser-bundle smoketest. Filed as `mrdoorba/coms-sdk#1`.

### D2 — google-auth-library cannot mint OIDC ID tokens for WIF + impersonation chains

**Symptom:** Heroes' second CD run (after F4 unblocked the build, run `25477146036`) reached `register-manifest` and died with:

> `coms-portal-cli: auth failure: Cannot fetch ID token in this environment, use GCE or set the GOOGLE_APPLICATION_CREDENTIALS environment variable to a service account credentials JSON file.`

`GOOGLE_APPLICATION_CREDENTIALS` was set; the message is misleading.

**Cause:** SDK `manifest.ts:defaultGetIdToken` calls `new GoogleAuth().getIdTokenClient(audience)`. With external_account credentials (WIF) chained through `service_account_impersonation_url`, google-auth-library v9 / v10 has no path to mint an OIDC ID token through the impersonation — `getIdTokenClient` only knows how to wrap local-signing credentials. There is no public `Impersonated.fetchIdToken` shape that SDK code can use without dynamic-typing through library internals.

**Fix:** F5 — added `COMS_PORTAL_CLI_OIDC_TOKEN` env var to the SDK CLI. When set, the CLI uses the value as the `Authorization: Bearer …` header verbatim and does not invoke google-auth-library at all. The CD environment becomes responsible for minting; the CLI becomes a thin HTTP shim. SDK cut at `v1.2.0`. The existing ADC path remains the default for environments that mint locally (GCE / Cloud Run / SA-key files / `gcloud auth application-default login`).

### D3 — `google-github-actions/auth` `token_format: 'id_token'` returns 403 on this binding

**Symptom:** F6 wired the workflow to ask the auth action for an ID token. The action called `IAMCredentials.generateIdToken` and got back:

> `403 PERMISSION_DENIED — iam.serviceAccounts.getOpenIdToken denied on resource (or it may not exist)`

The deployer SA holds `roles/iam.serviceAccountTokenCreator` on the runtime SA — the role that explicitly grants `iam.serviceAccounts.getOpenIdToken`. Verified live with `gcloud iam service-accounts get-iam-policy`. A user-shell `gcloud auth print-identity-token --impersonate-service-account` against the same binding worked and returned a well-formed ID token.

**Cause:** Unexplained. Same role grant, same target SA, same audience, same IAMCredentials API — but the auth-action client path returns 403 while the gcloud client path succeeds. Likely a subtle difference in how each tool composes the impersonation chain or formats the audience, but diagnosing it was not on the deploy hot path.

**Fix:** F7 — drop the auth action's `token_format: 'id_token'` request. Instead: authenticate via the auth action (deployer SA ADC), then in a separate step call `gcloud auth print-identity-token --impersonate-service-account=<runtime-sa> --audiences=<portal-url> --include-email`, mask the output, thread it into `register-manifest` via `COMS_PORTAL_CLI_OIDC_TOKEN`. Same role, same API, but a client path known to work with this binding shape.

**Why this matters for future H-app onboarders:** The canonical "modern" pattern from the auth action's docs (`token_format: 'id_token'`) does not work here. New H-apps that copy Heroes' deploy.yml inherit the gcloud-mint workaround. If GitHub or Google fix the upstream, F7 should be reverted to the canonical form — the SDK-side env-var hook (F5) accepts either source.

### D4 — Portal route never served traffic until 2026-05-07

**Symptom:** F7 unblocked auth; the CLI's POST reached the portal and got back a SvelteKit 404 page from `https://coms-portal-app-….run.app/api/v1/apps/heroes/manifest`. Other portal API routes worked (e.g. `/api/v1/audit-log` returned 401). Only the manifest route 404'd.

**Cause:** Spec 01 PR D mounted `appManifestRoutes` at prefix `/apps/:slug/manifest` in `cb34577`. `apps.ts` and `app-webhooks.ts` already register `/apps/:id/...` siblings. Elysia's underlying memoirist router rejects two different parameter names at the same trie position; the conflict throws at `app.handle` / `app.listen()` compose time. Cloud Run revisions cb34577-onwards (`coms-portal-app-00227-pmc` and every revision since, including the deploy of `8736d0d` two hours earlier) crashed at TCP probe with:

> `error: Cannot create route "/api/v1/apps/:slug/manifest/" with parameter "slug" because a route already exists with a different parameter name ("id") in the same location`

Cloud Run kept serving from the last healthy revision (pre-`cb34577`), so external traffic continued — but the manifest route was never live. **Spec 01 §AC #7 ("Portal POST /v1/apps/:slug/manifest is live") was not actually satisfied at v1.0.0 ship time** — it was a quiet false-positive that survived 2.5 weeks because no consumer exercised the route.

**Fix:** F8 — rename the prefix's param from `:slug` to `:id` to match siblings. The captured value is still semantically a slug; only the param NAME changes (memoirist conflicts on names, not values). The handler's match logic is unaffected. Added `apps/api/src/__tests__/route-compose.test.ts` that imports the composed app and dispatches one request — forces memoirist to build, catches any future param-name collision at unit-test time. F9 — drop a `.ts` extension the test inadvertently used (tsc strict).

**Why neither Spec 01 PR D's tests nor portal CI caught it:** `app-manifest.test.ts` exercises the route in isolation (no sibling routes); `bun apps/api/server.ts` runs only at deploy time on the runtime image. Filed as `mrdoorba/coms-portal#3` (generalize the canary); closed by F11 above — the canary now walks `app.routes` proactively rather than relying on memoirist's lazy throw.

---

## Filed follow-up issues

Four issues filed at SHIPPED time, capturing class-of-bug fixes that fall outside Spec 02's scope but are direct consequences of the post-ship discoveries:

| Issue | Repo | Title | Origin | Status |
|---|---|---|---|---|
| [#1](https://github.com/mrdoorba/coms-sdk/issues/1) | `coms-sdk` | Add `examples/web-bundle-smoketest/` — verify SDK works in browser bundles | D1 | open |
| [#3](https://github.com/mrdoorba/coms-portal/issues/3) | `coms-portal` | Generalize route-compose regression test — assert no param-name conflicts across any prefix | D4 | **closed** by F11 |
| [#4](https://github.com/mrdoorba/coms-portal/issues/4) | `coms-portal` | Fix pre-existing test failures in `apps/api/src/services/__tests__/manifests.test.ts` | Surfaced during Spec 02 — pre-existing, blocks the CD typecheck-and-tests gate from being meaningful | **closed** by F10 |
| [#5](https://github.com/mrdoorba/coms-aha-heroes/issues/5) | `coms_aha_heroes` | Reconcile infra drift between OpenTofu config and live Cloud Run state | Surfaced during F1 `tofu apply -target` — pre-existing, has real prod env-var risk | open |

Two of the four are now closed (F10, F11 same day as ship). The remaining two are tracker entries, not scheduled work. Pick up in any order; #5 has the most production risk, #1 closes the verification gap that produced D1.

---

## Operator briefing — what a future session needs to know

If you `git pull` and want to ramp on Spec 02 from a clean conversation:

1. **Read this entire file before changing code.** The §Commit ledger is the single source of truth for what shipped; the §Post-ship discoveries are the single source of truth for why each follow-up patch exists.
2. **The SDK is at `v1.2.0`,** not v1.1.0 as originally planned. Two patch/minor bumps shipped during the discovery loop. New consumers should pin `git+https://github.com/mrdoorba/coms-sdk.git#v1.2.0`.
3. **Heroes' workflow uses `gcloud auth print-identity-token --impersonate-service-account` (F7), not the auth action's `token_format: 'id_token'` (F6).** The latter returns 403 against this binding shape for reasons unknown. If you change Heroes' `register-manifest` step or copy it to a new H-app, keep the gcloud path.
4. **Heroes' `(authed)/+layout.svelte` imports `APP_LAUNCHER` from the `@coms-portal/sdk/constants/app-launcher` subpath, NOT the barrel.** Other Heroes files use the barrel safely (server-side, type-only imports). If a future Heroes file imports from the barrel from a browser-bundled context, the build crashes with `createHmac is not exported by __vite-browser-external` — flip it to the subpath.
5. **Portal route param under `/api/v1/apps/:X/...` is `:id`, NOT `:slug`** — even when the captured value is a slug string. memoirist requires param-name uniformity across siblings at the same trie position. The `route-compose.test.ts` regression test catches new conflicts. If it fails at startup, look for a sibling that introduced a different param name.
6. **AC #2 was the last criterion to verify.** It is now closed. There is no further Spec 02 work in flight; pick from the four filed follow-up issues if you want to keep the thread warm.

---

## Status — 2026-05-07 (drafted and SHIPPED same day; all five PRs landed)

Spec 01 PR breakdown closed with all eight PRs SHIPPED (A → H, plus the portal-side route in PR D). The Heroes-side coordination block in Spec 01 enumerated three optional adoption PRs (H-1 broker verifier, H-2 manifest-as-code, H-3 HS256 verify drop) and described H-3 as "**the prerequisite for SDK v2.0**". That breakdown assumed Heroes had an in-repo broker-token JWT verifier that needed migration. Inspection of `coms_aha_heroes` on the same day shows **Heroes has no such verifier** — it uses the portal's one-time `portal_code` exchange flow for user auth, and Google OIDC ID-token verification (`verifyGoogleIdToken`) for portal-webhook authentication. Neither path goes through `verifyBrokerToken` or `verifyWebhookSignature`.

The discovery doesn't invalidate Spec 01's v1.0 cut — the SDK's surface and acceptance criteria stand — but it does shift what "Heroes adopts SDK v1.0" actually means. This spec corrects the model and ships the real adoption plan: the five PRs (SA / VA / VB / HA / HB) all landed the same day the spec was drafted; per-PR commit SHAs are recorded in the SHIPPED status block at the top of this file.

---

## Discovery — what Heroes actually consumes from the portal contracts (2026-05-07)

Inventory of `@coms-portal/shared` imports in `coms_aha_heroes`, captured from `grep -rn "from ['\"]@coms-portal/shared" packages` (excluding `node_modules`, `.svelte-kit`, build artefacts). 16 import sites total.

| File | Import |
|---|---|
| `packages/web/src/routes/(authed)/+layout.svelte:4` | `import { APP_LAUNCHER } from '@coms-portal/shared'` |
| `packages/server/src/routes/portal-webhooks.ts:2` | `import type { PortalWebhookEnvelope } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-bootstrap.ts:1` | `import type { TaxonomyUpsertedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-bootstrap.test.ts:2` | `import type { TaxonomyUpsertedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-alias-deleted.ts:1` | `import type { AliasDeletedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-alias-resolved.ts:1` | `import type { AliasResolvedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-alias-updated.ts:1` | `import type { AliasUpdatedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-app-config-updated.ts:1` | `import type { AppConfigEvent } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-employment-updated.ts:2` | `import type { EmploymentUpdatedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-session-revoked.ts:1` | `import type { SessionRevokedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-taxonomy-deleted.ts:1` | `import type { TaxonomyDeletedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-taxonomy-upserted.ts:1` | `import type { TaxonomyUpsertedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/handle-user-updated.ts:2` | `import type { UserUpdatedPayload } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/payload-projection.ts:1–6` | `import type { EmploymentBlock, EmploymentUpdatedPayload, TaxonomyRef, WebhookUserEnvelope } from '@coms-portal/shared'` |
| `packages/server/src/services/portal-events/payload-projection.test.ts:2` | `import type { WebhookUserEnvelope } from '@coms-portal/shared'` |
| `packages/shared/src/auth/session.ts:3` | `import type { PortalSessionUser } from '@coms-portal/shared/contracts/auth'` |

Observations:

1. **15 of 16 imports are type-only.** Only `APP_LAUNCHER` (a runtime constant in a Svelte template) is value-import.
2. **All imported types are re-exported by `@coms-portal/sdk@v1.0.0`** per the v0.3.0 (PR B) re-export block. The constant `APP_LAUNCHER` is **not** currently re-exported by the SDK — it lives in `@coms-portal/shared/constants/app-launcher`. This is the single drop-in audit gap.
3. **One subpath import** (`@coms-portal/shared/contracts/auth`) — the SDK does not currently expose a `@coms-portal/sdk/contracts/auth` subpath. Heroes' import would have to move to the bare `@coms-portal/sdk` path.
4. **No SDK primitive (`verifyBrokerToken`, `verifyWebhookSignature`, `signWebhookPayload`, `resolveAlias`, `introspectSession`, `getAuditLog`) is used by Heroes today.** The Heroes auth model does not need them.

### Heroes auth model (confirmed)

- **User auth:** `packages/web/src/lib/server/portal-broker.ts:75` — `exchangePortalCode(code)` POSTs the one-time portal_code to `/api/auth/broker/exchange`. The portal verifies the code server-side and returns a JSON `PortalBrokerExchangePayload`. **No client-side JWT verification.**
- **Portal-webhook auth:** `packages/server/src/routes/portal-webhooks.ts:59` — `verifyGoogleIdToken({...})` (defined at `packages/server/src/lib/oidc.ts:21`). Authenticates inbound portal webhooks by their Google OIDC ID token, **not** by HMAC signature. The dispatcher does not call `verifyWebhookSignature`.

### Implication for SDK v2.0 / Heroes Phase 7

Spec 01 §"Heroes-side coordination" called Heroes Phase 7 (HS256 verify drop) "the prerequisite for SDK v2.0." That gate exists because the SDK keeps HS256 verification in 1.x for legacy consumers. **Heroes is not such a consumer.** No gate operation against Heroes is required for the v2.0 cut; the gate now reads as "no other consumer relies on HS256 verify". Today's known consumer set is `{Heroes}`, and Heroes' set of HS256 calls is empty. **SDK v2.0 is therefore unblocked from Heroes' side as of 2026-05-07** — pending confirmation that no future H-app onboarded post-v1.0 takes a hard dep on the HS256 path.

This is a Q-deferred decision below.

---

## Problem

1. **Spec 01 §Acceptance criterion #5 is unverified.** "Backwards compatibility verified. A consumer pinned to v0.1.1 importing `verifyBrokerToken`, `verifyWebhookSignature`, `resolveAlias`, `introspectSession`, `getAuditLog` works against v1.0 with zero code changes." The SDK's own test suite confirms the exports exist with unchanged signatures, but no real consumer has bumped from v0.1.1 to v1.0.0. **Heroes cannot satisfy this criterion** because Heroes is not a v0.1.x SDK consumer.
2. **Spec 01 §Acceptance criterion #1 is unverified end-to-end.** "Onboarding is `bun add` + ~30 lines." The sample integration in §Surface compiles in isolation but has not been walked through against a real H-app's CD pipeline.
3. **Heroes ↔ portal contract drift remains a soft surface.** The 16 type imports above guard Heroes against payload-shape regressions only at compile time, and only when `@coms-portal/shared` is bumped. The Q2 promise of Spec 01 (single import source via `@coms-portal/sdk`) is not yet exercised by a real consumer.
4. **Heroes' admin-UI manifest cannot be CI-verified.** The Heroes manifest (configSchema + taxonomies) was registered through the portal admin UI at app-registration time. It lives only in the portal's `app_manifests` row; the Heroes repo has no source-of-truth file. A schema field added to the H-app code without a corresponding admin-UI edit produces silent drift that surfaces only when a config field fails to validate at runtime.
5. **The H-1 / H-3 PRs from Spec 01's Heroes-side coordination are no-ops.** Heroes has no in-repo broker verifier to migrate (H-1) and no HS256 verify path to drop (H-3). Spec 01 listed them as out-of-scope-for-v1.0 placeholders; this spec marks them resolved-by-discovery.
6. **The Spec 01 verification belt is missing one rung.** No guard exists today to confirm that a future H-app's `package.json` pinning `@coms-portal/sdk@^1.0.0` does in fact get the full set of types it needs. Today the only test of that claim is the SDK's internal test suite.

---

## Scope

**In scope:**

- A drop-in re-export audit on Heroes — replace 15 of 16 `@coms-portal/shared` import sites with `@coms-portal/sdk`, leave the 16th (`APP_LAUNCHER`) on shared until the SDK adds a re-export. Verify Heroes' `bun run typecheck` passes unchanged.
- One small SDK additive change if the audit demands it: add the `APP_LAUNCHER` re-export to `@coms-portal/sdk`'s top-level so Heroes can complete the migration without leaving a single dangling import. Ships as `v1.1.0` (additive minor).
- Heroes adopts manifest-as-code: write `portal-manifest.ts` in the Heroes repo, add `coms-portal-cli register-manifest` to Heroes' CD pipeline, register the manifest exactly equal to the row currently in the portal's `app_manifests` table for `slug='heroes'`. Verify the run is a no-op (GREATEST schemaVersion) on the first invocation.
- A fresh-H-app walkthrough (paper or scratch repo) of the Spec 01 §Acceptance #1 onboarding target. Confirms the "30 lines of glue" claim against a clean slate.
- Decision lock on whether SDK v2.0 (HS256 drop) is unblocked.

**Out of scope:**

- Migrating Heroes' user-auth path off the one-time-code exchange flow. The exchange flow is a deliberate platform choice, not legacy debt; the SDK's `verifyBrokerToken` is not its replacement.
- Migrating Heroes' webhook-auth path from Google OIDC to HMAC + `verifyWebhookSignature`. Both paths are first-class on the portal side; switching is not justified.
- Any change to the SDK surface beyond the `APP_LAUNCHER` re-export (if locked).
- Heroes Phase 7 as originally framed (HS256 verify drop). The phase is a no-op against Heroes; this spec retires it.
- Multi-portal-instance support. Carried over from Spec 01 §Out of scope.

---

## Decisions log (all locked)

| # | Question | Decision | Reason |
|---|---|---|---|
| Q1 | Does the SDK add an `APP_LAUNCHER` re-export, or does Heroes keep that one constant import on `@coms-portal/shared`? | **Add the re-export. Cuts SDK `v1.1.0` (additive minor).** | Spec 01 §Q2 promised a single import source for H-app consumers. Leaving one stranded shared-only import contradicts the promise and forces every consumer that uses `APP_LAUNCHER` to declare two deps for one feature. The cost is one line in `src/index.ts`; the alternative is structural drift away from the v1.0 design. |
| Q2 | Same question for the `@coms-portal/shared/contracts/auth` subpath (`PortalSessionUser` import in `packages/shared/src/auth/session.ts`). | **No SDK change. Heroes changes the import path to `@coms-portal/sdk` — the type is already re-exported at the top level as of v1.0.0.** | The v1.0 surface already covers this case via the existing top-level `PortalSessionUser` re-export. PR HA's import migration is sufficient. |
| Q3 | Does the SDK expose a `@coms-portal/sdk/contracts/*` subpath family for parity with `@coms-portal/shared/contracts/*`? | **No. The SDK keeps a flat top-level surface.** | Subpaths are an internal organisation detail of `@coms-portal/shared`; the SDK is the consumer-facing facade and consumers want one import path. Adding the subpath family would publish an API the design intent says should be hidden. |
| Q4 | Heroes manifest-as-code — does the Heroes repo become the source of truth, with the portal admin UI demoted to read-only for Heroes? | **Yes for `slug='heroes'` specifically. The admin UI's manifest editor becomes a current-state view for this app once `portal-manifest.ts` is committed.** | Heroes' CD pipeline running `coms-portal-cli register-manifest` on every deploy overwrites any drift introduced through the admin UI; that is enforcement enough without portal-side UI gating. Other apps that have not adopted manifest-as-code remain fully editable through the admin UI. |
| Q5 | Is SDK v2.0 (HS256 drop) unblocked from Heroes' side? | **Yes. Heroes does not call `verifyBrokerToken` at all; the original "Heroes Phase 7" gate is moot.** | The discovery section confirms Heroes uses the portal's exchange flow, not direct broker-token verification. The remaining v2.0 gate is "no consumer relies on HS256 verify" — that check belongs to the portal team at the moment v2.0 is cut, not to Heroes. |
| Q6 | Spec 01 §AC #5 ("v0.1.x consumer bumps to v1.0 with zero code changes") — how is it verified given Heroes is not a v0.1.x consumer? | **PR VA: a `examples/v0-compat-smoketest/` directory in the SDK repo with a 5-line consumer importing each v0.1.x export from `@coms-portal/sdk@v1.0.0` and asserting each is a function. Commit on `main`; tag nothing.** | The criterion's intent is "no real consumer breaks." With no real v0.1.x consumer to break, the smoketest is the smallest artefact that turns the claim from "passes our own tests" into "passes a real import." |
| Q7 | Spec 01 §AC #1 ("`bun add` + ~30 lines") walkthrough — paper, scratch repo, or skipped? | **PR VB: scratch repo. Build a minimal Elysia H-app from `bun init`, install `@coms-portal/sdk@v1.0.0`, reproduce Spec 01 §Surface "Sample H-app integration", point it at a `stubJwks` mock, confirm `/me` returns the portal user. Archive in `examples/onboarding-scratch/` after.** | Paper review is too easy to fool — every spec author thinks their own example is concise. Building it against a fresh `bun init` is the only way to falsify the LOC claim. |
| Q8 | Heroes admin-UI manifest editor — should it warn / disable editing for apps that have a `manifestPath` registered via the CLI path? | **Defer to a future spec.** | Locking a multi-app UI-gating policy now, before a second app adopts manifest-as-code, would over-fit to Heroes. Operator discipline (CD overwrites drift on next deploy) is sufficient for the single-consumer case. Re-evaluate when a second app reaches Q4. |

---

## PR breakdown (all five PRs are now scheduled)

Each PR ships as a `/mr-door-commit` per Mr. Door protocol. Order is open — none of the five blocks any other.

### SDK side

- **SA — Add `APP_LAUNCHER` re-export.** Single-line addition to `src/index.ts` plus a CHANGELOG entry. Ships as `v1.1.0` (additive minor). Tag `v1.1.0` on `mrdoorba/coms-sdk`. No new tests beyond confirming the export resolves at typecheck. (Per Q1.)
- **VA — `examples/v0-compat-smoketest/` in the SDK repo.** Five-line consumer that imports each of `verifyBrokerToken`, `verifyWebhookSignature`, `signWebhookPayload`, `resolveAlias`, `introspectSession`, `getAuditLog` from `@coms-portal/sdk@v1.0.0` and asserts each is a function. Commit on `main`; tag nothing. Closes Spec 01 §AC #5. (Per Q6.)
- **VB — `examples/onboarding-scratch/` in the SDK repo.** Minimal Elysia H-app reproducing Spec 01 §Surface's "Sample H-app integration" block. Use `@coms-portal/sdk/testing` to mint a token + stub JWKS; assert the `/me` route returns the expected payload. Record total LOC against Spec 01's "~30 lines" claim. Closes Spec 01 §AC #1. (Per Q7.)

### Heroes side

- **HA — Drop-in re-export audit.** In `coms_aha_heroes`, replace 16 of 16 `@coms-portal/shared` import sites with `@coms-portal/sdk` — including the `APP_LAUNCHER` constant once SA ships, and the `PortalSessionUser` subpath import which moves to the bare SDK path. Verify `bun run typecheck` and the existing test suite both pass. **No semantic changes to Heroes — pure import-source migration.** (Per Q1, Q2, Q3.)
- **HB — Manifest-as-code.** Write `packages/server/portal-manifest.ts` in Heroes (or wherever the team's convention places deploy-time artefacts), exactly mirroring the portal's current `app_manifests` row for `slug='heroes'`. Add `coms-portal-cli register-manifest --portal-url $PORTAL_URL --app-slug heroes --manifest ./portal-manifest.ts` to Heroes' CD pipeline. First run is a no-op (GREATEST schemaVersion); subsequent runs become the source of truth. (Per Q4.)

---

## Acceptance criteria

Locked at write time of *this* spec, not Spec 01.

1. **Heroes typecheck passes after import migration** with the same green status it had on `main` of `coms_aha_heroes` at `coms-portal/sdk@v1.0.0` cut. No code changes outside import lines.
2. **Heroes manifest-as-code first run is a no-op.** The CLI exits 0 with `schemaVersion` equal to the row already in the portal's `app_manifests` table for `slug='heroes'`.
3. **Spec 01 §AC #5 falsifiable.** PR VA exists, runs green, and is committed on `mrdoorba/coms-sdk` `main`.
4. **Spec 01 §AC #1 substantiated.** PR VB exists; the sample integration's actual LOC is recorded in the Spec 02 §Acceptance result block at SHIPPED time.
5. **SDK v2.0 gate explicitly unblocked-from-Heroes** in `docs/architecture/rev4/spec-01-sdk-v1.md` and in the Heroes-side Spec 01 coordination block. The "Heroes Phase 7" terminology is retired.
6. **The 16-import inventory above is re-captured after PR HA lands** to prove the migration is complete. Target: 0 `@coms-portal/shared` imports remaining in `coms_aha_heroes` (since Q1 locks `APP_LAUNCHER` as re-exported).
7. **No regression in the SDK's 81-test suite** when PR SA (`v1.1.0`) lands. No regression in the portal's typecheck if any portal-side change is required.
8. **Spec 02 marked SHIPPED** in `docs/architecture/rev4/spec-00-implementation-timeline.md` with the per-PR commit SHAs and the new SDK tag (`v1.1.0`).

---

## Out of scope (until trigger fires)

- Heroes adopting `verifyBrokerToken` / `verifyWebhookSignature` / `requireBrokerAuth`. Not justified — Heroes' auth model does not pass through these primitives.
- Heroes adopting `defineWebhookHandler`. Possible-and-nice — Heroes' `dispatchPortalEvent` already type-discriminates on `envelope.event` manually. Migration is mechanical but not load-bearing; defer until a second app exercises it or until Heroes takes the migration as a code-quality task.
- Multi-portal-instance routing.
- Replacing `@coms-portal/shared` with the SDK as the contract source-of-truth. Shared remains the source of truth; the SDK is the consumer-facing facade only (Spec 01 §Q2).

---

## Handoff notes for next session

All eight decisions are locked above; the next session opens straight into implementation.

1. **Re-read the §Discovery section first.** The inventory was taken at 2026-05-07 against `coms_aha_heroes`'s `main`. If Heroes has merged anything that touches `@coms-portal/shared` imports between draft time and the implementation session, re-run the grep:

   ```bash
   grep -rn "from ['\"]@coms-portal/shared" /Users/mac/HT/Project/coms_aha_heroes/packages \
     | grep -v node_modules | grep -v ".svelte-kit" | grep -v "build/" | grep -v "dist/"
   ```

2. **Recommended implementation order** (any order is valid; this one minimises rework):

   1. SA — single-line SDK addition, cuts `v1.1.0`. Cheapest first move; unblocks HA's `APP_LAUNCHER` migration.
   2. VA — five-line consumer in `examples/v0-compat-smoketest/`. Closes Spec 01 §AC #5 immediately.
   3. VB — scratch onboarding repo. Records actual LOC for Spec 01 §AC #1.
   4. HA — Heroes import migration (16 sites). Mechanical; verify `bun run typecheck` and the test suite both pass with no source changes other than imports.
   5. HB — Heroes manifest-as-code. Requires a one-time read of the portal's `app_manifests` row for `slug='heroes'` to mirror exactly; first CLI run must come back as a no-op (GREATEST schemaVersion).

3. **The SDK pin in Heroes' `packages/server/package.json`** will need adding: `"@coms-portal/sdk": "git+https://github.com/mrdoorba/coms-sdk.git#v1.1.0"`.

4. **Do not skip VA or VB.** They are the only forces that turn Spec 01's acceptance criteria from "passes our own tests" into "passes a real consumer." Spec 01 marked itself SHIPPED on the strength of its internal verification; this spec exists in part because that proof was structurally weak for two of the ten criteria. Locking Q6 and Q7 above is not a substitute for actually building the artefacts.

5. **Spec 01 §"Heroes-side coordination"** retains its outdated H-1/H-2/H-3 terminology. After PRs HA + HB ship and Spec 02 closes, edit Spec 01's coordination block to point at this spec for the actual adoption story, and retire the H-1/H-3 placeholders explicitly. (Spec 01 itself stays SHIPPED — only the coordination footnote is amended.)
