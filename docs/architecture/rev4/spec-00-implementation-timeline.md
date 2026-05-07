# Rev 4 — Spec 00: Implementation Timeline

> Coordination plan for Rev 4. Opened 2026-05-06 when Rev 3 closed.
>
> Rev 4 holds two new specs — Spec 01 (SDK v1.0, SHIPPED 2026-05-07) and Spec 02 (SDK v1.0 Heroes Adoption & Verification, SHIPPED 2026-05-07) — plus the two specs that were architecture-decided in Rev 3 but trigger-deferred (Spec 04 User Preferences, Spec 05 Suite Search). Specs 04 and 05 retain their original numbers as inherited Rev 3 specs; new Rev 4 specs number from 01.
>
> **Prerequisites:** Rev 3 closed end-to-end (account widget, identity ownership, alias layer, dual-email auth, org taxonomies + employment block, Heroes cutover). Identity is centrally owned, written, and authenticated; the suite-UX surface is established. Rev 4 builds against that foundation.
>
> **Numbering convention:** From Rev 4 onward, spec numbers restart at 01 within each rev. Inherited specs (04, 05 in this rev) keep their Rev 3 numbers — the gap (02, 03 missing) is informative, signalling those specs are continuations rather than new Rev 4 work. Cite as "Rev N Spec NN" when crossing rev boundaries to avoid ambiguity.

---

## Status — 2026-05-07 (Specs 01 and 02 both SHIPPED)

Rev 4 status:

- **Spec 01 (SDK v1.0)** SHIPPED 2026-05-07. PRs A → H all landed in
  `mrdoorba/coms-sdk` (eight commits between `85573b5` and the v1.0.0 cut)
  plus the portal-side route in `mrdoorba/coms_portal` (commit `cb34577`).
  SDK released as `v1.0.0` git tag.
- **Spec 02 (SDK v1.0 Heroes Adoption & Verification)** SHIPPED 2026-05-07,
  AC #2 live-verified in production CD on the same day. Five planned PRs
  (SA / VA / VB / HA / HB) plus nine follow-up patches (F1–F9) at ship,
  plus two post-ship follow-ups (F10–F11) that closed filed issues #3
  and #4 the same day, shipped across three repos. SDK cut at `v1.2.0`
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
  Spec 02's scope; #3 and #4 were closed same day by F10/F11:
  [coms-sdk#1](https://github.com/mrdoorba/coms-sdk/issues/1) (web-bundle smoketest, open),
  [coms-portal#3](https://github.com/mrdoorba/coms-portal/issues/3) (generalize route-compose canary, **closed by F11**),
  [coms-portal#4](https://github.com/mrdoorba/coms-portal/issues/4) (manifests test mocks, **closed by F10**),
  [coms-aha-heroes#5](https://github.com/mrdoorba/coms-aha-heroes/issues/5) (infra drift, open).
- **Spec 04 / Spec 05** remain trigger-deferred (carried over from Rev 3 with original numbers).

No Rev 4 work is currently scheduled. Specs 04 and 05 ship only when
their respective triggers fire (see each spec's §Triggers to ship
section).

---

## Specs

| Spec | Title | Status | Trigger / Sequencing |
|------|-------|--------|---------|
| 01 | SDK v1.0 — Contract Lock & Onboarding Surface | **SHIPPED 2026-05-07** (`@coms-portal/sdk@v1.0.0`). | Triggered by post-Spec-08 onboarding-friction review. Shipped portal/SDK-side; Heroes adoption was carved off into Spec 02. SDK v2.0 (HS256 drop) was gated on "Heroes Phase 7" — Spec 02 §Q5 re-evaluates whether that gate is still meaningful (Heroes does not call `verifyBrokerToken`). |
| 02 | SDK v1.0 Heroes Adoption & Verification | **SHIPPED 2026-05-07.** Five planned PRs + nine ship follow-up patches (F1–F9) + two post-ship follow-ups (F10–F11) landed; SDK released as `v1.2.0` git tag (originally planned at v1.1.0). AC #2 live-verified in production. | Triggered by post-Spec-01 Heroes inspection. Heroes consumes portal contracts via 16 type imports from `@coms-portal/shared` and uses the portal-server-side exchange flow for auth — the original H-1/H-2/H-3 breakdown was based on a stale model. Closed Spec 01's two structurally-weak acceptance criteria (#1 onboarding, #5 v0.1.x compat) via real-consumer verification. Four post-ship discoveries (browser-bundle barrel scan, google-auth-library WIF+impersonation gap, auth-action 403, memoirist param-name conflict that left Spec 01 §AC #7 a quiet false-positive for 2.5 weeks); two of four filed follow-up issues (#3, #4) closed same day by F10/F11 — see [spec-02-sdk-v1-heroes-adoption.md](spec-02-sdk-v1-heroes-adoption.md). |
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

### Post-ship follow-ups (closed filed issues #3, #4 same day)

| # | Scope | Status | Closes |
|----|---|---|---|
| F10 | Portal: split `services/manifests.ts` into shell + `manifests-internal.ts` (Bun's process-global `mock.module` pollution + `export *` live-binding propagation were leaking partial-surface manifests mocks into `manifests.test.ts`). Const-bound re-exports (`export const X = impl.X`) break the propagation; the test now imports the impl directly and is isolated from polluters. | SHIPPED — Portal (current commit) | #4 |
| F11 | Portal: `__tests__/route-compose.test.ts` generalised — walks `app.routes` and surfaces every memoirist param-name conflict with friendly diagnostics, plus two self-verification cases for the helper. Catches D4-shape bugs even if memoirist's compose-time throw ever stops firing. | SHIPPED — Portal (current commit) | #3 |

### Filed follow-up issues

| Issue | Repo | Origin | Risk | Status |
|---|---|---|---|---|
| [coms-sdk#1](https://github.com/mrdoorba/coms-sdk/issues/1) | SDK | D1 — close the browser-bundle verification gap | low (preventive) | open |
| [coms-portal#3](https://github.com/mrdoorba/coms-portal/issues/3) | Portal | D4 — generalize route-compose canary to walk the full route table | low (preventive) | **closed by F11** |
| [coms-portal#4](https://github.com/mrdoorba/coms-portal/issues/4) | Portal | Surfaced during Spec 02 — `manifests.test.ts` mock infra; CD's typecheck-and-tests gate is structurally non-functional | medium | **closed by F10** |
| [coms-aha-heroes#5](https://github.com/mrdoorba/coms-aha-heroes/issues/5) | Heroes | Surfaced during F1 `tofu apply -target` — `cloud_run.app` env-var drift would strip `PORTAL_ORIGIN` etc. on next full apply | **high (real prod risk)** | open |

The five planned PRs landed in the recommended sequence (SA → VA → VB → HA → HB). Ship follow-up patches landed in the order F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9, each unblocking the next deploy attempt. AC #2 closed at 2026-05-07T05:42 UTC; production traffic shifted to 100% the same run. Post-ship F10 and F11 (closing #4 and #3 respectively) landed later the same day.

See [spec-02-sdk-v1-heroes-adoption.md](spec-02-sdk-v1-heroes-adoption.md) for the discovery, decisions log, acceptance criteria, post-ship discoveries (D1–D4), and operator briefing for fresh sessions.

---

## Out of scope until a real Rev 4 spec lands

The Rev 3 §Out of Scope items (profile editing, MFA enrollment, notifications inbox) remain out of scope. They become candidates for Rev 4 only if a stakeholder asks. Don't pre-design.
