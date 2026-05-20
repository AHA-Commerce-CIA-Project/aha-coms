# Execution Plan: Spec 07 (DB Perf) + Spec 08 (JWT Sessions) + Spec 09 (SSE Fanout) + Spec 05 Carry-overs + Spec 06 Doc Reconciliation

> Last updated: 2026-05-20 — fresh start; prior plan + todo archived at `tasks/archive/2026-05-20-snapshot.{plan,todo}.md` after Specs 01/02/05 sealed and Spec 06 PR F shipped to prod.

## Goal

Drive the codebase to:

1. **Zero findings** against the DB Perf Audit rulebook v2 (Spec 07 — 27 Critical/High/Medium/Low across portal-api, heroes-api, fast, heroes-shared).
2. **Zero per-request DB reads on the session-validation hot path** across portal-api, portal-web, heroes-{api,web}, and fast (Spec 08 — the deferred ADR 0005 resolution).
3. **Zero per-stream polling on fast's three SSE routes** — cross-instance LISTEN/NOTIFY fanout per ADR 0007 (Spec 09 — the unimplemented half of the SSE-over-WebSockets decision).
4. **Spec 05 carry-overs closed** (T64 PK promotion + FU-12 bot rebind + five cosmetic findings from the CP21 walk).
5. **Spec 06 PR F doc reconciled** with shipped code (28 stale `[ ]` markers flipped).

## Inputs (read first in any fresh session)

- `docs/spec/07-database-performance-remediation.md` — DB perf audit, 27 tasks across 2 phases
- `docs/spec/08-jwt-stateless-sessions.md` — JWT migration delivering ADR 0005's promise
- `docs/spec/09-sse-listen-notify-fanout.md` — LISTEN/NOTIFY cross-instance fanout delivering ADR 0007's promise
- `docs/spec/06-portal-password-auth.md` — PR F design (for marker reconciliation)
- `docs/adr/0005-jwt-stateless-sessions.md` — the original ADR Spec 08 honors
- `docs/adr/0007-sse-over-websockets.md` — the original ADR Spec 09 honors
- `apps/fast/CLAUDE.md` — per-app persona rule + `[skip-db-push]` first-line gating
- `tasks/archive/2026-05-20-snapshot.{plan,todo}.md` — historical narrative for Specs 01/02/05 + Spec 06 PR F + FUs 1–28

## Current state (2026-05-20)

