# ADR 0012: `Sequence 0 — main protection` — ruleset + CODEOWNERS access model

Status: accepted (2026-05-15)

## Context

Through Spec 05's runway and the Op-1..Op-12 first-apply windows, the
monorepo had one author of record (@mrdoorba) and one form of access
control on `main`: GitHub's legacy branch protection. The legacy
protection required two status checks (`Typecheck & unit tests`,
`Lint hardcoded URLs`) and blocked force-pushes
(`allow_force_pushes: false`); it did not require reviews. With
`enforce_admins: false`, the operator's direct pushes from the laptop
bypassed the status-check requirement, which was deliberate — operator-
led plan-then-apply windows depend on landing infra and migration prep
without a self-review ceremony.

Two operational facts surfaced the limits of that model:

1. **FU-19 partial-1 (history scrub, 2026-05-14)** had to flip
   `allow_force_pushes` to `true`, push the rewritten history, and
   flip it back. Legacy protection has no bypass-actor mechanism; the
   only way through it is to relax + restore the flag. The dance
   worked but left the repository unprotected for the duration of the
   force-push, and FU-19 partial-2 will need the same dance again.
2. **The second engineer (@alifm17)** is preparing to join the org as
   the day-to-day owner of `apps/fast/`. He must not be able to push
   to `main` directly; he must go through a PR; PRs that touch shared
   workspace packages, IaC, or CI must block on @mrdoorba's review;
   PRs limited to `apps/fast/` should require a Code Owner review he
   himself cannot satisfy (GitHub forbids self-approval).

Legacy protection cannot express any of those routings.

Three options were weighed.

**Option A — Tighten the legacy protection alone.** Enable
`required_pull_request_reviews`, set
`required_approving_review_count: 1`, set `dismiss_stale_reviews:
true`, enable `require_code_owner_reviews: true`. Pros: one protection
system, no duplication. Cons: legacy protection has no bypass-actor
mechanism — the operator's force-push for FU-19 partial-2 (still
pending) would again require the relax-restore dance, brittle and
leaves a protection gap mid-operation. Small-batch infra pushes
(Op-1..Op-12 shape) would each require a self-PR (forbidden) or a
relax-restore round-trip.

**Option B — Rulesets with a bypass team.** GitHub Rulesets, the newer
protection mechanism, support **bypass actors**: a team or role
specified as "exempt from this rule." Create a one-person team
containing only @mrdoorba; configure the ruleset's bypass actors to
include that team; @mrdoorba's direct pushes bypass the gate
automatically without needing to relax-then-restore anything. @alifm17
is not in the team and is gated fully.

