# Rev 4 — Spec 00: Implementation Timeline

> Coordination plan for Rev 4. Opened 2026-05-06 when Rev 3 closed.
>
> Rev 4 holds one new spec (Spec 01 SDK v1.0) drafted 2026-05-07, plus the two specs that were architecture-decided in Rev 3 but trigger-deferred (Spec 04 User Preferences, Spec 05 Suite Search). Specs 04 and 05 retain their original numbers as inherited Rev 3 specs; new Rev 4 specs number from 01.
>
> **Prerequisites:** Rev 3 closed end-to-end (account widget, identity ownership, alias layer, dual-email auth, org taxonomies + employment block, Heroes cutover). Identity is centrally owned, written, and authenticated; the suite-UX surface is established. Rev 4 builds against that foundation.
>
> **Numbering convention:** From Rev 4 onward, spec numbers restart at 01 within each rev. Inherited specs (04, 05 in this rev) keep their Rev 3 numbers — the gap (02, 03 missing) is informative, signalling those specs are continuations rather than new Rev 4 work. Cite as "Rev N Spec NN" when crossing rev boundaries to avoid ambiguity.

---

## Status — 2026-05-07 (Spec 01 SHIPPED)

Rev 4 status:

- **Spec 01 (SDK v1.0)** SHIPPED 2026-05-07. PRs A → H all landed in
  `mrdoorba/coms-sdk` (eight commits between `85573b5` and the v1.0.0 cut)
  plus the portal-side route in `mrdoorba/coms_portal` (commit `cb34577`).
  SDK released as `v1.0.0` git tag. Heroes-side adoption (H-1, H-2, H-3)
  remains optional and unscheduled.
- **Spec 04 / Spec 05** remain trigger-deferred (carried over from Rev 3 with original numbers).

No Rev 4 spec is currently active. Specs 04 and 05 ship only when their respective triggers fire (see each spec's §Triggers to ship section); a new Rev 4 spec opens when the next trigger fires.

---

## Specs

| Spec | Title | Status | Trigger / Sequencing |
|------|-------|--------|---------|
| 01 | SDK v1.0 — Contract Lock & Onboarding Surface | **SHIPPED 2026-05-07** (`@coms-portal/sdk@v1.0.0`). | Triggered by post-Spec-08 onboarding-friction review. Shipped portal/SDK-side; Heroes adoption is opt-in post-v1.0. SDK v2.0 (HS256 drop) gated on Heroes Phase 7. |
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

## Out of scope until a real Rev 4 spec lands

The Rev 3 §Out of Scope items (profile editing, MFA enrollment, notifications inbox) remain out of scope. They become candidates for Rev 4 only if a stakeholder asks. Don't pre-design.
