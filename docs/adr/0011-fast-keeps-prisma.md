# ADR 0011: Fast keeps Prisma — per-app ORM exception

Status: accepted (2026-05-13)

## Context

ADR 0008 named Drizzle as the suite default and recorded fast as a
documented Prisma exception "until migrated." Spec 05 Open Question §1
re-litigated whether the migration should happen as Phase 5 of the
onboarding spec or be deferred. Both options were weighed against the
integration-contract guarantees:

**Option A — Migrate fast to Drizzle in Phase 5.** Pros: one ORM across
the suite; one schema-codegen story; the `db:migrate` step in the deploy
workflow reuses the shape established for portal-api + heroes-api.
Cons: rewriting 30+ Prisma queries across `lib/`, `app/api/`, `scripts/`;
risk of subtle drift on JSON column handling, default values, and
relation loading; no contract-compliance gain (the integration contract
is about wire shape and behaviour, not ORM choice).

**Option B — Keep Prisma, ADR-record the per-app exception.** Pros: zero
migration risk; alifm17's Prisma queries keep working; faster path to a
working integration. Cons: two ORMs in one monorepo; the next React app
onboarding gets ambiguous direction; standing principle 8 acquires its
first formal exception.

## Decision

**Fast keeps Prisma.** Spec 05's Phase 5 is intentionally optional and
defaults to skip; the ORM migration is not undertaken as part of the
onboarding. The cross-app ORM coherence ADR 0008 prescribed remains
the default for *new* apps; fast continues as the explicit exception.

The integration-contract guarantees (§§ 1–9 + 11–14) are wire-shape and
behaviour. Fast's Prisma queries against its own database satisfy those
guarantees as cleanly as Drizzle would. The cost of migration is
real (30+ queries, JSON column verification, relation loading audit);
the benefit (coherence) is real but not contract-blocking.

## Conditions under which a future spec would migrate

This exception is not permanent — it's calibrated to current trade-offs.
The migration becomes worth undertaking when any of:

1. **A third React app onboards** and the ORM ambiguity creates real
   onboarding friction (the next React-app engineer asks "Prisma like
   fast, or Drizzle like the rest?" without a clear answer).
2. **Fast's Prisma schema diverges from the integration contract** in a
   way that's easier to repair via reauthor-in-Drizzle than incremental
   Prisma cleanup (e.g., a destructive schema change that touches every
   model).
3. **Prisma's monorepo ergonomics degrade** below an acceptable bar
   (the separate `prisma generate` codegen step has been a friction
   point; if Prisma changes its CLI in ways that fight Bun workspaces,
   the cost equation flips).
4. **Drizzle ships features that materially benefit fast** (e.g., a
   query-builder feature that would eliminate complex Prisma raw SQL
   strings fast currently carries).

When any of these conditions trip, author a follow-up spec that
references this ADR's reopen criteria, executes the migration, and
flips the per-app exception. The migration outline in ADR 0008 §
Migration notes still applies.

## Consequences

**Positive.**

- Spec 05 ships in fewer phases; the React chrome port (Phase 1) and
  Better Auth removal (Phase 3) are the load-bearing work, not the
  ORM swap.
- Fast's existing Prisma queries continue working untouched — no
  query-shape regression risk during the onboarding window.
- ADR 0008's "exception until migrated" gains explicit reopen criteria,
  preventing the exception from drifting into "indefinite postponement."

**Negative.**

- The monorepo carries two ORMs (`drizzle-orm` + `@prisma/client`) for
  the duration. Engineers moving between apps still see two query
  idioms.
- The deploy workflow `db:migrate` step for fast continues to use
  `prisma db push` (or whatever the canonical fast deploy invocation
  becomes) rather than the `bun --filter @coms-portal/<app>-api
  db:migrate` shape portal-api + heroes-api use.
- New-app engineers must read this ADR alongside ADR 0008 to understand
  why the exception exists and when it gets retired.

**Neutral.**

- The integration contract is unchanged. Fast's wire shape (webhooks,
  REST endpoints, session cookie consumption, taxonomy projection) is
  decided by Spec 05's other phases, not by the ORM choice.

## References

- Spec 05: `docs/spec/05-fast-onboarding.md`, Open question §1.
- ADR 0008: Drizzle as the default ORM (this ADR is the named exception
  ADR 0008's Decision section anticipated).
- Standing principle 8 in `tasks/plan.md`: this is its first formal
  exception.
