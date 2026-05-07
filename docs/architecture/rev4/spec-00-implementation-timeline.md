# Rev 4 — Spec 00: Implementation Timeline

> Coordination plan for Rev 4. Opened 2026-05-06 when Rev 3 closed.
>
> Rev 4 holds two new specs — Spec 01 (SDK v1.0, SHIPPED 2026-05-07) and Spec 02 (SDK v1.0 Heroes Adoption & Verification, SHIPPED 2026-05-07) — plus the two specs that were architecture-decided in Rev 3 but trigger-deferred (Spec 04 User Preferences, Spec 05 Suite Search). Specs 04 and 05 retain their original numbers as inherited Rev 3 specs; new Rev 4 specs number from 01.
>
> **Prerequisites:** Rev 3 closed end-to-end (account widget, identity ownership, alias layer, dual-email auth, org taxonomies + employment block, Heroes cutover). Identity is centrally owned, written, and authenticated; the suite-UX surface is established. Rev 4 builds against that foundation.
>
> **Numbering convention:** From Rev 4 onward, spec numbers restart at 01 within each rev. Inherited specs (04, 05 in this rev) keep their Rev 3 numbers — the gap (02, 03 missing) is informative, signalling those specs are continuations rather than new Rev 4 work. Cite as "Rev N Spec NN" when crossing rev boundaries to avoid ambiguity.

---

## Status — 2026-05-07 (Specs 01 and 02 SHIPPED; Spec 06 PR A + B + cross-repo SHIPPED; only §2 sweep remains)

Rev 4 status:

- **Spec 01 (SDK v1.0)** SHIPPED 2026-05-07. PRs A → H all landed in
  `mrdoorba/coms-sdk` (eight commits between `85573b5` and the v1.0.0 cut)
  plus the portal-side route in `mrdoorba/coms_portal` (commit `cb34577`).
  SDK released as `v1.0.0` git tag.
