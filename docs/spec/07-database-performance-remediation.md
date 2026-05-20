# Spec 07 — Database Performance Remediation

**Authored:** 2026-05-20
**Audit source:** Codebase Scan Rules: Database Query Optimization (v2 — severity tiers + safe havens).
**Consumer:** `agent-skills:build` (and `agent-skills:plan` if a planning pass is wanted first).

---

## 1. Objective

Fix every finding from the DB Perf Audit re-run on 2026-05-20: **12 Critical, 8 High, 6 Medium, 1 Low** across `apps/portal-api`, `apps/heroes-api`, `apps/fast`, and `packages/heroes-shared`. Work is split into two phases; Phase 2 is gated by Phase 1.

**Definition of done (whole spec):** re-running the audit rulebook against the changed code produces **zero findings** at the file:line entries listed in `## Tasks` below. No new latency SLOs introduced by this spec.

**Definition of done (per task):** re-running the rulebook against the task's listed file:lines produces no finding for that rule. Type-check passes. Existing tests pass.

---

## 2. Commands

Run from repo root unless noted.

```bash
# Workspaces
bun install                                                     # after any package.json edit

# Per-app
bun run --filter @coms-portal/portal-api typecheck
bun run --filter @coms-portal/portal-api test
bun run --filter @coms-portal/heroes-api  typecheck
bun run --filter @coms-portal/fast        typecheck
bun run --filter @coms-portal/fast        lint

# Migrations (Phase 2)
bun run --filter @coms-portal/portal-api db:generate            # Drizzle: emits SQL into apps/portal-api/drizzle/
bun run --filter @coms-portal/portal-api db:migrate             # apply locally
bun run --filter @coms-portal/heroes-api  db:generate
bun run --filter @coms-portal/heroes-api  db:migrate
bun run --filter @coms-portal/fast        db:push               # Prisma db push (CI runs this via cloud-sql-proxy)

# Audit re-run (manual until automation lands — out of scope here)
# Use the rulebook against the touched files; rerun all 9 rules at each PR.
```

---

## 3. Project structure (where work lands)

```
apps/
  portal-api/src/
    routes/         — handler edits (employees.ts, access.ts, teams.ts)
    services/       — service edits (teams.ts, taxonomies.ts, employee-info-sync.ts,
                                    email-resolution.ts, aliases.ts)
    db/schema/      — Drizzle index() additions (Phase 2: identity-users.ts)
  portal-api/drizzle/                                  — generated SQL migrations (Phase 2)
  heroes-api/src/
    routes/         — leaderboard, teams pagination
    services/       — redemptions, approval, challenges, appeals batch variants
    repositories/   — teams (correlated subquery → group-by), pagination on getTeamMembers
  fast/
    app/api/…/route.ts                                 — handler edits
    prisma/schema.prisma                               — @@index additions (Phase 2)
    prisma/sql/                                        — raw SQL for pg_trgm + GIN (Phase 2)
packages/
  heroes-shared/src/db/schema/                         — Drizzle index() additions (Phase 2)
  heroes-shared/src/db/migrations/                     — generated SQL (Phase 2)
```

**Rule:** generated migration SQL is committed alongside the schema edit. Never hand-edit generated files; rerun `db:generate` instead.

---

## 4. Code style

- **ORM idioms.** portal-api / heroes-api use Drizzle (`db.select`, `db.insert(...).values([...])`, `db.execute(sql\`...\`)`). fast uses Prisma (`prisma.x.findMany`, `groupBy`, `updateMany`). Never mix — no Prisma in Drizzle apps and vice versa.
- **Batching idioms.**
  - Drizzle batch insert: `.values(rows[])` not loop.
  - Drizzle batch update: `db.update(...).set(...).where(inArray(table.id, ids))` or `db.execute(sql\`UPDATE ... WHERE id IN (...)\`)`.
  - Prisma batch insert: `createMany({ data: [...], skipDuplicates: true })`.
  - Prisma batch update: `updateMany({ where: { id: { in: ids } }, data: {...} })`.