- **Specs 01, 02, 05** — sealed; CP21 crossed 2026-05-14; heroes (Svelte) + fast (React) both prove cross-framework parity in production
- **Spec 06 PR F** — shipped to prod through commits `eb13d13` → `cd5d593` → `7d65a72` → `ba83444` → `f1e143e`; `FORCE_PASSWORD_SETUP_ENABLED` live; profile rotation card + passphrase tip live
- **Spec 03 + 04** — both still stubs ("not yet scoped in detail"); deferred to a future scoping pass (Phase E in this plan)
- **Spec 07** — authored 2026-05-20; no code landed yet
- **Spec 08** — authored 2026-05-20 (this session); no code landed yet
- **Spec 09** — authored 2026-05-20 (this session, after ADR audit surfaced ADR 0007's unimplemented LISTEN/NOTIFY half); no code landed yet
- **Carry-overs from CP21 walk** — T64 PK promotion (38 FK cascade), FU-12 (system bot rebind, folded into T64), F2/F5/F9/F11/F14 cosmetic findings

## Dependency graph

```
                ┌──────────────────────────────────────────────────────┐
                │           Phase A — Spec 07 Phase 1                  │
                │           (code-only, 17 tasks + 1 bundle)           │
                │                                                      │
                │   A.portal-api Critical N+1s ────┐                   │
                │   A.heroes-api Critical N+1s     │                   │
                │   A.fast Critical N+1s            ├ parallel; 1 PR/task
                │   A.High severity (3)             │                   │
                │   A.Medium + Low (3)             ─┘                   │
                └──────────────────────┬───────────────────────────────┘
                                       ▼
                ── CHECKPOINT A ─────────────────────────────────────
                Audit rerun against Phase 1 file:lines = zero findings.
                Type-check + tests green workspace-wide.
                ──────────────────────────────────────────────────────
                                       ▼
                ┌──────────────────────────────────────────────────────┐
                │           Phase B — Spec 07 Phase 2                  │
                │           (migrations + sargable rewrites)           │
                │                                                      │
                │   B.1 pg_trgm + GIN (T2.1) ───┐                      │
                │   B.2 portal-api idx (T2.2)   ├ parallel             │
                │   B.3 fast Prisma idx (T2.3) ─┘                      │
                │             │                                        │
                │             ▼                                        │
                │   B.4 employee-info-sync sargable (T2.4, needs B.2)  │
                │   B.5 aliases trigram (T2.5, needs B.1)              │
                │   B.6 fast search startsWith (T2.6)                  │
                │             │                                        │
                │             ▼                                        │
                │   B.7 T2.7 Verification — rerun audit                │
                └──────────────────────┬───────────────────────────────┘
                                       ▼
                ── CHECKPOINT B ─────────────────────────────────────
                Spec 07 sealed — full audit re-run = zero findings.
                ──────────────────────────────────────────────────────

                ┌──────────────────────────────────────────────────────┐
                │           Phase C — Spec 05 Carry-overs              │
                │           (interleavable with A/B)                   │
                │                                                      │
                │   C.1 T64 PK promotion (User.id → portal_sub)        │
                │       └─ folds C.2 FU-12 bot rebind                  │
                │   C.3 F2 portal_code/portal_redirect_to URL litter   │
                │   C.4 F5 "AHA COMSS" brand strings (9 sites)         │
                │   C.5 F9 CalendarMeetingSection basePath drift       │
                │   C.6 F11 /fast/request mobile overflow              │
                │   C.7 F14 portal-web PWA installability              │
                │   (C.3–C.7 independent of C.1+C.2)                   │
                └──────────────────────┬───────────────────────────────┘
                                       ▼
                ── CHECKPOINT C ─────────────────────────────────────
                All Spec 05 carry-overs closed.
                ──────────────────────────────────────────────────────

                ┌──────────────────────────────────────────────────────┐
                │           Phase D — Housekeeping                     │
                │   D.1 Spec 06 PR F: flip 28 stale [ ] → [x]          │
                └──────────────────────────────────────────────────────┘

                ┌──────────────────────────────────────────────────────┐
                │           Phase F — Spec 08                          │
                │           (JWT stateless sessions per ADR 0005)      │
                │           Gated by Phase B (DB perf must be sane     │
                │           before measuring the JWT migration's win)  │
                │                                                      │
                │   F.1+F.2 JWT minting + sdk.auth.verifyRequest       │
                │             │                                        │
                │             ▼                                        │
                │   F.3 Portal-api middleware swap (dual-path)         │
                │   F.4 loadHeroes/FastAuthUser swap (dual-path)       │
                │   F.5 portal-web hooks.server.ts swap                │
                │             │                                        │
                │             ▼                                        │
                │   F.6 Revocation list + SDK helper                   │
                │             │                                        │
                │             ▼                                        │
                │   F.7 Migration window (7-day legacy-fallback = 0)   │
                │   F.8 ADR 0005 addendum                              │
                └──────────────────────┬───────────────────────────────┘
                                       ▼
                ── CHECKPOINT F ─────────────────────────────────────
                Spec 08 sealed — auth_sessions reads on validation = 0.
                ──────────────────────────────────────────────────────

                ┌──────────────────────────────────────────────────────┐
                │           Phase G — Spec 09                          │
                │           (SSE LISTEN/NOTIFY fanout per ADR 0007)    │
                │           Gated by Phase B; independent of Phase F   │
                │           (can land in parallel with Phase F)        │
                │                                                      │
                │   G.1 NOTIFY from channel message writes             │
                │   G.2 NOTIFY from DM writes                          │
                │   G.3 NOTIFY from notification creates               │
                │   G.4 NOTIFY from channel read-status updates        │
                │             │ (Phase 1 ships; no consumer yet)       │
                │             ▼                                        │
                │   G.5 Per-instance LISTEN connection + registry      │
                │             │                                        │
                │             ▼                                        │
                │   G.6 channels/stream cutover                        │
                │   G.7 chat/stream cutover                            │
                │   G.8 notifications/stream cutover                   │
                │             │                                        │
                │             ▼                                        │
                │   G.9 Cross-instance verification                    │
                │   G.10 Disable Cloud Run session affinity            │
                │             │                                        │
                │             ▼                                        │
                │   G.11 Steady-state DB query observation             │
                │   G.12 ADR 0007 amendment                            │
                └──────────────────────┬───────────────────────────────┘
                                       ▼
                ── CHECKPOINT G ─────────────────────────────────────
                Spec 09 sealed — per-stream polling DB queries ≈ 0;
                session_affinity off; cross-instance fanout works.
                ──────────────────────────────────────────────────────

         Phase E — Out of scope here (future)
           ├─ E.1 Spec 03 scoping pass (Integration Test Kit stub)
           └─ E.2 Spec 04 scoping pass (SDK as Enforcement Layer stub)
```

## Vertical slicing approach

- **Spec 07**: one PR per task ID (§4 mandate). Each PR = the rule + file edits + the test asserting the batched code path runs exactly one DB call (N+1 fixes), pagination honors `limit` (pagination fixes), or single-statement assertions (batch-action fixes). No horizontal layering ("first all schemas, then all routes").
- **Spec 08**: F.1+F.2 together (the mint + the verify, useless apart). F.3/F.4/F.5 each their own PR (one verifier swap per surface). F.6 its own PR. F.7 is operator-led (cutover gate).
- **Spec 09**: G.1–G.4 NOTIFY firings each own PR (zero-impact, no consumer yet). G.5 LISTEN+registry own PR (the load-bearing infrastructure). G.6–G.8 each own PR (one route cutover at a time, so a regression isolates to one route). G.9–G.12 operator-led.
- **Carry-overs**: one PR each. C.1 (T64) is its own operator window.
- **Race-safe atomic queries** stay race-safe per Spec 07 §4:
  - T1.13 milestone `claimedById: null` guard inside the single UPDATE
  - T1.2 / T1.3 access-cleanup `NOT EXISTS` guards inside the single DELETE

## Checkpoints

- **Checkpoint A — Phase 1 sealed:** rerun audit rulebook against §Tasks/Phase 1 file:line list = zero findings; `bun run --filter '*' typecheck` exit 0; `bun run --filter '*' test` green
- **Checkpoint B — Spec 07 sealed:** T2.7 verification = zero findings full audit; migrations applied against prod with operator coordination (pg_trgm GIN creation locks on >100k-row tables)
- **Checkpoint C — Carry-overs closed:** T64 PK promotion landed cleanly (38 FKs cascaded); FU-12 bot row reachable via portal_sub; F2/F5/F9/F11/F14 mended; `apps/fast/docs/smoke-checklist.md` re-walked end-to-end
- **Checkpoint D — Spec 06 doc reconciled:** every `[ ]` in `06-portal-password-auth.md` flipped to `[x]` with anchor commit SHA inline
- **Checkpoint F — Spec 08 sealed:** `legacy_session_validate` counter = 0 for 7 consecutive days across all surfaces; fallback paths removed; `auth_sessions` reads on validation hot path = 0 in steady state
- **Checkpoint G — Spec 09 sealed:** `session_affinity` flipped to `false` on `coms-fast-web`; cross-instance smoke confirms a message written via instance A reaches an SSE client on instance B; `pg_stat_statements` snapshot shows ~95% drop in the per-stream polling queries; ADR 0007 amendment landed

## Risks worth tracking

- **Spec 07 Phase 2 GIN index creation locks** — `pg_trgm` indexes on `achievement_points`, `identity_users`, `identity_user_emails`, `heroes_profiles`, `tasks`, `ChannelMessage`, `ActivityLog` (>100k rows) take minutes and lock writes. Per Spec 07 §6 *Ask first* — schedule with operator before merging; consider `CREATE INDEX CONCURRENTLY` where available
- **T64 cascade complexity** — 38 product-model FK relations from `User.id`. Deserves its own commit + operator window per the existing CP14 deferral. Not bundled with anything else
- **Spec 08 coordinated cutover** — F.3/F.4/F.5 land roughly together but the dual-path pattern means either deploy order is safe. Risk = users locked out if SDK verification fails silently. Mitigation: F.3's `legacy_session_validate` counter surfaces fallback frequency in real time
- **Spec 09 connection budget** — each warm Cloud Run instance holds one dedicated `pg` LISTEN connection. At `coms-fast-web` `max=5`, that's 5 connections sitting open against db-f1-micro's 25-conn ceiling (20%). Monitor during the cutover; the 2026-05-18 audit dropped `min` from 1 → 0 to reclaim conns, this spec gives back ~1 per warm instance
- **Spec 09 NOTIFY 8KB payload limit** — channel message bodies can exceed it. The event-id-then-fetch pattern (ADR 0007 §43) is the design; risk = forgetting and stuffing payloads, breaking silently for long messages. Mitigation: payload schema is enforced minimally at the registry layer
- **Per-app persona drift** — portal/heroes commits use Mr. Door; **fast commits use plain technical English** with `Confidence`/`Scope-risk`/`Tested`/`Related` trailers per `apps/fast/CLAUDE.md`. No `Author: Mr. Door` on fast commits. No `Co-Authored-By: Claude` on either. No `🤖 Generated` footer
- **`[skip-db-push]` gate** — Phase B needs `db push` to run; default to **not** skipping. Phase A code-only PRs against `apps/fast` may carry `[skip-db-push]` in the **first line** of the commit message (per FU-23's gate-fix)
- **Audit re-run is manual** — automation explicitly out of scope per Spec 07 §172. Each PR re-runs the rulebook against touched files
- **Spec 08 revocation latency** — F.6's 60s TTL ceiling means revoked users can hit apps for up to 60s post-revocation. Accepted tradeoff per ADR 0005 §49

## Standing principles (carried from prior plan)

1. **Codebase-memory-mcp first** — for any code search; fall back to grep/glob only for non-code files
2. **Sonnet not Opus default** — model selection per user's standing directive
3. **Parallel agent strategy** — multi-Agent tool calls in a single message for independent searches
4. **Per-app persona** — Mr. Door (portal/heroes) vs. plain English (fast). Trailers per app
5. **Type-check + tests must pass on every PR** — no exceptions
6. **Public API contracts unchanged** — response shapes stay byte-identical (Spec 07 §4)
7. **ctx7 for library docs** — never trust training-data API details
8. **agent-skills:build for code execution** — slash-command for vertical-slice builds

## What's deliberately not in this plan

- **Spec 03 (Integration Test Kit)** — stub status: "not yet scoped in detail". Needs a scoping pass before becoming plannable. Listed as Phase E.1
- **Spec 04 (SDK as Enforcement Layer)** — stub status, same as Spec 03. Phase E.2
- **Platform-owned notifications v1** — separate future spec; the heroes + fast deviation is logged in integration contract §10
- **App 3 / App 4 onboarding** — separate future specs once domains scoped
- **HIBP breach-corpus check for password policy** — Spec 06 follow-up, out of Spec 07/08 scope
- **Spec 07 audit automation** — out of scope per Spec 07 §172
- **JWT key rotation strategy** (Spec 08) — out of v1; tracked as a follow-up
- **Refresh-token plumbing** (Spec 08) — out of v1; today's 8-hour JWT covers a working day

## Session-handoff protocol

Mirror the prior plan's discipline: in any fresh session, the model:

1. Reads this `tasks/plan.md` first (full read; it's intentionally short — under 300 lines)
2. Reads the relevant spec file for the phase being picked up
3. Reads only the relevant task section in `tasks/todo.md` (not the whole file)
4. Skims `tasks/archive/2026-05-20-snapshot.todo.md` only for cross-referenced FU outcomes (e.g., FU-23's `[skip-db-push]` gate-fix)
5. Confirms current state via `git log --oneline -10` and `git status` before assuming what's done

## Confidence in the plan

- **High** on Phase A (Spec 07 Phase 1): spec is explicit at the file:line level, 17 well-bounded tasks, mechanical fixes
- **Medium-high** on Phase B (Spec 07 Phase 2): migrations need operator coordination, locking risk on large tables — but well-scoped
- **Medium** on Phase C: T64 is genuinely tricky (38 FKs); F2/F5/F9/F11/F14 are smaller cosmetic fixes
- **Low effort** on Phase D: mechanical marker flips with commit SHAs as anchors
- **Medium-high** on Phase F (Spec 08): the dual-path migration pattern is well-understood; mirrored from Spec 02 Phase 2's Better Auth removal. Hardest parts are revocation cache + JWT-payload staleness window — both have proposed defaults
- **Medium-high** on Phase G (Spec 09): LISTEN/NOTIFY + subscriber registry is a well-documented pattern; ADR 0007 already names every constraint (8KB payload, queue overflow handling, heartbeat interval). The risky parts are graceful-shutdown discipline for the dedicated `pg` connection and the db-f1-micro connection budget — both observable, both bounded

This plan is intentionally short relative to its predecessor. Detail belongs in the spec files; the plan exists to sequence them.
