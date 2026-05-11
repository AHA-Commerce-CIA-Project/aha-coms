# Spec 03: Integration Test Kit

> Status: stub (planned, not yet scoped in detail)
> Type: long-lived package + one-shot setup spec
> Owner: TBD
> Prerequisites: Spec 01 (Monorepo Consolidation), Spec 02 (Heroes Cleanup) — both must land first
> Targets: integration contract §§ 1, 2, 8, 9, 11, 14 — wherever a rule can be made executable

## Objective

Turn the integration contract from prose into CI-enforced reality. Ship a Bun workspace package, `@coms-portal/integration-test-kit`, that exports a runnable test suite every service in the suite consumes in its CI. A service that violates the contract fails CI before merge.

This is the load-bearing companion to the integration contract — without it, the contract decays into aspirational wallpaper. With it, drift requires a deliberate ADR.

## Why this exists

The integration contract describes rules. Engineers reading prose will sometimes misinterpret, forget, or believe themselves exempt. AI agents writing code from prose are even more prone to drift. The mitigation is to make the rules executable: a test suite any service can run, that fails on violations.

This spec ships the kit. Subsequent work expands its coverage as the contract grows.

## Scope (v1)

Test categories the kit ships, mapped to contract sections:

- **Auth (§1)**: rejects missing JWT (401); rejects invalid signature (401); rejects user without app grant (403); no `/login` / `/register` route exists.
- **Identity (§2)**: service's schema has no `users` / `accounts` / `sessions` / `verification` tables holding credentials; `<app>_profiles` exists with a `uuid` primary key.
- **Routing (§5)**: HTML responses don't contain absolute cross-app URLs (`https://heroes.coms.com/`); internal links use base-path-aware helpers.
- **Real-time (§6)**: service does not expose a public WebSocket endpoint.
- **Webhooks (§11)**: `POST /<app>/api/portal/webhook` exists; rejects unsigned requests with 401; accepts SDK-signed requests; idempotency works (duplicate event IDs don't double-process).
- **Deploys (§8)**: `apps/<service>/cloudbuild.yaml` exists; `/healthz` returns 200.
- **PWA/SW (§9)**: no `navigator.serviceWorker.register` calls in source; no `manifest.webmanifest` shipped from the service.
- **Tooling (§14)**: no `package-lock.json` / `pnpm-lock.yaml` in the service directory; Dockerfile base image is appropriate for the runtime.

Drift-detection checks (cheap grep rules, run pre-commit + CI):

- No raw hex codes in source files.
- No `terraform` CLI invocations in scripts, Makefiles, or Cloud Build pipelines.
- No hardcoded app launcher arrays.
- No absolute `https://*.coms.com` cross-app URLs.

## Out of scope

- Visual regression testing for chrome cross-framework parity (separate tooling, separate spec).
- Performance regression tests.
- Domain-specific tests for any product app (those live in the product app's own test suite).
- Replacing existing per-app tests — the kit *adds* contract tests, it doesn't displace product tests.

## Open questions

- **API shape**: per-category function exports vs. a single `runContractTests(config)` entrypoint?
- **Framework detection**: does the kit auto-detect the service's framework (Bun + Elysia vs. Next.js), or require explicit config?
- **Schema introspection**: for "no forbidden auth tables," parse the Drizzle/Prisma schema file, or query the live DB? Live DB is more authoritative but requires CI database access.
- **Drift checks placement**: pre-commit hook only, CI step only, or both?
- **Runtime**: does the kit work in both Bun and Node, or Bun-only?

## When this spec is done

Heroes (post-Spec-02) consumes the kit and its CI runs the full suite green. The integration contract is reproducible: clone heroes' setup into a new service, run the suite, and a green CI run is itself a claim of contract compliance.

A new app onboarding via the checklist in `integration-contract.md` should be able to satisfy every checklist item with a corresponding kit test (or a corresponding drift-detection check) passing. Items that *cannot* be turned into a test become guidance rather than enforcement, and are marked as such.

## References

- Integration contract (this is the spec the kit enforces)
- ADR 0001 (monorepo) — workspace structure
- Spec 04 (SDK as enforcement layer) — sibling spec; the kit validates that SDK calls happen where required
