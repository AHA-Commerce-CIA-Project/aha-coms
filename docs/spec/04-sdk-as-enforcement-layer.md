# Spec 04: SDK as Enforcement Layer

> Status: stub (planned, not yet scoped in detail)
> Type: long-lived API design + migration spec
> Owner: TBD
> Prerequisites: Spec 01 (Monorepo Consolidation), Spec 02 (Heroes Cleanup) — the SDK is in-tree first
> Targets: integration contract §§ 1, 2, 10, 11, 13 — anywhere a contract operation can become an SDK call

## Objective

Promote `@coms-portal/sdk` from a verification primitives library into the canonical surface through which apps satisfy the integration contract. Where the contract today says "follow this pattern" (with heroes' code as reference), the future state is "call `sdk.X.Y()`; SDK enforces the contract internally."

The architecture triangle:

- **SDK** — *how* apps integrate (the contract surface)
- **Heroes** — *what* a real implementation looks like (the reference example)
- **Integration test kit** (Spec 03) — what *prevents drift* (the judge)

This spec strengthens the first leg.

## Why this exists

Today's SDK exposes JWT verification primitives. Most of the contract's operations are *not* SDK functions — they're patterns engineers implement themselves by reading heroes' code. That's fragile in two ways:

1. **Heroes changes faster than the contract.** Apps that copy heroes-as-it-was-six-months-ago slowly drift from heroes-as-it-is.
2. **Pattern interpretation varies.** Two engineers reading the same prose produce subtly different implementations. AI agents reading prose produce confidently different implementations.

The fix is to encapsulate every load-bearing contract operation as an SDK function. Apps call SDK functions; SDK enforces the contract internally. "Follow the contract" becomes "use the SDK as designed."

## Scope (v1 surface)

Target SDK exports, organized by contract section:

### Auth (§§ 1, 2)
- `sdk.auth.verifyRequest(req)` — verify the JWT, return `PortalSessionUser | null`.
- `sdk.auth.requireAppAccess(user, appSlug)` — throw 403 if the user lacks the grant.
- `sdk.auth.signOutAndRedirect(req, res)` — invoke portal logout; clear app-side state.

### Profile (§2)
- `sdk.profile.upsert(db, table, user)` — upsert `<app>_profiles` keyed on portal UUID. ORM-agnostic via an adapter interface (Drizzle adapter ships with v1; Prisma adapter later for aha-fast).

### Webhooks (§11)
- `sdk.webhooks.verifyPortalWebhook(req)` — validate signature; throw on failure.
- `sdk.webhooks.recordEvent(db, table, event)` — idempotent insert into `portal_webhook_events`.

### Notifications (§10)
- `sdk.notifications.create(event)` — fire-and-forget; portal stores and routes. (Depends on the platform notifications v1 spec shipping first.)

### Observability (§13)
- `sdk.observability.withCorrelationId(req, handler)` — wraps a handler; propagates correlation IDs through downstream calls.
- `sdk.observability.logger(scope)` — preconfigured `pino` instance respecting suite-wide logging conventions.

### Catalog (§3)
- Re-export of `APP_LAUNCHER` (already exists; this spec confirms it as the canonical import for everything in the suite — chrome, service worker, access checks).

## Migration impact

For each contract section above, audit heroes' code (post-Spec-02) for whether it calls the equivalent SDK function:

- If yes → no change required.
- If no (heroes implements the operation inline) → refactor heroes to call the SDK function. Heroes becomes the SDK's first consumer.

Spec 03's integration test kit validates that services call SDK functions where required — not just that the resulting behavior is correct. A service that implements its own JWT verification (bypassing `sdk.auth.verifyRequest`) fails the test even if the verification itself is correct.

## Out of scope

- **Database adapter generalization beyond Drizzle** for v1. Prisma adapter ships separately when aha-fast onboards (or migrates).
- **Framework-specific helpers** like a Next.js middleware wrapper. If those materialize, they live as `@coms-portal/sdk/next` (or similar) and are out of this spec's scope.
- **The notification API surface beyond `create(event)`**. That lives in the platform-notifications-v1 spec.

## Open questions

- **DB adapter shape**: function accepting a Drizzle `db` + table reference, or a more abstract adapter interface? Lean concrete first, abstract when a second consumer (Prisma) materializes.
- **Versioning**: SDK 2.0 (major bump signaling the new shape) or SDK 1.x with additive exports? Lean 2.0 — the surface is meaningfully different, and the consolidation moment is a natural break.
- **Backwards compatibility**: should v1 SDK keep working in apps until they migrate, or do all consumers move atomically? Lean per-app migration with a v2 deprecation window (since the SDK and apps live in the same monorepo, "atomic" is technically possible — but per-app migration is gentler).
- **Function naming**: `verifyRequest` vs `verifyJWT` vs `authenticate`? Naming bikeshed; defer until implementation.

## When this spec is done

Heroes' code rarely implements integration patterns directly. It calls SDK functions. The integration contract's "see heroes for the pattern" references mostly become "call `sdk.X.Y()`; see heroes' `hooks.server.ts` for an end-to-end example."

The SDK is the load-bearing artifact: what gets versioned, what gets reviewed for breaking changes, what the integration test kit primarily validates. Heroes is illustrative; the SDK is canonical.

## References

- Integration contract — every operation listed here corresponds to a contract section.
- ADR 0001 (monorepo) — workspace structure.
- ADR 0005 (JWT stateless sessions) — the auth model the SDK encapsulates.
- Spec 03 (integration test kit) — sibling spec; validates that SDK calls happen where required.
