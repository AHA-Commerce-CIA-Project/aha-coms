# ADR 0006: Google Identity Platform as the sole authentication backend

Status: accepted (2026-05-11)

## Context

The COMS suite has accumulated two different authentication systems:

- **Portal + heroes**: use Google Identity Platform (Firebase Auth business tier). Heroes accepts portal-minted sessions via the SDK.
- **aha-fast**: uses Better Auth (email/password). Has its own `User`, `Session`, `Account`, `GoogleToken` tables. Has its own login/register/forgot-password flows.

aha-fast's choice of Better Auth was incidental — the engineer picked what they knew at app creation. There was no architectural decision; there was no unification mandate at the time. The choice predates the integration target.

The unification mandate now requires single user provisioning and single sign-on across the suite. With three apps and two auth backends, every cross-app guarantee (one identity, one place to deactivate, one source of profile truth) is broken at the aha-fast boundary.

Future apps will repeat the divergence unless we make the rule explicit.

## Decision

Google Identity Platform is the **only** authentication backend for the COMS suite. The portal owns the GIP integration. All apps verify portal-minted JWTs via `@coms-portal/sdk`. No app runs its own credential provider, no app hosts its own login flow, no app maintains its own session minter.

aha-fast migrates off Better Auth as part of the consolidation. Existing aha-fast user records are reconciled against portal user records during migration (one-time data migration spec).

## Consequences

**Positive.**

- One identity. One place to deactivate a user. One canonical email-to-user mapping.
- The integration contract becomes enforceable. "Apps don't host credentials" is structural, not aspirational.
- Cross-app guarantees work: SSO is automatic (same-origin cookie + portal-issued JWT). User provisioning to a new app is a portal grant, not a duplicated record.
- One reset-password flow, one email-verification flow, one MFA configuration — managed in portal, inherited by every app.
- Engineers moving between apps see the same auth surface in every app.

**Negative.**

- aha-fast migration cost is real. Steps:
  1. Drop Better Auth's `User`, `Session`, `Account`, `Verification`, `GoogleToken` tables (or convert to app-specific profile table, see ADR 0005).
  2. Reconcile existing aha-fast user records (by email) with portal user records. Create portal records for users not yet provisioned. Issue invitation flow for users who never logged in.
  3. Delete `/login`, `/register`, `/forgot-password`, `/verify-email` routes.
  4. Replace Better Auth middleware with `@coms-portal/sdk` JWT verification.
  5. Drop `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from build/deploy configs.
- The aha-fast engineer must learn GIP / the portal SDK in place of Better Auth. One-time learning cost.
- The portal becomes a higher-stakes single point of failure for authentication. Mitigations (GIP's own SLA, portal-side caching, app-side graceful degradation for read-only views) live in portal's reliability spec, not this ADR.

**Neutral.**

- GIP cost scales with monthly active users. The free tier (50K MAU) covers projected scale; tier 1 pricing is modest beyond that.
- The current portal SDK already implements JWT verification correctly. The work for new apps is consumption, not authoring.

## Alternatives considered

**Keep Better Auth on aha-fast; bridge externally.** Portal mints a token; aha-fast accepts it via SDK and creates a parallel Better Auth session. Users can log in either way. Rejected because:

- Two auth systems running side by side, kept in sync by code.
- Every aha-fast feature touching auth has to handle both paths.
- The "single user provisioning" goal is broken: two user record stores, two reset-password flows.
- This is a permanent technical debt, not a migration path.

**Maintain two auth contexts forever.** Pragmatic acceptance of the existing divergence. Rejected because it directly contradicts the unification mandate. Every future feature involving cross-app behavior has to handle both auth shapes.

**Migrate everything to a third-party identity (Auth0, Clerk, WorkOS).** Real options with strong feature sets. Switching costs are high: portal already integrates GIP, portal-issued JWTs are already in use, the GIP SDK ecosystem is mature. No compelling forcing function to switch off GIP. If a future need (federation with enterprise customers, complex RBAC) emerges that GIP can't serve, re-evaluate then.

**Migrate everything to Better Auth.** Inverse of the above. The minority position. Better Auth is a competent library but it would mean rewriting portal's auth (and rolling back the GIP investment). Rejected for the same reason inversely.

## Migration spec for aha-fast

Lives in its own spec document (`spec/NN-fast-onboarding.md`, written when aha-fast freezes its current in-flight work). Key constraints:

- One-time data migration: match existing Better Auth users to portal users by email; create portal records for unmatched users; issue welcome/invitation emails.
- Cutover window: a brief maintenance window where aha-fast is unavailable while user records flip.
- Rollback plan: data migration is one-way once cutover happens; rollback is a database restore.

## References

- Integration contract §§ 1, 2.
- ADR 0005 (JWT stateless sessions) — defines what apps do with the tokens GIP mints via portal.
- aha-fast's `prisma/schema.prisma` — the Better Auth tables that this ADR replaces.