- **Projection.** When adding a `select` projection to a Drizzle `db.select()` or a Prisma `findMany`, only list the columns the immediate caller reads downstream. Do not over-project to "future-proof".
- **No raw SQL** unless the ORM can't express it. The two known exceptions in this spec are (a) `db.execute(sql\`DELETE ... NOT EXISTS ...\`)` in T1.2 / T1.3, and (b) Phase 2 raw migrations for `pg_trgm` GIN indexes which Prisma/Drizzle can't model natively.
- **Atomic semantics preserved.** The milestone updateMany (T1.13) and the access-cleanup queries (T1.2, T1.3) must remain race-safe — keep the `claimedById: null` / `NOT EXISTS` guards inside the single statement.
- **Public API contracts unchanged.** Response shapes for every flagged route stay byte-identical; if a Drizzle/Prisma projection drops a field, re-add it explicitly to the response builder.
- **Commits / PRs.**
  - portal-api, heroes-api, shared: **Mr. Door** persona (`Author: Mr. Door` anchor; structured trailers per `~/.claude/skills/mr-door/`).
  - **apps/fast: plain technical English** with the four trailers required by `apps/fast/CLAUDE.md` (`Confidence`, `Scope-risk`, `Tested`, `Related`). **No `Author: Mr. Door`.** **No `Co-Authored-By: Claude`.** **No `🤖 Generated` footer.**
- **One PR per task.** Each PR's title states the rule + file (e.g., `fix N+1 — chat/conversations groupBy unread counts`). PR body references this spec by task ID.

---

## 5. Testing strategy

- **Type-check + existing test suite must pass on every PR.** No exceptions.
- **Per-task minimum test additions:**
  - N+1 fixes: add a test asserting the batched code path runs **exactly one** DB call to the relevant model. Where the test harness doesn't expose a query counter, assert via the result shape that the batched helper was used (e.g., `getDisplayEmailsForUsers` returns a `Map`; assert callsite produces the map).
  - Pagination additions: add a test that requests page 2 with `limit=5` and asserts the response honors both.
  - Batch-action fixes (redemptions, approval, notifications): add a test with `ids.length === 3` confirming a single status UPDATE statement and a single audit-log INSERT.
  - Migration tasks (Phase 2): write a verification query for `pg_stat_user_indexes` confirming the new index exists. Run locally against a seeded DB before merging; CI re-runs migrations.
- **No mock-only N+1 tests.** Stub the DB client at the boundary, count calls — don't mock the Drizzle/Prisma chain (mocks lie about call counts).
- **Performance regression check.** Not required by acceptance, but if a fix is non-obvious, capture an `EXPLAIN ANALYZE` before/after in the PR body.

---

## 6. Boundaries

### Always
- Use the existing ORM (Drizzle for portal/heroes, Prisma for fast). New ORMs are out of scope.
- Preserve public API response shapes byte-for-byte.
- Commit / PR per the per-app persona rule in §4.
- Generate Drizzle migrations via `db:generate` and commit both the schema edit and the SQL file together.
- For `apps/fast` schema-touching commits, follow the `[skip-db-push]` rules in `apps/fast/CLAUDE.md`. Default to **not** skipping db-push (Phase 2 needs it to run).
- For destructive Phase 2 migrations (none expected, but if any new index conflicts with an existing name), use the manual proxy path per `infra/README.md`.

### Ask first
- Any migration touching `achievement_points`, `identity_users`, `identity_user_emails`, `heroes_profiles`, `tasks`, `ChannelMessage`, or `ActivityLog` with > ~100k rows. `pg_trgm` GIN index creation on these tables takes minutes and locks. Schedule with the operator before merging.
- Any schema rename or column drop. None planned by this spec — if a fix discovers one is needed, pause and ask.
- Changes that would alter a public API response shape (even adding a field). The default is to preserve byte-identity; deviations need confirmation.

### Never
- `git push --force`, `git commit --no-verify`, or any flag that bypasses the pre-commit secret scan and the `code-review-graph detect-changes` hook (per `apps/fast/CLAUDE.md`).
- Append `Co-Authored-By: Claude …` or the `🤖 Generated with [Claude Code]` footer to any commit or PR.
- Introduce a new ORM, a new database, or a new query-execution layer.
- Drop tests to make CI green. If a test now fails because the batched query changed call counts, *update* the test to match the new (correct) shape.
- Apply Phase 2 migrations against production without the operator's go-ahead.
- Use `--no-gpg-sign` or bypass signing.

---

## Tasks

### Phase 1 — Code-only (no migrations) — 17 tasks

