# ADR 0008: Drizzle as the default ORM

Status: accepted (2026-05-11)

## Context

The current COMS apps use different ORMs:

- **portal-api**: Drizzle ORM, Cloud SQL Postgres
- **heroes-api**: Drizzle ORM, Cloud SQL Postgres
- **aha-fast**: Prisma, Cloud SQL Postgres (also chosen incidentally at app creation, see ADR 0006)

Two of three current apps are already on Drizzle. Without an explicit suite default, future apps will choose differently — multiplying the cognitive load for engineers who move between apps. The unification mandate is about reducing cross-app friction, and ORM idiom is a real source of friction (different query API, different migration tool, different type generation pattern).

Drizzle and Prisma are both competent. The choice is alignment, not technical superiority.

## Decision

**Drizzle ORM is the default for COMS apps on Cloud SQL Postgres.** New apps adopt Drizzle. Cross-app data access happens via portal SDK calls, never via direct database joins (integration contract §7).

aha-fast continues on Prisma as a documented exception. The migration to Drizzle is its own spec (`spec/NN-fast-onboarding.md` or a follow-up) and is not blocking for the consolidation.

## Consequences

**Positive.**

- Engineers moving between apps see one ORM, one query style, one migration tool.
- Drizzle's SQL-first ergonomics fit a team that's comfortable with Postgres SQL. Less "ORM magic" hiding the query layer.
- Two of three apps already on Drizzle — minimal new investment.
- Drizzle's TypeScript-first design produces excellent compile-time guarantees with less codegen friction than Prisma's separate generation step.

**Negative.**

- aha-fast carries Prisma as an exception until migrated. Engineers on aha-fast learn Prisma; new-app engineers learn Drizzle. Friction during the transition window.
- Engineers fluent in Prisma but new to Drizzle pay a learning cost on new apps.
- The migration spec for aha-fast will be non-trivial — Prisma migrations don't directly convert to Drizzle migrations; the schema needs to be reauthored.

**Neutral.**

- Both ORMs support Cloud SQL Postgres equally well.
- Migration tooling (`drizzle-kit` vs `prisma migrate`) is comparable in capability; only the developer-facing commands differ.
- Drizzle is a younger project than Prisma. Maturity risk is real but manageable; the maintainer responsiveness has been strong in our experience.

## Alternatives considered

**Prisma as the default.** Strong ecosystem, excellent typegen, broad community familiarity. But:

- Minority position (1 of 3 apps).
- Rewriting two apps to Prisma is more work than the inverse.
- Prisma's separate `prisma generate` codegen step adds friction in monorepo workflows where every app would need its own generated client.

**No default — let each app choose.** Optimizes for individual app velocity, sacrifices cross-app cognitive coherence. Rejected: the integration mandate is about reducing cross-app friction, and ORM choice is exactly the kind of friction worth eliminating.

**Switch everything to a different ORM (Kysely, raw SQL with a query builder).** Considered briefly. Drizzle already does what Kysely does, with better TS ergonomics. Raw SQL works but throws away typegen benefits. No compelling case to introduce a third option.

## What this rule does NOT prescribe

- Database choice for apps with genuinely different data shapes. If an app's domain fits a document store, Redis, or BigQuery better, the ORM rule doesn't force it onto Postgres — but the app must justify the choice in an ADR.
- Schema design. Each app owns its schema (integration contract §7). The ORM is the tooling, not the schema policy.

## Migration notes

aha-fast's Drizzle migration is its own project. Outline:

1. Reauthor Prisma schema as Drizzle schema (Drizzle CLI has some import helpers but the result requires hand-tuning).
2. Generate Drizzle migrations from the new schema.
3. Verify against existing data (Postgres tables don't change shape; only the application-layer ORM does).
4. Replace all Prisma client calls with Drizzle equivalents (app-wide refactor).
5. Drop Prisma dependencies.

Timing: not blocking on consolidation. Schedule after aha-fast freezes its current in-flight feature work and after the auth migration (ADR 0006) lands. Roughly two weeks of focused effort.

## References

- Integration contract § 7.
- portal-api's `package.json` and heroes-api's schema files — the Drizzle patterns this ADR aligns to.
- aha-fast's `prisma/schema.prisma` — the exception this ADR documents.
