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
- **Spec 02 (SDK v1.0 Heroes Adoption & Verification)** SHIPPED 2026-05-07.
  All five PRs (SA / VA / VB / HA / HB) landed across three repos. SDK
  cut `v1.1.0` (`APP_LAUNCHER` re-export); Heroes migrated all 16
  `@coms-portal/shared` imports to `@coms-portal/sdk` and adopted
  manifest-as-code via `coms-portal-cli register-manifest` in CD. Spec 01's
  two structurally-weak acceptance criteria (#1 onboarding, #5 v0.1.x
  compat) are now falsifiable against real consumers (`examples/v0-compat-smoketest/`
  and `examples/onboarding-scratch/`). The "Heroes Phase 7" terminology
  is retired — SDK v2.0 is unblocked from Heroes' side as of today.
- **Spec 04 / Spec 05** remain trigger-deferred (carried over from Rev 3 with original numbers).

No Rev 4 work is currently scheduled. Specs 04 and 05 ship only when
their respective triggers fire (see each spec's §Triggers to ship
section).

---

## Specs

| Spec | Title | Status | Trigger / Sequencing |
|------|-------|--------|---------|
| 01 | SDK v1.0 — Contract Lock & Onboarding Surface | **SHIPPED 2026-05-07** (`@coms-portal/sdk@v1.0.0`). | Triggered by post-Spec-08 onboarding-friction review. Shipped portal/SDK-side; Heroes adoption was carved off into Spec 02. SDK v2.0 (HS256 drop) was gated on "Heroes Phase 7" — Spec 02 §Q5 re-evaluates whether that gate is still meaningful (Heroes does not call `verifyBrokerToken`). |
| 02 | SDK v1.0 Heroes Adoption & Verification | **SHIPPED 2026-05-07.** All five PRs landed; SDK released as `v1.1.0` git tag. | Triggered by post-Spec-01 Heroes inspection. Heroes consumes portal contracts via 16 type imports from `@coms-portal/shared` and uses the portal-server-side exchange flow for auth — the original H-1/H-2/H-3 breakdown was based on a stale model. Closed Spec 01's two structurally-weak acceptance criteria (#1 onboarding, #5 v0.1.x compat) via real-consumer verification. |
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

| PR | Scope | Status |
|----|---|---|
| SA | SDK — add `APP_LAUNCHER` re-export to `@coms-portal/sdk` top-level (single line). Cuts `v1.1.0`. | SHIPPED — SDK `c98b2c5` (v1.1.0 tag) |
| VA | SDK — `examples/v0-compat-smoketest/`. Consumer importing the v0.1.x surface from v1.0.0; closes Spec 01 §AC #5. | SHIPPED — SDK `e854e97` |
| VB | SDK — `examples/onboarding-scratch/`. Minimal Elysia H-app reproducing Spec 01 §Surface "Sample H-app integration"; measures actual LOC against the "~30 lines" claim, closes Spec 01 §AC #1. | SHIPPED — SDK `f8ae1b4` |
| HA | Heroes — drop-in re-export audit. Replace all 16 `@coms-portal/shared` import sites with `@coms-portal/sdk` (`APP_LAUNCHER` once SA ships). Pure import-source migration; no semantic changes. | SHIPPED — Heroes `d59a5ca` |
| HB | Heroes — manifest-as-code. Write `portal-manifest.ts` mirroring the current `app_manifests` row for `slug='heroes'`; add `coms-portal-cli register-manifest` to the CD pipeline. | SHIPPED — Heroes `536099d` |

The five PRs landed in the recommended sequence (SA → VA → VB → HA → HB). Spec 01 §AC #1 and §AC #5 are now both falsifiable against real consumer code. See [spec-02-sdk-v1-heroes-adoption.md](spec-02-sdk-v1-heroes-adoption.md) for the discovery, decisions log, and acceptance criteria.

---

## Out of scope until a real Rev 4 spec lands

The Rev 3 §Out of Scope items (profile editing, MFA enrollment, notifications inbox) remain out of scope. They become candidates for Rev 4 only if a stakeholder asks. Don't pre-design.