| ID | File | Rule | Severity |
|---|---|---|---|
| T1.1 | apps/portal-api/src/routes/employees.ts:179-187 | N+1 | Critical |
| T1.2 | apps/portal-api/src/routes/access.ts:128-145 | N+1 | Critical |
| T1.3 | apps/portal-api/src/services/teams.ts:50-67 | N+1 | Critical |
| T1.4 | apps/portal-api/src/services/teams.ts:21-27 | N+1 | Critical |
| T1.5 | apps/portal-api/src/services/taxonomies.ts:210-220 | N+1 | Critical |
| T1.6 | apps/portal-api/src/services/employee-info-sync.ts:213,227 | N+1 (+Dup) | Critical |
| T1.7 | apps/heroes-api/src/services/{redemptions,approval}.ts | N+1 | Critical |
| T1.8 | apps/heroes-api/src/services/{challenges,appeals}.ts | N+1 | Critical |
| T1.9 | apps/heroes-api/src/repositories/teams.ts:25-30 | Correlated subquery | High |
| T1.10 | apps/heroes-api/src/repositories/teams.ts:getTeamMembers | Row over-fetch | High |
| T1.11 | apps/portal-api/src/routes/teams.ts:14-25 | Row over-fetch | High |
| T1.12 | apps/fast/app/api/chat/conversations/route.ts:71-83 | N+1 | Critical |
| T1.13 | apps/fast/app/api/tasks/[id]/complete/route.ts:50-66 | N+1 | Critical |
| T1.14 | apps/fast/app/api/orbit/analytics/route.ts:73-100 | N+1 | Critical |
| T1.15 | apps/fast/app/api/admin/sync-hr/route.ts:80-86, 89-109 | N+1 | Critical |
| T1.16 | apps/portal-api/src/services/email-resolution.ts (memoise + project) | Dup + Column | Medium |
| T1.17 | apps/fast misc Mediums: channels/search consolidation; sync-hr team select; chat/users + orbit/templates pagination | Various | Medium |

**Defensive `.limit()` defenders (Low — bundle into one PR):**
- apps/portal-api/src/routes/apps.ts:70
- apps/portal-api/src/services/manifests-internal.ts:246 (`loadAllManifests`)
- apps/heroes-api/src/repositories/settings.ts:10 (`getAllSettings`)

### Phase 2 — Migrations + index-dependent (gated by Phase 1) — 7 tasks

| ID | File | Rule | Severity | Depends on |
|---|---|---|---|---|
| T2.1 | `pg_trgm` extension + GIN indexes on heroes-shared + fast search columns | Non-sargable | High | — |
| T2.2 | apps/portal-api/src/db/schema: add `idx_identity_users_status`, `idx_teams_name_lower` (functional) | Un-indexed | High | — |
| T2.3 | apps/fast/prisma/schema.prisma: `@@index` on `Task.requesterName`, `Task.completedBy`, `TaskReview.reviewerType` | Un-indexed | High | — |
| T2.4 | apps/portal-api/src/services/employee-info-sync.ts:227 → `eq(lower(teams.name), …)` | Non-sargable | High | T2.2 |
| T2.5 | apps/portal-api/src/services/aliases.ts:172 → trigram similarity, drop JS Levenshtein | Row over-fetch + Non-sargable | High | T2.1 |
| T2.6 | apps/fast/app/api/search/route.ts:51 → `taskToken: { startsWith: q }` | Non-sargable | High | — |
| T2.7 | Verification pass: rerun audit, confirm all ilike sites now have GIN coverage | Audit gate | — | T2.1, T2.3 |

### Out of scope (explicitly)

- Schema renames, column drops, table partitioning.
- New observability tooling (this spec doesn't add APM or query-tracing).
- Automating the audit itself — that's a separate spec.
- Frontend changes (no `apps/portal-web`, `apps/heroes-web`, `apps/fast/components` work).

### Execution order

1. **All of Phase 1 first.** Tasks within Phase 1 are independent and parallelizable across PRs. Recommended grouping: one PR per task ID. Land Critical N+1s before High pagination, only for review-load reasons; mechanically they don't depend on each other.
2. **Phase 2 begins only after Phase 1 is fully merged.** Migrations land in the order T2.1 → T2.2 → T2.3 (independent of each other), then the code switches T2.4, T2.5, T2.6 that depend on those indexes.
3. **T2.7 is the gate.** Re-run the audit; the spec is complete when it produces zero findings against the changed files.