**Option C — Drop protection on `main` entirely.** Single-author repo,
no gate, until @alifm17 joins. Pros: maximally simple now. Cons: the
gate has to be authored against a live PR flow when @alifm17 arrives
anyway; the legacy status-check requirement has already paid for
itself once (the `Lint hardcoded URLs` check caught real drift during
Op-6's Dockerfile iteration). Dropping it is a regression.

## Decision

**Adopt Option B.** Three artifacts land together and are co-equal:

1. **`Sequence 0` team** in the `AHA-Commerce-CIA-Project` org —
   one-person team (ID `17550162`, slug `sequence-0`), containing only
   @mrdoorba as maintainer, `privacy: closed`. The team's sole purpose
   is to identify bypass actors. It carries no repo permissions of its
   own; @mrdoorba's repo access flows from his org-admin role.

2. **`Sequence 0 — main protection` ruleset** (ID `16424290`) on the
   `aha-coms` repo, scoped to `~DEFAULT_BRANCH`. Rules:
   - `pull_request`: 1 approval, dismiss stale reviews on push, require
     Code Owner review, all three merge methods allowed.
   - `required_status_checks`: `Typecheck & unit tests`, `Lint
     hardcoded URLs`, no strict-up-to-date requirement.
   - `non_fast_forward`: block force-pushes.
   - `deletion`: block branch deletion.
   - **Bypass actors**: `Sequence 0` team, `bypass_mode: always`.

3. **`.github/CODEOWNERS`** — the gate's "who's the Code Owner" answer:
   - `*` → @mrdoorba (default fallback)
   - `/apps/fast/` → @mrdoorba + @alifm17 (co-owned; he cannot
     self-approve so @mrdoorba's approval is always required)
   - `/packages/` → @mrdoorba (shared workspace packages)
   - `/infra/` → @mrdoorba (IaC blast radius)
   - `/.github/` → @mrdoorba (CI workflows + ruleset-adjacent configs)

The legacy branch protection **remains in place** as defense-in-depth.
Both apply; most-restrictive-per-rule wins. Retirement of the legacy
protection is a follow-up (see Reopen criteria §2).

A fourth artifact — `.github/pull_request_template.md` — landed with
the same commit but is not a gate; it is a soft prompt that auto-fills
the PR description with a cross-app-impact checklist.

## Conditions under which this ADR's decision would be revisited

Not permanent. Revisit when any of:

1. **A second org owner / second principal joins.** Sequence 0 stays a
   single-team abstraction; new principals are added by adding the
   user to the team, not by editing the ruleset.
2. **The legacy branch protection can be retired.** Today both
   protection systems run side-by-side because the legacy one has
   been load-bearing for status-check enforcement since Spec 02. Once
   the ruleset has owned the gate through one full operator cycle
   without surprise (one force-push window resolved, one cross-app
   review cycle observed), the legacy protection can be deleted to
   remove the duplication. Until then, force-push windows still
   require the relax-restore dance against the legacy
   `allow_force_pushes: false` even though the ruleset would bypass
   `non_fast_forward` natively for Sequence 0 members.
3. **Code Owner routing becomes a friction point.** If a third
   engineer joins and their work spans `/apps/fast/` + `/packages/` +
   `/infra/` regularly, the principal-only review on `/packages/` and
   `/infra/` becomes a bottleneck. Split CODEOWNERS by sub-path then,
   or grant the third engineer co-ownership of `/packages/`.
4. **The bypass model leaks privilege.** If Sequence 0 ever holds more
   than the principal operators (a teammate added "just to unblock a
   merge"), audit the membership against this ADR's "principal
   operators only" framing and remove anyone outside that scope.

## Consequences

**Positive.**

- @alifm17 cannot push to `main` directly; cannot self-merge any PR;
  cannot push changes outside `/apps/fast/` without @mrdoorba's
  approval. Blast radius of his commits is bounded by CODEOWNERS.
- @mrdoorba's bypass capability is now explicit and team-scoped
  (`Sequence 0`) instead of implicit ("admins bypass when
  `enforce_admins: false`"). The access model can be reasoned about by
  reading the ruleset rather than the legacy-protection JSON.
- Future principals (a backup operator, a second org owner) are added
  by team membership, not by re-authoring the ruleset.
- The PR template (`.github/pull_request_template.md`) prompts authors
  to declare cross-app impact at PR creation time, surfacing
  shared-package changes the reviewer should read carefully.

**Negative.**

- Two protection systems run on `main` simultaneously. Engineers
  reading the protection state of `main` have to read both `gh api
  repos/.../branches/main/protection` and `gh api
  repos/.../rules/branches/main`. The duplication is intentional but
  costs clarity until the legacy retirement (Reopen criteria §2).
- Legacy protection's `allow_force_pushes: false` still blocks
  force-pushes from everyone (including Sequence 0 members) until the
  legacy retirement. Future force-push windows (FU-19 partial-2 when
  it unblocks) need the same relax-restore dance partial-1 used.
- CODEOWNERS auto-request is silently a no-op when the only Code
  Owner is the PR author. Verified during the smoke test (PR #5,
  closed 2026-05-15): `reviewRequests: []` despite the path matching
  a CODEOWNERS rule, because GitHub does not request self-review. The
  gate still applies (`reviewDecision: REVIEW_REQUIRED`,
  `mergeStateStatus: BLOCKED`).

**Neutral.**

- The ruleset's `required_status_checks` duplicates legacy
  protection's status-check requirement. Both must pass; same checks
  on both sides. No additional CI cost.
- `tasks/plan.md`'s standing principles list does not change. This
  ADR addresses access control on a specific repo, not a standing
  principle.
- The live ruleset state is the canonical record. To re-derive the
  creation payload: `gh api
  repos/AHA-Commerce-CIA-Project/aha-coms/rulesets/16424290`.

## References

- Commit `8f94b54` — three-wards commit landing CODEOWNERS, PR
  template, apps/fast/CLAUDE.md commit-format rewrite.
- Smoke-test PR #5 (closed without merge, branch deleted) — first PR
  through the gate; confirmed `reviewDecision: REVIEW_REQUIRED` +
  `mergeStateStatus: BLOCKED` with both status checks attached.
- `tasks/todo.md` FU-26 — the operations entry recording the team +
  ruleset creation, the smoke test, and the open follow-up on legacy
  consolidation.
- `tasks/todo.md` FU-19 partial-1 — the force-push incident the
  bypass model is designed to make less brittle.
- `apps/fast/CLAUDE.md` (Code modification section) — the Fast
  engineer's contract: commit format, CODEOWNERS routing he sees, what
  the PR template prompts.
- `.github/CODEOWNERS` — the routing map.
- `.github/pull_request_template.md` — the soft PR-description prompt.