- **Spec 02 (SDK v1.0 Heroes Adoption & Verification)** SHIPPED 2026-05-07,
  AC #2 live-verified in production CD on the same day. Five planned PRs
  (SA / VA / VB / HA / HB) plus nine follow-up patches (F1–F9) at ship,
  plus four post-ship follow-ups (F10–F13) that closed all four filed
  issues (#1, #3, #4, #5) the same day, shipped across three repos. SDK cut at `v1.2.0`
  (originally planned at v1.1.0; v1.1.1 + v1.2.0 patches added during
  the deploy loop — see `spec-02-sdk-v1-heroes-adoption.md`
  §Post-ship discoveries D1–D4).
  Heroes migrated all 16 `@coms-portal/shared` imports to
  `@coms-portal/sdk`, adopted manifest-as-code via `coms-portal-cli
  register-manifest` in CD, and the first live registration logged
  `schemaVersion=2, registeredAt=2026-05-07T05:42:32.600Z` — the planned
  GREATEST(schemaVersion) no-op against the seeded `app_manifests` row
  for `slug='heroes'`. Spec 01's two structurally-weak acceptance
  criteria (#1 onboarding, #5 v0.1.x compat) are now falsifiable against
  real consumers (`examples/v0-compat-smoketest/` and
  `examples/onboarding-scratch/`). The "Heroes Phase 7" terminology is
  retired — SDK v2.0 is unblocked from Heroes' side as of today. Four
  filed follow-up issues captured class-of-bug fixes that fall outside
  Spec 02's scope; all four were closed same day by F10/F11/F12/F13:
  [coms-sdk#1](https://github.com/mrdoorba/coms-sdk/issues/1) (web-bundle smoketest, **closed by F12**),
  [coms-portal#3](https://github.com/mrdoorba/coms-portal/issues/3) (generalize route-compose canary, **closed by F11**),
  [coms-portal#4](https://github.com/mrdoorba/coms-portal/issues/4) (manifests test mocks, **closed by F10**),
  [coms-aha-heroes#5](https://github.com/mrdoorba/coms-aha-heroes/issues/5) (infra drift, **closed by F13**).
- **Spec 03 (HS256 rip-out)** opened 2026-05-07 as a DRAFT
  (commit `7e19e75`). Not started; gates Spec 06's §2 quickstart deletions.
- **Spec 06 (Onboarding — Smoketest + Quickstart Revision)** **PR A
  + PR B + cross-repo addition SHIPPED 2026-05-07; partial PR C
  SHIPPED.** Portal commit `fa78164` (PR A + partial PR C); SDK
  commit `9356049` tagged as `@coms-portal/sdk@v1.3.0` (PR B); shared
  commit `6452869` tagged as `@coms-portal/shared@v1.7.0` (cross-repo
  addition); portal commit `00bf511` bumped the shared pin to v1.7.0
  and removed the inline `as PortalWebhookEvent` cast. PR A landed
  the portal route `POST /api/v1/apps/:slug/smoketest` at
  `apps/api/src/routes/app-smoketest.ts` (mounted in the `/v1` OIDC
  group; 9-case test suite green). PR B added `coms-portal-cli
  smoketest <slug>` plus the `runSmoketest` programmatic API to the
  SDK (11 module tests + 7 CLI integration tests, full SDK suite 106
  pass, typecheck clean; same exit-code matrix as register-manifest:
  0/1/2/3 for success/auth/validation/network). The cross-repo
  addition put `'app.smoketest'` formally into `PORTAL_WEBHOOK_EVENTS`
  (3-case test in `v1_7_0-types.test.ts`; full shared suite 31 pass).
  PR C partial: quickstart §0 ("Pick your path"), §3.1 ("Spec 07
  envelope contract — four invariants"), and §8 ("Wire protocol
  reference") all landed; §2's `token_exchange` / `same_host_cookie`
  deletions are footnoted and deferred until Spec 03 ships the
  post-rip surface. Sole remaining work: PR C's §2 sweep (gated on
  Spec 03). Note: `mrdoorba/coms-sdk`'s own shared pin is still on
  v1.6.0 — consumers importing `PORTAL_WEBHOOK_EVENTS` from the SDK
  barrel will not see the new literal until the SDK bumps its pin
  and cuts a minor. Consumer-side ergonomics, not contract
  correctness; `runSmoketest` does not consult the constant.
- **Spec 04 / Spec 05** remain trigger-deferred (carried over from Rev 3 with original numbers).

Open work: Spec 03 (HS256 rip-out) draft, plus the Spec 06
follow-ups above (PR B in coms-sdk; coms-shared event constant; PR C
§2 sweep gated on Spec 03). Specs 04 and 05 ship only when their
respective triggers fire (see each spec's §Triggers to ship section).

---

## Specs

| Spec | Title | Status | Trigger / Sequencing |
|------|-------|--------|---------|
| 01 | SDK v1.0 — Contract Lock & Onboarding Surface | **SHIPPED 2026-05-07** (`@coms-portal/sdk@v1.0.0`). | Triggered by post-Spec-08 onboarding-friction review. Shipped portal/SDK-side; Heroes adoption was carved off into Spec 02. SDK v2.0 (HS256 drop) was gated on "Heroes Phase 7" — Spec 02 §Q5 re-evaluates whether that gate is still meaningful (Heroes does not call `verifyBrokerToken`). |
| 02 | SDK v1.0 Heroes Adoption & Verification | **SHIPPED 2026-05-07.** Five planned PRs + nine ship follow-up patches (F1–F9) + four post-ship follow-ups (F10–F13) landed; SDK released as `v1.2.0` git tag (originally planned at v1.1.0). AC #2 live-verified in production. | Triggered by post-Spec-01 Heroes inspection. Heroes consumes portal contracts via 16 type imports from `@coms-portal/shared` and uses the portal-server-side exchange flow for auth — the original H-1/H-2/H-3 breakdown was based on a stale model. Closed Spec 01's two structurally-weak acceptance criteria (#1 onboarding, #5 v0.1.x compat) via real-consumer verification. Four post-ship discoveries (browser-bundle barrel scan, google-auth-library WIF+impersonation gap, auth-action 403, memoirist param-name conflict that left Spec 01 §AC #7 a quiet false-positive for 2.5 weeks); all four filed follow-up issues (#1, #3, #4, #5) closed same day by F10/F11/F12/F13 — see [spec-02-sdk-v1-heroes-adoption.md](spec-02-sdk-v1-heroes-adoption.md). |
| 03 | HS256 rip-out | **DRAFT** opened 2026-05-07 (`7e19e75`). Not started. | Gates Spec 06's §2 quickstart deletions (`token_exchange` / `same_host_cookie` prose). See [spec-03-hs256-rip-out.md](spec-03-hs256-rip-out.md). |
| 06 | Onboarding — Smoketest + Quickstart Revision | **PR A + PR B + cross-repo SHIPPED 2026-05-07** (Portal `fa78164` + `00bf511`; SDK `9356049` tag `v1.3.0`; Shared `6452869` tag `v1.7.0`). PR C partial — §0 / §3.1 / §8 landed; §2 deletions deferred until Spec 03 ships. Sole remaining work: PR C's §2 sweep. | Triggered by post-Spec-02 architecture review of the superapp surface — six gaps identified (GCP SA provisioning, three-modes-documented-one-used, no retrofit path, no deploy-time smoketest, Spec 07 envelope tribal knowledge, non-TS path undocumented). See [spec-06-onboarding-scaffolding.md](spec-06-onboarding-scaffolding.md). |
| 04 | Unified User Preferences (Theme + Language) | Architecture decided. Deferred. | Third H-app onboards, portal localizes, user-visible drift incident, or Rev 3 Spec 02 Phase 2+ ships. |
| 05 | Suite Search / Command Palette | Architecture decided. Deferred. | N > 6 apps, first cross-app search request, an app builds its own palette, or recent-items demand. |

When a deferred spec's trigger fires, it moves from deferred to scheduled and its Phase 1 implementation plan is added here.

---

## Spec 01 PR sequence (shipped 2026-05-07)

| PR | Scope | Status |
|----|---|---|
| A | SDK repo prep — version-bump strategy, CHANGELOG header for v1.0 milestone, baseline test pass on v0.1.1 surface, add `@coms-portal/shared` runtime dep. | SHIPPED — SDK `85573b5` (v0.2.0) |
| B | Typed webhook envelope (`PortalWebhookEnvelope<T>`, `defineWebhookHandler`, `getAppRole`). | SHIPPED — SDK `fc75e1c` (v0.3.0) |
| C | Contract-version constants + `assertContractVersionCompatible` + `ContractVersionMismatchError`. | SHIPPED — SDK `5c44844` (v0.4.0) |
| D | Manifest helpers (`defineManifest` + `registerManifest`) + portal-side `POST /v1/apps/:slug/manifest` route under `requireAppToken`. | SHIPPED — SDK `8fd6de3` (v0.5.0) + portal `cb34577` |
| E | `coms-portal-cli` binary (`bin` entry in SDK package.json). Single command: `register-manifest`. | SHIPPED — SDK `c9be52f` (v0.6.0) |
| F | Elysia adapter at `@coms-portal/sdk/elysia` subpath — `requireBrokerAuth()` plugin. | SHIPPED — SDK `888bc30` (v0.7.0) |
| G | Test-kit at `@coms-portal/sdk/testing` subpath — `mintTestBrokerToken`, `buildEnvelope`, `stubJwks`. | SHIPPED — SDK `b5cbc22` (v0.8.0) |
| H | v1.0 cut: README rewrite, MIGRATION.md, SUPPORTED_VERSIONS update, semver lock, `v1.0.0` git tag. | SHIPPED — SDK `v1.0.0` tag |

See [spec-01-sdk-v1.md](spec-01-sdk-v1.md) for the full surface, decisions log, and acceptance criteria.

---

## Spec 02 PR sequence (shipped 2026-05-07)

### Planned PRs

| PR | Scope | Status |
|----|---|---|
| SA | SDK — add `APP_LAUNCHER` re-export to `@coms-portal/sdk` top-level. Cuts `v1.1.0`. | SHIPPED — SDK `c98b2c5` (v1.1.0 tag) |
| VA | SDK — `examples/v0-compat-smoketest/`. Closes Spec 01 §AC #5. | SHIPPED — SDK `e854e97` |
| VB | SDK — `examples/onboarding-scratch/`. Closes Spec 01 §AC #1. | SHIPPED — SDK `f8ae1b4` |
| HA | Heroes — replace 16 `@coms-portal/shared` import sites with `@coms-portal/sdk`. Pure import-source migration. | SHIPPED — Heroes `d59a5ca` |
| HB | Heroes — `portal-manifest.ts` source-of-truth + `coms-portal-cli register-manifest` in CD. | SHIPPED — Heroes `536099d` |

### Follow-up patches (discovered while shipping; see [spec-02 §Post-ship discoveries](spec-02-sdk-v1-heroes-adoption.md))

| # | Scope | Status |
|----|---|---|
| F1 | Heroes infra: `iam.serviceAccountTokenCreator` for deployer SA on runtime SA (OpenTofu, `tofu apply` against live state). | SHIPPED — Heroes `527b77a` |
| F2 | Heroes lockfile regen against the published `v1.1.0` SDK tag. | SHIPPED — Heroes `0412ce0` |
| F3 | SDK `sideEffects: false` + `./constants/app-launcher` subpath. Fixes Vite/esbuild barrel scan dragging `node:crypto` and `google-auth-library` into Heroes' browser bundle (D1). | SHIPPED — SDK `fc4153a` (v1.1.1 tag) |
| F4 | Heroes consumes v1.1.1; `(authed)/+layout.svelte` flips to subpath import. | SHIPPED — Heroes `a74f320` |
| F5 | SDK CLI accepts `COMS_PORTAL_CLI_OIDC_TOKEN` env-var (production WIF + impersonation path; google-auth-library cannot mint OIDC ID tokens for that chain — D2). | SHIPPED — SDK `a91acc3` (v1.2.0 tag) |
| F6 | Heroes consumes v1.2.0; auth action set to `token_format: 'id_token'`. | SHIPPED — Heroes `a2d25f8` |
| F7 | Heroes workflow swaps to `gcloud auth print-identity-token --impersonate-service-account` (auth action's id_token path returned 403 against same TokenCreator binding — D3). | SHIPPED — Heroes `137aa0a` |
| F8 | Portal route param `:slug` → `:id` (memoirist trie conflict with `apps.ts` / `app-webhooks.ts` that left Spec 01 §AC #7 a quiet false-positive for 2.5 weeks — D4) + `route-compose.test.ts` regression. | SHIPPED — Portal `abd3b21` |
| F9 | Portal route-compose test fix (drop `.ts` extension to satisfy tsc strict). | SHIPPED — Portal `ce4d3c9` |

### Post-ship follow-ups (closed all four filed issues same day)

| # | Scope | Status | Closes |
|----|---|---|---|
| F10 | Portal: split `services/manifests.ts` into shell + `manifests-internal.ts` (Bun's process-global `mock.module` pollution + `export *` live-binding propagation were leaking partial-surface manifests mocks into `manifests.test.ts`). Const-bound re-exports (`export const X = impl.X`) break the propagation; the test now imports the impl directly and is isolated from polluters. | SHIPPED — Portal `3f1d34c` (issue closed manually — auto-close grammar miss, see spec-02 §Operator briefing point 7) | #4 |
| F11 | Portal: `__tests__/route-compose.test.ts` generalised — walks `app.routes` and surfaces every memoirist param-name conflict with friendly diagnostics, plus two self-verification cases for the helper. Catches D4-shape bugs even if memoirist's compose-time throw ever stops firing. | SHIPPED — Portal `3f1d34c` (issue closed manually — auto-close grammar miss, see spec-02 §Operator briefing point 7) | #3 |
| F12 | SDK: `examples/web-bundle-smoketest/` — Vite browser-bundle regression canary mirroring Heroes' `(authed)/+layout.svelte` import path (`APP_LAUNCHER` via `@coms-portal/sdk/constants/app-launcher` subpath). Programmatic `vite build` inside `bun:test`; asserts `dist/assets/*.js` is clean of `createHmac` / `node:crypto` / `timingSafeEqual` / `google-auth-library` / `GoogleAuth`, plus a `'COMS'` sentinel proving APP_LAUNCHER survived tree-shake. Verified the canary fires by flipping the entry to import from the SDK barrel — Rollup raised `MISSING_EXPORT` on `createHmac`, exactly D1's failure mode. SDK suite 88 pass (was 85). Pure additive — no `src/` or root-config changes. | SHIPPED — SDK `dcad4aa` | #1 |
| F13 | Heroes infra: silence Cloud Run drift permanently. `lifecycle.ignore_changes` on `cloud_run.app` extended to `[image, env, startup_cpu_boost, traffic, client, client_version]`; deploy.yml's `--set-env-vars` / `--set-secrets` is now the unambiguous runtime authority. Removed `auth_placeholder` block + `tofu state rm` on its four orphan entries (the issue's "safe to apply" claim was wrong: live state had v1 destroyed, so apply would have created v3 with `PLACEHOLDER_REPLACE_ME` and the next deploy.yml run, which pins `:latest`, would have served it — hard auth outage). Dropped vestigial `SHEET_SYNC_INTERVAL_MS` (read by zero application code) and the two never-applied `portal_introspect_*` alert_policies. Added `infra-plan` PR check in `ci.yml` gated on `vars.INFRA_PLAN_GUARD_ENABLED`. `tofu plan` from a clean checkout: 0 to add, 0 to change, 0 to destroy. | SHIPPED — Heroes `4aecd2e` | #5 |
| F13b | Heroes infra: codify CI-guard read scopes in OpenTofu — `roles/viewer` (project) + `roles/storage.objectViewer` on `gs://coms-aha-heroes-tfstate` for the deployer SA, both added to `infra/modules/github-wif/main.tf` and applied same day. Repo variables `INFRA_PLAN_GUARD_ENABLED=true`, `ALERT_EMAIL`, `SHEET_ID_POINTS`, `SHEET_ID_EMPLOYEES` set via `gh variable set` (the latter three carry inputs that live in `.gitignore`d `terraform.tfvars` locally). The infra-plan PR check is now fully live. | SHIPPED — Heroes `b2ea629` | — |

### Filed follow-up issues

| Issue | Repo | Origin | Risk | Status |
|---|---|---|---|---|
| [coms-sdk#1](https://github.com/mrdoorba/coms-sdk/issues/1) | SDK | D1 — close the browser-bundle verification gap | low (preventive) | **closed by F12** |
| [coms-portal#3](https://github.com/mrdoorba/coms-portal/issues/3) | Portal | D4 — generalize route-compose canary to walk the full route table | low (preventive) | **closed by F11** |
| [coms-portal#4](https://github.com/mrdoorba/coms-portal/issues/4) | Portal | Surfaced during Spec 02 — `manifests.test.ts` mock infra; CD's typecheck-and-tests gate is structurally non-functional | medium | **closed by F10** |
| [coms-aha-heroes#5](https://github.com/mrdoorba/coms-aha-heroes/issues/5) | Heroes | Surfaced during F1 `tofu apply -target` — `cloud_run.app` env-var drift would strip `PORTAL_ORIGIN` etc. on next full apply | **high (real prod risk)** | **closed by F13** |

The five planned PRs landed in the recommended sequence (SA → VA → VB → HA → HB). Ship follow-up patches landed in the order F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9, each unblocking the next deploy attempt. AC #2 closed at 2026-05-07T05:42 UTC; production traffic shifted to 100% the same run. Post-ship F10, F11, F12, and F13 (closing #4, #3, #1, and #5 respectively) all landed later the same day; all four filed follow-up issues are closed.

See [spec-02-sdk-v1-heroes-adoption.md](spec-02-sdk-v1-heroes-adoption.md) for the discovery, decisions log, acceptance criteria, post-ship discoveries (D1–D4), and operator briefing for fresh sessions.

---

## Spec 06 PR sequence (PR A + B + cross-repo SHIPPED 2026-05-07; only §2 sweep remains)

| PR | Repo | Scope | Status |
|----|------|---|---|
| A | `mrdoorba/coms_portal` | New OIDC-authed route `POST /api/v1/apps/:id/smoketest` at `apps/api/src/routes/app-smoketest.ts` (mounted in the `/v1` requireAppToken group). Verifies registry row → active status, dispatches a synthetic `app.smoketest` envelope synchronously to every active webhook endpoint, returns `{ app, endpoints[], ok }`. The literal `'app.smoketest'` is cast inline as `PortalWebhookEvent` (the formal addition to `PORTAL_WEBHOOK_EVENTS` lives in `mrdoorba/coms-shared`). Test suite at `apps/api/src/routes/__tests__/app-smoketest.test.ts` — 9 cases (auth, slug-mismatch, registry-miss, inactive-app, zero-endpoint, multi-endpoint with envelope/header assertions, HTTP failure, network failure, disabled-endpoint skip). | SHIPPED — Portal `fa78164` |
| C (partial) | `mrdoorba/coms_portal` | `docs/architecture/integrator-quickstart.md` revised: new §0 "Pick your path" (Greenfield / Retrofit / Non-TS subsections, framework-agnostic retrofit checklist of decisions + files + invariants + validation), new §3.1 "Spec 07 envelope contract — four invariants" (role from `envelope.appRole`, dedup by `eventId`, ack 2xx within 5s, HMAC required + OIDC additive), new §8 "Wire protocol reference" (ES256 JWT shape + JWKS URL, HMAC canonical-string format, HTTP endpoints with request/response shapes, OIDC mint chain). | SHIPPED — Portal `fa78164` |
| B | `mrdoorba/coms-sdk` | `coms-portal-cli smoketest <slug>` verb plus the `runSmoketest` programmatic API in `src/smoketest.ts`. Same Google OIDC ID-token auth resolution as `register-manifest` (`COMS_PORTAL_CLI_OIDC_TOKEN` → `COMS_PORTAL_CLI_TEST_TOKEN` → ADC). Three-step output: registry check (POST `/api/v1/apps/:slug/smoketest`), app URL `GET <healthPath>` (default `/`, override via `--health-path`), webhook delivery (pass-through of the portal's per-endpoint dispatch results). Exit codes 0/1/2/3 mirror `register-manifest`. Public surface adds `runSmoketest` plus the `SmoketestResult` type family in `src/index.ts`. SDK cut at `v1.3.0` git tag (additive minor; v1.2.x consumers unaffected). 11 module tests + 7 CLI integration tests, full SDK suite 106 pass / 0 fail, typecheck clean. | SHIPPED — SDK `9356049` (v1.3.0 tag) |
| C (§2 deletions) | `mrdoorba/coms_portal` | Strip `token_exchange` and `same_host_cookie` from §2 prose; collapse to a single sentence noting they exist for legacy reasons and must not be used. Footnote in §2 currently flags both as legacy-pending-deletion. | DEFERRED — gated on Spec 03 (HS256 rip-out) shipping |
| (cross-repo) | `mrdoorba/coms-shared` | Add `'app.smoketest'` to `PORTAL_WEBHOOK_EVENTS`. Portal's `apps/api` + `apps/web` shared pin bumped to `v1.7.0`; inline `as PortalWebhookEvent` cast in `app-smoketest.ts` removed. SDK re-export of the constant rides whichever next SDK minor goes out (the SDK already barrel-re-exports `PORTAL_WEBHOOK_EVENTS`, so it picks up the addition automatically once the SDK's shared pin moves). | SHIPPED — Shared `6452869` (v1.7.0 tag); Portal pin bump in this commit |

See [spec-06-onboarding-scaffolding.md](spec-06-onboarding-scaffolding.md) for the full problem statement, scope, decisions log, and acceptance criteria.

---

## Out of scope until a real Rev 4 spec lands

The Rev 3 §Out of Scope items (profile editing, MFA enrollment, notifications inbox) remain out of scope. They become candidates for Rev 4 only if a stakeholder asks. Don't pre-design.
