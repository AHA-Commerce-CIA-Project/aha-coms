# ADR 0002: Cross-framework UI library fork (Svelte + React parallel implementations)

Status: accepted (2026-05-11)

## Context

The COMS suite contains Svelte/SvelteKit apps (portal-web, heroes-web, future app 3) and Next.js/React apps (aha-fast, future app 4 likely). The shared chrome — ServiceBar, Sidebar, MobileTopBar, MobileBottomNav, AccountWidget — must look identical across all of them. The chrome is the most visible "single super app" signal, and visible drift here is the loudest UX inconsistency.

The existing `@coms-portal/ui` and `@coms-portal/account-widget` are Svelte-only (`peerDependencies: { svelte: ^5 }`). They cannot be consumed by aha-fast (Next.js/React) as-is. With aha-fast about to integrate and another React app likely on the 12-month horizon, the cross-framework consumption problem cannot be deferred.

The empirical context: even with the shared chrome in place, heroes does not feel like the same app as portal. Causes include thin design system depth, ad-hoc app-side glue around the chrome, and per-app reinvention of compositions (settings pages, list views, forms). Some of that is fixable by thickening the library; some requires design discipline. None of it gets *worse* in any of the cross-framework options, but the choice does affect how much code we maintain.

## Decision

Maintain parallel framework-native implementations of the chrome libraries:

- `@coms-portal/ui-svelte` (was `@coms-portal/ui`)
- `@coms-portal/ui-react` (new)
- `@coms-portal/account-widget-svelte` (was `@coms-portal/account-widget`)
- `@coms-portal/account-widget-react` (new)

Shared substrate stays single-implementation:

- `@coms-portal/design-tokens` — framework-neutral, single source of color/type/spacing/motion
- `@coms-portal/shared` — types, contracts, cross-cutting interfaces
- `@coms-portal/sdk` — framework-neutral; hosts platform behaviors (JWT verification, logout, notification emit) and the app catalog (`APP_LAUNCHER`)

Visual parity between Svelte and React implementations is enforced by:

1. **Figma as the design source of truth.** Specs live in Figma; both implementations target the same specs.
2. **Storybook per implementation.** Same story names, same component contracts.
3. **Visual regression tests in CI** (Storybook + Playwright, or Chromatic). PR that introduces visual drift between implementations gets blocked.

The Svelte and React variants are kept API-similar where the host framework allows. Where idioms differ (event handlers, slots vs children), each variant takes the framework-native shape — we don't force a least-common-denominator API.

## Consequences

**Positive.**

- Each app uses framework-native components. SSR works in Next.js. SvelteKit's `superforms` works in Svelte. Dev ergonomics stay good.
- Atomic visual changes are possible: one PR can update both implementations and the Figma reference.
- Maintenance is colocated in the monorepo. The same engineer writing the Svelte version writes the React version while the design is fresh.
- Design tokens centralization remains valuable — both implementations consume the same color/type/spacing values, so most "consistency" is solved at the substrate level.

**Negative.**

- 2x implementation surface area for chrome + widget.
- Visual drift risk without regression testing infrastructure. Storybook + visual snapshots are mandatory, not optional.
- Figma-as-source-of-truth requires design discipline. Specs that exist in code but not Figma will rot. Specs that exist in Figma but not code create false expectations.
- Initial setup cost: scaffolding `ui-react` and `account-widget-react` even as empty packages so aha-fast can start consuming stubs; populating them in priority order as aha-fast needs each component.

**Neutral.**

- Core libraries (sdk, shared, tokens) are single implementation. Doubled cost only applies to chrome/widget.
- Future framework additions (Solid? Vue?) would multiply the cost. Suite-wide policy: no additional framework variants accepted unless an ADR justifies it. Current variants are Svelte + React. Period.

## Alternatives considered

**Web Components for the shared surface.** Single implementation rendered everywhere. Truly cross-framework. Rejected because:

- Custom elements don't server-render in Next.js App Router — breaks streaming SSR and SEO.
- Form interop with native form APIs and framework form libraries is awkward.
- State management spans the boundary clumsily.
- Acceptable for static-ish chrome (ServiceBar might work); painful for the interactive widgets (account dropdown, mobile slide-over). Mixed adoption would be worse than full commitment to either model.

**Standardize on one framework.** Migrate portal-web + heroes-web to Next.js (months of work, lose Svelte expertise) or rewrite Next.js to SvelteKit (lose industry-standard ergonomics for new app authors). Right answer in 2–3 years if cross-framework drift hurts more than rewriting; not today.

**Two implementations, but with a shared API generator.** Define component APIs in a neutral DSL, generate Svelte and React from it. Considered briefly; rejected as building a tool to solve a problem we don't yet have. Would force least-common-denominator APIs and add a tooling layer to maintain.

## References

- Integration contract §§ 3, 4.
- Heroes' `packages/web/src/routes/(authed)/+layout.svelte` — shows the Svelte chrome consumption pattern and the app-side glue that should be absorbed by future chrome lib versions.
