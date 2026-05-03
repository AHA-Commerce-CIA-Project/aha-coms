# Rev 3 — Spec 06: Dual-Email Auth (Workspace + Personal)

> **Status: SHIPPED end-to-end (PRs A → F) on 2026-05-03.** Heroes-side rev3 adoption unblocked.
>
> Priority: **Critical-path. Must land before Heroes-side rev3 implementation begins.**
>
> Drafted: 2026-04-30. Owner: Mr. Door (solo).
>
> **Implementation status:**
> - **PR A — shipped 2026-04-30** at commit `049008d`. Foundation: `identity_user_emails` (multi-row), `identity_user_emails_history` (DELETE-trigger tombstone), `auth_sessions` (portal-native opaque-UUID cookie). Session vehicle pivoted off GIP-managed cookie; GIP narrows to OIDC verifier role. Bootstrap-admin seed script wired into deploy. `coms-shared` bumped to v1.5.0 with additive `emails: UserEmailEntry[]` on user-provisioning/update payloads.
> - **PR B1 — shipped 2026-05-01** at commit `6938553`. Code-only half of OTP infrastructure: schema (`otp_codes`, `otp_request_log`, `one_time_login_links` — migration `0030_famous_pretty_boy`), three-mode mail service (`stdout|brevo|memory` with hard-fail-in-prod guard on stdout, lazy Brevo SDK import), `services/otp.ts` with `requestOtp`/`verifyOtp` discriminated-union outcomes, routes `POST /api/auth/otp/{request,verify}` + `POST /api/internal/cleanup/otp` (OIDC-protected), Terraform Cloud Scheduler job at 03:17 UTC, `parseDeviceLabel` exported from `services/sessions.ts`. 363 tests pass; no Brevo wiring yet.
> - **PR B2 — shipped 2026-05-01** at primary commit `ac2f905`; full curl smoke-test green (request → email arrived from `handers.the@ahacommerce.net` to personal inbox → verify → 200 with opaque-UUID `__session` cookie matching the new `auth_sessions` row). Brevo SaaS wiring: one Secret Manager entry (`coms-portal-brevo-api-key`, populated manually via `gcloud`), `BREVO_FROM` as plain Cloud Run env from `var.brevo_from`, `MAIL_TRANSPORT` + `BREVO_FROM` driven by GitHub Actions repo vars passed as `-var=` flags in `deploy.yml`, dynamic env block on `BREVO_API_KEY` so Phase 1 (transport=stdout, secret unpopulated) still applies cleanly, boot-time guard in `mail/index.ts` for misconfigured Brevo. Deviates from this spec's earlier "three secrets" wording — `BREVO_REPLY_TO` deferred until DNS lands; FROM is config, not a secret. See updated §Email infrastructure.
>
>   **Unblock fixups landed alongside B2 (each on `main`):** `e947778` bumped `infra/main.tf` google provider `~> 6.0` → `~> 7.0` (lock had drifted to 7.30.0 in a prior session and CI uses `-lockfile=readonly`); `cdd4578` populated cross-platform hashes in `.terraform.lock.hcl` after the local `tofu init -upgrade` only wrote darwin shapes; `a284ef8` added `roles/cloudscheduler.admin` for the GitHub Actions WIF SA — PR B1 had added `cloud-scheduler.tf` but its CI never applied (lock drift), so the missing grant only surfaced when B2 finally got past validate; `0b03bbf` patched `apps/api/scripts/seed-admin.ts` to insert a `kind='personal'` row when the workspace identity already exists and `BOOTSTRAP_ADMIN_PERSONAL_EMAIL` is configured (the original idempotency check returned early before reaching the personal-email branch).
> - **PR C — shipped 2026-05-01** at primary commit `df1c90c` with build fixup `6f96634`. Login surfaces rewritten: `apps/web/src/routes/login/+page.svelte` is now a 3-step component (`step = 'choose' | 'email' | 'otp'`) keeping the existing card chrome (StarField, glow, fade-in, AHA logo). Choose step shows two stacked equal-weight buttons — Continue with Google + Sign in with email; the old Firebase email+password form is gone, and `/forgot-password` is deleted (Firebase password identities are off-mission post-Q1-session). Email step has back-button, HTML5 email input (trim-before-submit, no regex/MX), Send-code button. OTP step uses a single 6-digit `<input inputmode="numeric" autocomplete="one-time-code" pattern="\d{6}" maxLength=6>` with letter-spacing/tabular-nums, strip-non-digits-live, auto-submit at length 6. Hybrid resend countdown: 60s frontend timer + backend `Retry-After` authoritative. WRONG_LOGIN_PATH renders inline with a Switch-to-Google CTA (Q-mismatch UX). INVALID_OR_EXPIRED swaps message at `attemptsRemaining=0`; INACTIVE_USER disables verify and resend. Single shared `loading` flag; `completeLogin()` helper unifies post-auth handoff for Google and OTP paths. New `apps/web/src/routes/login/+page.server.ts` redirects already-authed visitors via same-origin `fetch('/api/auth/me')` + `redirect(303, ?redirect ?? '/')`. Typed `requestOtp`/`verifyOtp` wrappers in `apps/web/src/lib/auth.ts` use plain `fetch` (Eden treaty's tagged-union narrowing of the `Retry-After` header was awkward) returning discriminated unions `sent|wrong_login_path|rate_limited|network_error` and `verified|invalid_or_expired|inactive_user|network_error`. **Build fixup `6f96634`:** initial commit imported `validateSession` from `~/services/auth` directly into `+page.server.ts`, which dragged the drizzle/db chain into a per-route SSR chunk and broke `vite-plugin-sveltekit-compile.writeBundle` under bun-rollup with `TypeError: undefined is not an object (evaluating 'raw.includes')`. Reproduced locally with `docker build --target web-build`, fixed by routing through SvelteKit's same-origin `fetch` instead. Directive added to spec: per-route server modules must not import server services that pull drizzle; use `fetch` to API endpoints or push logic into `hooks.server.ts`. No automated tests (per Q11 testing scope §Login surfaces); 6 of 12 smoke items locally verified, items 2/3/4/5/6/8 flagged owner-side against deployed Cloud Run.
> - **PR D — shipped 2026-05-01** at commit `a684fa9` (six-slice chain `7ace00d → b63c7f8 → 5df8250 → 1b831f3 → 9d3d539 → a684fa9`). Self-service `/api/me/emails` (POST add, POST :id/verify, POST :id/resend, PATCH :id, DELETE :id) backed by `services/me-emails.ts` with privacy-preserving collision (`{error:'EMAIL_IN_USE'}` flat — never reveals owner) and last-verified-email + workspace-kind-forbidden guards. Admin `/v1/employees/:id/emails` (POST/PATCH/DELETE) backed by `services/admin-emails.ts` with collision-reveals-target (`collisionUserId` + `collisionUserName` returned to admin so they can resolve), audit-log entries (`admin_add_email`, `admin_edit_email`, `admin_set_email_primary`, `admin_remove_email`), and `user.updated` fanout per change. OTP gatekeeper widened by a single `template?: 'login' \| 'verify_personal_email'` parameter on `requestOtp` (rather than a forked binding-OTP service); `verify-personal-email.ts` mail template added. `/api/userinfo` carries new `emailId` per row via `getEmailEntriesWithIds()` (webhook `UserEmailEntry` shape stays id-free — admin-managed identifiers don't leak to H-apps). Profile UI rewritten with email-list section + add-personal-email modal (single 6-digit input, auto-submit, hybrid 60s resend countdown, defense-in-depth identity check at verify). Admin user-detail extended with email-list card; orphan personal-email inline-edit (post-PR-A no-op PATCH) sealed; new-employee form's `email` → `workspaceEmail` rename completes the API alignment. Workspace-upgrade button rerouted from defunct `updateEmployee({email})` to dedicated `POST /:id/upgrade-workspace`. CSV import gains optional `Personal Email` column recognition; pre-commit collision query bulk-scans both kinds against `identity_user_emails`; collisions land in `flagged[]` (not `skipped[]`) with `collisionKind: 'email_collision' \| 'name_collision'` discriminator; preview UI links email-collision rows to the colliding user's admin detail page. 70 tests green per-file (otp 17/17, me-emails 16/16, admin-emails 11/11, employee-import 3/3, employee-import-collisions 4/4, userinfo 19/19); `svelte-check` clean. CI run `25219023046` ✓; deploy revision `coms-portal-app-00142-fr8`. Routes split into dedicated `routes/me-emails.ts` to avoid colliding with `userinfo.test.ts`'s authPlugin stub at module load.
> - **PR E — shipped 2026-05-03** at commit `212e103` (single self-merge slice). All three extras delivered: admin sign-out-everywhere (`POST /v1/employees/:id/sign-out-all` writing both per-row revocations and the `session_revocations` cutoff via `revokeAllSessionsForUser`); user-facing active-sessions panel (`GET/DELETE /api/me/sessions` + `POST /api/me/sessions/sign-out-others`, profile UI section with "This device" pill and IP truncation for display privacy); super-admin one-time login link (`POST /v1/employees/:id/login-link` super_admin-gated + `GET /auth/one-time` public consume route, 256-bit token / SHA-256 hash / atomic single-use UPDATE WHERE consumed_at IS NULL / 5-min TTL / mints `admin_bypass` session at 1h TTL / dual audit). **`super_admin` capability gate kept internal:** new `checkSuperAdmin` predicate + `requireSuperAdmin()` middleware in `apps/api/src/middleware/rbac.ts`; external surfaces (RBAC's `requireRole`, session JWT, webhooks, H-apps) continue to collapse super_admin → 'admin' so coms-shared `PORTAL_ROLES` stays `['employee', 'admin']` (no v1.6.0 bump). Web client gating uses a new `capabilities.canIssueOneTimeLoginLinks` flag on `/api/auth/me` computed *before* the collapse — additive, type-stable. **Incidental fix folded in:** the global onError at `apps/api/src/index.ts` was overwriting `throw status(N, body)` from authPlugin's `.derive()` with 500. Extracted to `apps/api/src/middleware/api-error-handler.ts`; predicate keys on Elysia's actual `ElysiaCustomStatusResponse` shape `{ code: number, response: unknown }` (NOT `{ status, response }` as the spec draft guessed — verified by runtime probe). Three new `AuditAction` strings: `admin_sign_out_all`, `one_time_link_issued`, `one_time_link_consumed`. 40 new tests across 5 files (onerror passthrough 7, rbac super_admin predicate 6, employees sign-out-all 5, me-sessions 11, one-time-login-link 11). `bun --filter web run typecheck` clean. CI run `25265594527` ✓; deploy revision live on `coms-portal-app` (asia-southeast2). Admiral red-cell self-review against §11 — all 13 spec requirements verified line-by-line before commit.
> - **PR F — shipped 2026-05-03** (commit `8f13c64` + post-merge follow-up). Initial spec-update sweep landed alongside PR A; the final sweep marked Spec 06 shipped end-to-end and updated spec-01 / spec-03 / spec-03c / heroes-integration-handoff / spec-00 references. Heroes-side rev3 adoption unblocked on F's merge.
>
> Sequencing rule (now complete): portal-side full delivery (PRs A-E) → final spec-update sweep (PR F) → pivot to Heroes-side rev3 implementation per `heroes-integration-handoff.md`.

---

## Problem

The portal today supports **only Google Workspace email login** via OIDC (`apps/api/src/routes/auth.ts:164-165` looks up `identity_users` by `email = decoded.email` against a Google-issued ID token). `identity_users.personal_email` exists as a contact column but is **never consulted during authentication**.

Two real user populations are blocked:

1. **Employees with no Workspace seat** (contractors, casual hires, parts of the org that don't pay for Workspace). They have a row in `identity_users` (created by `employee-info-sync.ts` from the personal-email roster sheet, `hasGoogleWorkspace: false`), but cannot log in.
2. **Workspace employees who want to also access the portal from their personal Gmail / non-Google personal mail** (Yahoo, Outlook, ProtonMail, etc.). No mechanism to bind their personal email or use it for login.

Operational requirements (from owner conversation, 2026-04-30):

- Both populations log in as first-class identities producing the same `portal_sub`.
- Personal-email login must work for **any provider** (rules out Google-account-only OIDC; magic-link or OTP required).
- Workspace users can self-service add/change their personal email post-login (no admin gate after initial workspace-allowlist).
- Allowlist enforcement: only emails (workspace or personal) admin-pre-added to the DB can register/login.
- Portal remains the sole identity provisioner for all H-apps; Heroes etc. continue to see only `portal_sub`.

---

## Scope

**In scope:**
- Multi-row email model on identity (replaces single `identity_users.email` column).
- New OTP-based auth pipeline for the personal-email path.
- Outbound email infrastructure (Brevo).
- Login UI with two paths (Workspace OIDC + email-then-OTP).
- Profile UI for self-service email management.
- Admin UI extensions for create / view / collision-resolve.
- CSV import extensions for personal-email column and email-collision flagging.
- Wire-format additive changes to OIDC claims, `/api/userinfo`, and webhook payloads.
- Admin tooling: find-by-email search, sign-out-everywhere, OTP-bypass / one-time login link.
- User-facing active-sessions panel.

**Out of scope (deferred):**
- Email-history viewer UI (data captured in `identity_user_emails_history`; no UI in v1).
- Magic-link auth path (rejected in favor of OTP; see §Decisions Q1).
- Multi-IdP federation (Microsoft/Apple/Yahoo OIDC).
- "Recovery email" or arbitrary additional email kinds beyond workspace/personal.
- Heroes-side rev3 changes (covered by `heroes-integration-handoff.md`, executed AFTER this spec ships and the spec-update sweep lands).

---

## Decisions log (all locked)

| # | Question | Decision | Reason |
|---|---|---|---|
| Q1 | Auth mechanism for personal email | **OTP code** (6-digit numeric) | Familiarity (banking/e-wallet muscle memory in ID); robust to corporate-mail-gateway link-pre-fetching; cleaner cross-device flow; smaller phishing-training surface. |
| Q2 | Schema shape | **Multi-row `identity_user_emails`** table; `identity_users.email` and `identity_users.personal_email` removed | Cross-column uniqueness "free" via single UNIQUE; per-email verification metadata natural; supports "no workspace email" without nullable hack; consistent with spec-03's multi-row alias precedent. |
| Q3 | Email-sending provider | **Brevo** (free tier 300/day, no expiration) | Workspace SMTP relay path A1 blocked (owner has no Gmail Settings admin privilege). Resend's 100/day cap brushes projected steady-state volume; Brevo's 300/day gives 3× headroom on free tier. |
| Q3-DNS | DNS access for `ahacommerce.net` | Owner has none; will arrange with domain owner before production. **Dev posture:** single-sender verification (Brevo emails a click-link to a personal address; no DNS needed). Production swap is a one-line `BREVO_FROM` config change. | Allows implementation to proceed without blocking on external DNS coordination. |
| Q4a | Admin user-create form fields | Both-fields-optional; **at least one of (workspace, personal) required** | Real HR data often has both; no need to artificially block known data; preserves self-service path. |
| Q4b | Admin-entered personal email verification | **Trusted on entry** (`verifiedAt = NOW()`, `addedBy='admin'`) | Owner accepts typo risk in exchange for faster admin operation. Self-service additions still go through OTP verify. |
| Q4c | Admin-entered workspace email verification | **Trusted on entry** | Workspace domain is org-controlled; Google OIDC catches impostor logins regardless. CSV import is the primary admin entry path; single-user form is secondary. |
| Q5a | Email collision at insert | **Reject.** Admin form: error reveals collision target user. CSV: row marked `flagged` in import preview (existing pattern). Self-service: privacy-preserving error ("contact admin") — does not reveal the colliding user. | Matches existing `employee-import.ts` flagged-row convention; preserves user privacy in self-service. |
| Q5b | Email change/removal | **Hard-delete + tombstone** in `identity_user_emails_history` | Allows legitimate reuse (employee leaves, replacement happens to share an email); preserves forensic trail; keeps live table clean (no `WHERE deletedAt IS NULL` everywhere). |
| Q5c | Identity deactivation | **Emails stay on row, marked-inactive transitively.** Admin can manually free for reuse. | Consistent with spec-03 soft-delete semantics on identity. Avoids reuse-confusion in audit/webhook replay. |
| Q6a | Session identity across paths | **Identical sessions** regardless of auth path. `authMethod` recorded server-side but not in OIDC claims to H-apps. | One identity, one downstream view. Step-up auth (if ever needed) belongs in a separate concept, not blended here. |
| Q6b | Concurrent sessions across paths/devices | **Both alive concurrently** | Matches today's behavior; "latest wins" is a surprising UX for no benefit. |
| Q6c | Sign-out scope | **Current session by default;** explicit "sign out everywhere" as separate action | Universal default; explicit escape hatch for compromised-credentials case. |
| Q6d | Admin deactivation | **All sessions revoked immediately** via `session_revocations` (table already exists from spec-03) | Matches spec-03; cost of "allow until TTL" is real (departed employee retains access). |
| Q6e | Auth method visible to admin | **Yes** on user-detail page | Cheap; audit value (e.g., 03:00 personal-OTP login is a meaningful signal). Not exposed to user or H-apps. |
| Q7a-i | OTP service mechanics | 6-digit numeric, 10-min TTL, single-use, max 5 attempts, 60s per-email cooldown, 30/hr per-IP cap, same-response-for-unknown-email, SHA-256 hashed at rest, TTL + active-invalidate-on-new-request + nightly cleanup cron | See §OTP service for full table; defaults chosen to match Indonesian banking/e-wallet OTP norms while staying brute-force-resistant. |
| Q8a | OIDC `email` claim derivation | **Workspace if present, else personal.** Deterministic per identity; flips only on admin add/remove of workspace email. | Stable for caching; avoids ambiguous "primary" semantic; aligns with HR/operational reality (workspace email is the "official" one). |
| Q8b | `/api/userinfo` response shape | **Both:** scalar `email` (per Q8a) + `emails: [{address, kind, isPrimary, verified}]` array | Scalar covers 95% of consumers; array unlocks "show me all my login methods" UI. Additive, non-breaking. |
| Q8c | `user.created` / `user.updated` webhook payload | **Same scalar `email`** + new `emails` array (additive) | Backwards-compatible with existing Heroes consumer. Same versioning pattern as `coms-shared` v1.4.0's `appConfig` field. |
| Q8d | New email-lifecycle event types | **No.** Email changes ride on `user.updated` | Email changes are rare; 4 new event types for low-frequency change is over-instrumentation. Consumers already handle `user.updated` idempotently. |
| Q8e | Heroes projection of emails | **Primary email only** (per Q8a precedence) | Heroes UX surfaces one email; "manage all" lives on portal profile page. Smaller projection footprint. |
| Q9 | UI scope v1 | Surfaces 1-7, 9, 10, 11 (defer #8 email-history viewer) | See §UI surfaces. |
| Q10a | Feature flag for personal-email path | **No flag.** Revert is the rollback tool. | OTP service has its own kill-switch (yank API key). Avoids one-more-thing-to-flip. |
| Q10b | Staging dry-run | **No.** Land on prod directly, per-PR. | Portal currently has no staging; introducing one for this single feature is over-investment. Symmetric with Heroes-side hybrid plan. |
| Q10c | Spec-update timing | **After E, before Heroes-side work starts** | Matches owner's stated sequencing directive. |
| Q1-session | Session vehicle | **Portal-native `auth_sessions` table; opaque-UUID cookie. GIP narrows to OIDC verifier (`verifyIdToken` only).** Replaces the existing GIP-encrypted-JWT session cookie. | Future auth methods (passkeys, magic-link, federation) become single-helper calls instead of GIP custom-token bridges. One revocation mechanism. No phantom GIP users for OTP-only employees. Cost concentrated in PR A; every future PR simpler. |
| Q-claims | GIP custom-claim sync (`resolveAndSyncClaims` → `setCustomUserClaims`) | **Drop entirely.** Portal owns claims; `resolveAuthUser` already recomputes from DB per-request (`middleware/auth.ts:42-67`); GIP-side claims have no consumer post-Q1-session. Keep `gipUid` as a nullable audit-link column — cheap, useful for forensics. | Verified dead code today (`apps/api/src/middleware/auth.ts:42` comment confirms claims-from-DB-per-request). Each login currently pays a network round-trip to GIP for nothing. Removing eliminates portal-DB ↔ GIP-claims drift surface and gives all auth methods (Workspace, OTP, future) equal claim-resolution semantics. |
| Q-mismatch | Workspace OIDC against an email registered as `kind='personal'` | **Strict-but-helpful 403.** Lookup ignores `kind`; if the row's kind is `personal`, return 403 with hint `"This email is registered for code-based sign-in only. Use the email & verification code option."` and structured `error: 'WRONG_LOGIN_PATH'` for the front-end. Does not reveal which identity the email belongs to. | Avoids silent 403 confusion when a user accidentally tries the wrong button; preserves privacy because the response is identical to a generic "contact admin" 403 from anyone else's perspective (the user already proved they own the email via Google). |
| Q-bootstrap | First-admin / disaster-recovery provisioning | **Decoupled seed script** at `apps/api/scripts/seed-admin.ts`. Reads `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_NAME` from env; idempotently UPSERTs an `identity_users` row + `kind='workspace'` `identity_user_emails` row with `addedBy='bootstrap'`, `verifiedAt=NOW()`, `isPrimary=true`, `portalRole='super_admin'`. Runs separately from migrations (`bun run db:seed-admin`); also wired as a post-migrate step in deploy. Backfill in PR A still carries existing rows; seed script is the "fresh DB / recovery" path. | Industry standard (Django `createsuperuser`, Sentry/Grafana env-var auto-promote). Keeps schema migrations free of personal emails. Always-a-way-back-in invariant. |
| Q-lifecycle | Per-request session-row writes (`lastSeenAt`) | **None.** `auth_sessions` carries `createdAt` only; no `lastSeenAt`, no `lastSeenIp`. Active-sessions panel shows "Started X ago." | User explicitly does not care about "last active" UX (2026-04-30). Avoids per-request DB writes; keeps `validateSession` to a single indexed read. |
| Q-ttl | Session TTL by `authMethod` | **Differentiated: workspace_oidc 14d, personal_otp 14d, admin_bypass 1h.** Implemented as const map in `createPortalSession`. | Workspace and OTP are equivalent trust levels post-verification — both get the 14d default. Admin-bypass is literally a support hand-off tool; a 14d session born from "support handoff" lingering is an incident risk; 1h forces the user to log in normally for durable access. |
| Q-logout | Sign-out semantics across surfaces (current, other-device, all-other, admin-everywhere, deactivation) | **Matrix locked**, see "Sign-out matrix" section. Per-row UPDATE for surgical actions; per-row UPDATE + `session_revocations` cutoff for admin/deactivation broad actions. | Cheap-cutoff via `session_revocations` keeps `validateSession` fast for fanout cases; per-row UPDATE keeps the active-sessions panel display truthful after re-login. |
| Q-soak | Column-drop strategy for old `identity_users.email` / `personal_email` | **One-shot in PR A migration.** Steps 1-5 run together; rollback past the column drop requires restore-from-backup. | Cleanest end state. Solo-dev / prod-direct posture accepts the backup-restore as the rollback path; soak windows leaking dead columns indefinitely is the bigger long-term cost. |

---

## Schema

### `identity_users` — column changes

```diff
 export const identityUsers = pgTable('identity_users', {
   id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
   gipUid: text('gip_uid').unique(),
-  email: varchar('email', { length: 255 }).notNull().unique(),
   name: varchar('name', { length: 255 }).notNull(),
   phone: varchar('phone', { length: 20 }),
   department: varchar('department', { length: 100 }),
   position: varchar('position', { length: 100 }),
   branch: varchar('branch', { length: 50 }),
   portalRole: varchar('portal_role', { length: 20 }).notNull().default('employee'),
-  personalEmail: varchar('personal_email', { length: 255 }),
   birthDate: varchar('birth_date', { length: 10 }),
   leaderName: varchar('leader_name', { length: 255 }),
   hasGoogleWorkspace: boolean('has_google_workspace').notNull().default(false),
   source: varchar('source', { length: 20 }).notNull().default('manual'),
   status: varchar('status', { length: 20 }).notNull().default('active'),
   provisioningStatus: varchar('provisioning_status', { length: 20 }).notNull().default('ready'),
   provisioningError: text('provisioning_error'),
   createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
   updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
 })
```

`hasGoogleWorkspace` stays — it's still meaningful as a row-level flag for filters/reports. The column does NOT gate any auth path; presence/absence of a `kind='workspace'` row in `identity_user_emails` is the auth-path source of truth.

### `identity_user_emails` — new

```ts
export const IDENTITY_USER_EMAIL_KINDS = ['workspace', 'personal'] as const
export type IdentityUserEmailKind = (typeof IDENTITY_USER_EMAIL_KINDS)[number]

export const IDENTITY_USER_EMAIL_ADDED_BY = ['admin', 'self', 'csv_import', 'sheet_sync', 'backfill'] as const
export type IdentityUserEmailAddedBy = (typeof IDENTITY_USER_EMAIL_ADDED_BY)[number]

export const identityUserEmails = pgTable(
  'identity_user_emails',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    identityUserId: uuid('identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
      // Lowercased, whitespace-trimmed. Postgres GENERATED ALWAYS AS column in prod,
      // plain varchar in TS schema (matches user_aliases pattern from spec-03).
    kind: varchar('kind', { length: 20 }).notNull(),
      // 'workspace' | 'personal'
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
      // NULL until verified. Set on:
      //   - Insert when added by admin (per Q4b/c trust-admin)
      //   - First successful auth via this email (workspace OIDC or personal OTP)
    addedBy: varchar('added_by', { length: 20 }).notNull(),
      // 'admin' | 'self' | 'csv_import' | 'sheet_sync' | 'backfill'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('identity_user_emails_normalized_uniq').on(t.emailNormalized),
    uniqueIndex('identity_user_emails_one_primary_per_user_uniq')
      .on(t.identityUserId)
      .where(sql`${t.isPrimary} = true`),
    index('identity_user_emails_identity_user_id_idx').on(t.identityUserId),
    index('identity_user_emails_kind_idx').on(t.kind),
  ],
)
```

Constraints:
- One row per (identity, email) pair; no duplicate addresses anywhere across the live table (`uniqueIndex` on `email_normalized`).
- Exactly one `isPrimary=true` row per identity (partial unique index).
- `kind` constrained to `'workspace' | 'personal'` via app-level check (or CHECK constraint in migration).

### `identity_user_emails_history` — new (tombstone trail per Q5b)

```ts
export const identityUserEmailsHistory = pgTable(
  'identity_user_emails_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    formerIdentityUserId: uuid('former_identity_user_id').notNull(),
      // No FK; identity may be deactivated/deleted later. Audit-only.
    email: varchar('email', { length: 255 }).notNull(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    addedBy: varchar('added_by', { length: 20 }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }).notNull().defaultNow(),
    removedBy: uuid('removed_by').references(() => identityUsers.id),
      // The admin or user who removed it. NULL if removed by system (e.g., cascade).
    removedReason: varchar('removed_reason', { length: 50 }).notNull(),
      // 'admin_action' | 'self_service' | 'collision_resolve' | 'cascade_deactivate' | 'replaced'
  },
  (t) => [
    index('identity_user_emails_history_email_idx').on(t.emailNormalized),
    index('identity_user_emails_history_former_user_idx').on(t.formerIdentityUserId),
  ],
)
```

Population: trigger on DELETE from `identity_user_emails` writes a row to `_history`. Implemented in the same migration as the table creation. Migration `.sql` body needs hand-edit for the trigger (CLAUDE.md escape hatch — use `drizzle-kit generate` for the journal entry, then replace the SQL body).

### `otp_codes` — new (Q7 OTP service)

```ts
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),  // SHA-256 hex
    attemptsRemaining: integer('attempts_remaining').notNull().default(5),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
      // Set when superseded by a new code request for the same email.
    requestIp: varchar('request_ip', { length: 45 }),  // IPv6-safe length
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('otp_codes_email_idx').on(t.emailNormalized),
    index('otp_codes_expires_idx').on(t.expiresAt),
  ],
)
```

Notes:
- No FK to `identity_user_emails` — codes can be issued to unknown emails (Q7g enumeration-resistance returns the same response). Rate limits prevent abuse.
- `consumedAt`, `invalidatedAt` non-null mark the row as no-longer-usable; cleanup cron deletes after 7 days for audit visibility.

### `otp_request_log` — new (rate-limit support, Q7e/f)

```ts
export const otpRequestLog = pgTable(
  'otp_request_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    emailNormalized: varchar('email_normalized', { length: 255 }),  // null = unknown email path
    requestIp: varchar('request_ip', { length: 45 }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: varchar('outcome', { length: 20 }).notNull(),
      // 'sent' | 'rate_limited_email' | 'rate_limited_ip' | 'unknown_email' | 'wrong_login_path'
  },
  (t) => [
    index('otp_request_log_email_time_idx').on(t.emailNormalized, t.requestedAt),
    index('otp_request_log_ip_time_idx').on(t.requestIp, t.requestedAt),
  ],
)
```

Cleanup cron prunes rows older than 24h.

### `auth_sessions` — new (portal-native session model)

**Architectural note (Q1, locked 2026-04-30):** The portal moves off GIP-issued session cookies as the *vehicle* for portal sessions. GIP narrows to the role of OIDC verifier for Google Workspace ID tokens (`verifyIdToken` in `apps/api/src/gip-admin.ts` stays). Portal sessions become a portal-owned table with an opaque-UUID cookie. Three reasons:

1. Each future auth method (OTP today; passkeys, magic-link, federation later) becomes one helper call (`createPortalSession(...)`) instead of a `createCustomToken` → client-exchange → `verifyIdToken` round-trip through GIP.
2. OTP-only employees (no Workspace seat) no longer require a phantom GIP user lazy-created on first login.
3. One revocation mechanism (`auth_sessions.revokedAt` per-row + `session_revocations` cutoff for fanout) replaces the GIP-cookie + revocation-cutoff pair. Per-session sign-out becomes truthful.

Cost: every callsite of `verifySessionCookie` (~10-15 files: middlewares, `/auth/me`, `/userinfo`, broker handoff) migrates to `validateSession(sessionId)` in PR A. Cookie value becomes an opaque random UUID (the `auth_sessions.id`); all session state is in the row. The broker `/introspect` endpoint barely changes — it already keys on `userId + sessionIssuedAt`, just reads `auth_sessions` instead of `session_revocations`.

```ts
export const AUTH_METHODS = ['workspace_oidc', 'personal_otp', 'admin_bypass'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

export const SESSION_REVOKED_REASONS = [
  'logout',                  // user clicked "sign out" (current session)
  'logout_other_device',     // user clicked "sign out" on a row in active-sessions panel
  'logout_all_other',        // user clicked "sign out all other devices"
  'admin_revoke',            // admin clicked "sign out all sessions" on user-detail
  'status_change',           // user deactivated / offboarded
  'superseded',              // user re-authed from same device; old row marked superseded
] as const

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
      // Also the opaque value stored in the session cookie. Random UUID — no roll-your-own crypto.
    identityUserId: uuid('identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    authMethod: varchar('auth_method', { length: 20 }).notNull(),
      // 'workspace_oidc' | 'personal_otp' | 'admin_bypass'
    emailUsed: varchar('email_used', { length: 255 }),
      // The specific email (workspace or personal) used to authenticate this session.
      // Surfaced on admin user-detail (Q6e); never returned to user/H-apps (Q6a).
      // Null for admin_bypass.
    deviceLabel: varchar('device_label', { length: 255 }),
      // From User-Agent at session creation, e.g. "Mac · Safari 18". For active-sessions panel (#10).
    ipAddress: varchar('ip_address', { length: 45 }),
      // IPv6-safe length. Frozen at session creation. Truncated for display in the active-sessions panel.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      // Active-sessions panel shows "Started X ago" using this. No `lastSeenAt` — per Q-lifecycle, we don't pay
      // a per-request DB write for "last active" UX.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
      // TTL is differentiated by authMethod (per Q-ttl):
      //   workspace_oidc → 14 days
      //   personal_otp   → 14 days
      //   admin_bypass   → 1 hour (short-lived; the link is for immediate support hand-off, not durable access)
      // Implemented as a const map in createPortalSession.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
      // Set when this specific session is revoked. Null = active.
    revokedReason: varchar('revoked_reason', { length: 30 }),
  },
  (t) => [
    index('auth_sessions_identity_user_id_idx').on(t.identityUserId),
    index('auth_sessions_active_idx')
      .on(t.identityUserId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
)
```

`session_revocations` is **not** removed. Its role narrows to the cheap wall-clock-cutoff for "sign out everywhere" admin actions: instead of UPDATE-ing N rows, insert one revocation row with `notBefore = NOW()` and have `validateSession` reject any session whose `createdAt < notBefore`. Per-row `revokedAt` and the cutoff coexist; both are checked on every session validation.

### `validateSession` shape (replaces `verifySessionCookie` callsites)

```ts
// apps/api/src/services/sessions.ts
export async function validateSession(sessionId: string): Promise<SessionUser | null> {
  // 1. Sanity-check sessionId is a UUID; bail to null if not (avoids DB query on stale/garbage cookies).
  // 2. Look up the row (single indexed PK lookup).
  // 3. Reject if revokedAt IS NOT NULL or expiresAt < now() or sessionRevocations cutoff.
  // 4. Return resolved SessionUser (joined with identity_users + claims). No lastSeenAt write per Q-lifecycle.
}

export async function createPortalSession(args: {
  identityUserId: string
  authMethod: AuthMethod
  emailUsed: string | null
  request: Request          // for UA + IP extraction
}): Promise<{ sessionId: string; expiresAt: Date }> {
  // Inserts auth_sessions row, returns the id (= cookie value).
}

export async function revokeSession(sessionId: string, reason: SessionRevokedReason): Promise<void>
  // Single-row UPDATE auth_sessions SET revokedAt=now(), revokedReason=$reason. Used by
  // current-session logout, "sign out this other device", and admin actions per-row UPDATE.

export async function revokeAllSessionsForUser(args: {
  userId: string
  reason: SessionRevokedReason
  exceptSessionId?: string  // current session for "sign out all other devices"
}): Promise<void>
  // Bulk: UPDATE auth_sessions SET revokedAt=now(), revokedReason=$reason
  //          WHERE identityUserId=$userId AND revokedAt IS NULL
  //            AND (exceptSessionId IS NULL OR id != exceptSessionId).
  // For admin-initiated cases (admin_revoke, status_change), ALSO insert a session_revocations
  // cutoff row so validateSession short-circuits without scanning auth_sessions.

export async function insertSessionCutoff(userId: string, reason: SessionRevokedReason): Promise<void>
  // Wrapper around session_revocations insert; used internally by revokeAllSessionsForUser
  // for admin paths, exposed for direct use in deactivation flows.
```

### Sign-out matrix (Q-logout, locked 2026-04-30)

| Action | Trigger | DB writes | Cookie |
|---|---|---|---|
| A. Current-session logout | Top-bar "Sign out" / `POST /api/auth/logout` | `revokeSession($currentSessionId, 'logout')` | Cleared |
| B. Sign out one specific other device | Profile #10 panel, per-row "Sign out" | `revokeSession($rowId, 'logout_other_device')` (gated by `identityUserId = $self` to prevent cross-user revoke) | No change |
| C. Sign out all other devices | Profile #10 panel, "Sign out all other devices" | `revokeAllSessionsForUser({userId: $self, reason: 'logout_all_other', exceptSessionId: $currentSessionId})` — per-row UPDATE only, no cutoff insert | No change |
| D. Admin sign-out-everywhere | Admin #9 "Sign out all sessions" on user-detail | Both: per-row UPDATE (`reason: 'admin_revoke'`) AND `session_revocations` cutoff insert. The cutoff is the cheap fast-path for `validateSession`; the per-row UPDATE keeps the target user's active-sessions panel display correct after they re-login. | N/A |
| E. User deactivation | Admin "Deactivate user" | Same as D + `UPDATE identity_users SET status='inactive'`. | N/A |

### `one_time_login_links` — new (#11 admin OTP-bypass)

```ts
export const ONE_TIME_LOGIN_LINK_REASONS = [
  'lost_email_access',
  'support_handoff',
  'identity_recovery',
  'other',
] as const

export const oneTimeLoginLinks = pgTable(
  'one_time_login_links',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    targetIdentityUserId: uuid('target_identity_user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    issuedBy: uuid('issued_by')
      .notNull()
      .references(() => identityUsers.id),
      // Must be a super_admin per access-control rule below.
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),  // SHA-256 of the URL token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
      // 5-minute TTL.
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    reason: varchar('reason', { length: 32 }).notNull(),
    reasonText: text('reason_text'),
      // Free-text justification from the issuing admin.
    issuedFromIp: varchar('issued_from_ip', { length: 45 }),
    consumedFromIp: varchar('consumed_from_ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('one_time_login_links_token_hash_uniq').on(t.tokenHash),
    index('one_time_login_links_target_idx').on(t.targetIdentityUserId),
    index('one_time_login_links_issued_by_idx').on(t.issuedBy),
  ],
)
```

Access control:
- Restricted to `portalRole='super_admin'`. (Today `portal_role` defaults to `'employee'`; super_admin is a privileged subset of admin. Verify the role enum in `apps/api/src/db/schema/identity-users.ts` and routes — extend if needed.)
- Every issuance writes an `access_audit_log` row (`actor_id`, `target_id`, `action='one_time_link_issued'`, full reason).
- Every consumption writes another audit row (`action='one_time_link_consumed'`).

---

## Auth flows

### Workspace OIDC path

1. User clicks "Sign in with Google" on portal login page.
2. GIP redirect → token returned to portal.
3. Portal validates token via `verifyIdToken` (GIP narrowed to OIDC-verifier role per Q1-session), extracts `decoded.email`.
4. Portal looks up `identity_user_emails WHERE email_normalized = lower(trim(decoded.email)) LIMIT 1` (no `kind` filter at this stage — see Q-mismatch below).
5. **Branch on result:**
   - **No match:** 403 with `{ message: "Access denied. Contact your administrator." }` (matches today's pre-provisioned-only behavior).
   - **Match with `kind='workspace'`:** continue. If `verifiedAt IS NULL`, set it now (first successful login auto-verifies workspace email per Q4c). Resolve `identityUserId`; if `identity_users.status != 'active'`, 403. Mint session: `createPortalSession({identityUserId, authMethod: 'workspace_oidc', emailUsed: decoded.email, ...})`.
   - **Match with `kind='personal'`** (Q-mismatch): 403 with `{ message: "This email is registered for code-based sign-in only. Use the email & verification code option on the sign-in screen." }`. Strict-but-helpful — the user clearly owns the email (Google verified it just now) but the portal binding is for the OTP path, not Google OIDC. Does not reveal whose identity the email is attached to.
6. Sign-in screen front-end should also receive a structured error code (e.g. `error: 'WRONG_LOGIN_PATH'`) so it can surface a "Switch to email code" CTA without parsing message text.

### Personal-email OTP path (new)

#### Request OTP (`POST /api/auth/otp/request`)

Body: `{ email: string }`

1. Normalize: `emailNormalized = lower(trim(email))`.
2. Rate-limit checks against `otp_request_log`:
   - Count rows for this `emailNormalized` in last 60 seconds. If ≥1, return 429 with `Retry-After: 60`.
   - Count rows for this `requestIp` in last 60 minutes. If ≥30, return 429.
3. Look up `identity_user_emails WHERE email_normalized = $1 LIMIT 1` (no `kind` or `verified_at` filter — see branch logic).
4. **Branch on result:**
   - **Match with `kind='personal'`:**
     - Generate 6-digit numeric code: `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`.
     - Hash: `sha256(code).hex()`.
     - Invalidate any prior live row for this `emailNormalized`: `UPDATE otp_codes SET invalidated_at = now() WHERE email_normalized = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()`.
     - Insert new `otp_codes` row: `{emailNormalized, codeHash, expiresAt = now() + 10 minutes, attemptsRemaining = 5, requestIp}`.
     - Send email via Brevo: subject "Your COMS portal sign-in code", body containing the code and a "did not request? ignore" line. Template lives in `apps/api/src/services/mail/templates/otp.ts`.
     - Log to `otp_request_log` with `outcome='sent'`.
     - Note: `verified_at` is NOT filtered. An unverified personal email still receives a login OTP; first successful verify auto-sets `verifiedAt = NOW()` (symmetric with Workspace OIDC's first-login auto-verify per Q4c). This is the only path back in for a user whose self-service binding never confirmed.
   - **Match with `kind='workspace'`** (user typed their workspace email at the OTP screen):
     - Return 200 with `{ error: 'WRONG_LOGIN_PATH', message: 'This email is for Google sign-in. Use the "Sign in with Google" button.' }`.
     - Do NOT send code. Log to `otp_request_log` with `outcome='wrong_login_path'` (extend the outcome enum). Symmetric with Q-mismatch for the Workspace path.
   - **No match:**
     - Log to `otp_request_log` with `outcome='unknown_email'`. Do NOT send email.
     - Return 200 with `{ message: "If this email is registered, you'll receive a code shortly. The code is valid for 10 minutes." }` — same shape as the success path. Q7g enumeration resistance.
5. The `outcome` enum on `otp_request_log` becomes: `'sent' | 'rate_limited_email' | 'rate_limited_ip' | 'unknown_email' | 'wrong_login_path'`.

#### Verify OTP (`POST /api/auth/otp/verify`)

Body: `{ email: string, code: string }`

1. Normalize email.
2. Find `otp_codes WHERE email_normalized = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`.
3. If none: return 400 `{ error: 'INVALID_OR_EXPIRED' }`.
4. Compare `sha256(code).hex()` against `codeHash` in constant time.
5. If mismatch:
   - Decrement `attempts_remaining`. If now zero, set `invalidated_at = now()`.
   - Return 400 `{ error: 'INVALID_OR_EXPIRED', attemptsRemaining }`.
6. If match:
   - Set `consumed_at = now()`.
   - Look up `identity_user_emails` row for this email; resolve `identityUserId`.
   - If `identity_users.status != 'active'`: 403 (deactivated user).
   - If `verifiedAt IS NULL` on the email row: set it to `now()` (auto-verify on first successful auth — relevant only if admin entry was somehow not pre-verified).
   - Create session: `auth_sessions` row with `authMethod='personal_otp'`, `emailUsed=email`, `deviceLabel=parseUserAgent(headers['user-agent'])`.
   - Return 200 with session cookie set.

### Self-service personal-email binding (existing-user flow)

Authenticated user (any auth method) wants to add or change their personal email.

#### Initiate (`POST /api/me/emails`)

Body: `{ email: string }`

1. Normalize.
2. Validate: not empty, RFC 5322 shape, MX record check (optional, skip in v1).
3. Collision check: `identity_user_emails WHERE email_normalized = $1` — if any row exists (any user), return 409 `{ error: 'EMAIL_IN_USE' }` with privacy-preserving message (Q5a #3).
4. Insert: `identity_user_emails {identityUserId = currentUser.id, email, kind='personal', isPrimary = false, verifiedAt = NULL, addedBy='self'}`.
5. Issue OTP for `identity_user_emails.id` (different code-table flow — verification code, not a login OTP). Reuse `otp_codes` table with same shape; the consumer endpoint (next step) sets `verifiedAt` on success rather than minting a session.
6. Send verification email via Brevo.
7. Return 202.

#### Confirm (`POST /api/me/emails/:emailId/verify`)

Body: `{ code: string }`

1. Find OTP for the email; same hash-compare + attempts-tracking as login.
2. If match: set `identity_user_emails.verified_at = now()`. Fire `user.updated` webhook (per Q8c — additive `emails` array updated).
3. Return 200.

### Admin OTP-bypass / one-time login link (#11)

Super admin issues a one-time login link for a user who lost email access.

#### Issue (`POST /api/admin/users/:id/login-link`)

Auth: super_admin only. Body: `{ reason: string, reasonText?: string }`.

1. Generate token: `crypto.randomBytes(32).toString('base64url')`.
2. Hash + insert `one_time_login_links` row with `expires_at = now() + 5 minutes`.
3. Audit-log entry.
4. Return `{ url: '${PORTAL_ORIGIN}/auth/one-time?token=…' }` — the issuing admin shows or sends this URL to the user via out-of-band channel (chat, phone). NOT auto-emailed; that defeats the "lost email access" use case.

#### Consume (`GET /auth/one-time?token=…`)

1. Hash incoming token, look up; reject if not found, expired, or already consumed.
2. Set `consumed_at = now()`, `consumed_from_ip = req.ip`.
3. Audit-log entry.
4. Create session: `authMethod='admin_bypass'`, `emailUsed=null`. Set cookie. Redirect to `/`.

---

## Wire format changes

### OIDC ID token `email` claim (Q8a)

Today: `email = identity_users.email` (workspace email, or personal in `hasGoogleWorkspace=false` rows where it was squatted).

After: `email = COALESCE(workspace_email, personal_email)` per identity, where:
- `workspace_email = SELECT email FROM identity_user_emails WHERE identity_user_id = $sub AND kind = 'workspace' LIMIT 1`
- `personal_email = SELECT email FROM identity_user_emails WHERE identity_user_id = $sub AND kind = 'personal' AND is_primary = true LIMIT 1`
  - Falls back to first personal email if no `isPrimary` row exists.

Implementation: a `getDisplayEmail(identityUserId)` helper, called from `apps/api/src/routes/userinfo.ts` and the OIDC token-issuance path.

### `/api/userinfo` response (Q8b)

```json
{
  "sub": "uuid",
  "name": "Carol Surname",
  "email": "carol@ahacommerce.net",
  "emails": [
    {"address": "carol@ahacommerce.net", "kind": "workspace", "isPrimary": true, "verified": true},
    {"address": "carol@gmail.com", "kind": "personal", "isPrimary": false, "verified": true}
  ],
  "portalRole": "employee",
  "apps": [/* unchanged from spec-03 */]
}
```

### Webhook payloads (Q8c)

`user.created` and `user.updated`:

```diff
 {
   "type": "user.created",
   "eventId": "...",
   "occurredAt": "...",
   "user": {
     "sub": "uuid",
     "name": "...",
     "email": "...",
+    "emails": [
+      {"address": "...", "kind": "workspace", "isPrimary": true, "verified": true, "addedBy": "admin"}
+    ],
     "portalRole": "..."
   }
 }
```

Schema additions for `coms-shared`: bump to v1.5.0, add the new `emails` field on `UserProvisionedPayload` and equivalent shape on user-update payloads. Additive — existing consumers continue to compile.

---

## UI surfaces

### #1 Login screen (rewrite)

`apps/web/src/routes/login/+page.svelte` (or wherever the current Sign-in UI lives — verify path):

- Two-step flow: choice screen first.
  - Top: "Sign in with Google" button (existing GIP redirect).
  - Below: "Or sign in with email" → reveals email input + "Send code" button.
- Email input → `POST /api/auth/otp/request` → navigate to OTP-entry screen.

### #2 OTP entry screen

New route `/login/otp` (or modal, design choice):
- Six 1-character inputs (or single 6-char input with auto-tab UX).
- "Resend code" link disabled for 60 seconds after request, then active. Re-enables countdown after each resend.
- "Wrong email? Go back" link.
- On submit → `POST /api/auth/otp/verify` → on success, redirect to `/`.

### #3 Profile email management

`apps/web/src/routes/(authed)/profile/+page.svelte` — extend:
- Section "Email addresses":
  - List of `userinfo.emails` rows with kind badge ("Workspace" / "Personal"), verified-✓ icon, "primary" star.
  - Per-row actions:
    - "Set as primary" (only if not currently primary — calls `PATCH /api/me/emails/:id { isPrimary: true }`).
    - "Remove" (only if not the only login method — never let a user lock themselves out; calls `DELETE /api/me/emails/:id`).
  - "Add personal email" button → modal with email input → `POST /api/me/emails` → modal switches to OTP entry.

Self-service guard: cannot remove an email if it's the only verified email on the identity (would lock user out).

### #4 Admin user-create form (extend existing)

`apps/web/src/routes/(authed)/admin/employees/new/+page.svelte`:
- Replace single `email` field with two fields: "Workspace email" (placeholder `name@ahacommerce.net`) and "Personal email" (placeholder `name@gmail.com`).
- Validation: at least one required.
- On submit, the `createEmployee` service writes one `identity_users` row + 1-2 `identity_user_emails` rows with `addedBy='admin'`, `verifiedAt=NOW()`. The first email entered becomes `isPrimary=true`.

### #5 Admin user-detail (extend existing)

`apps/web/src/routes/(authed)/admin/employees/[id]/+page.svelte`:
- Add "Email addresses" section: list of all `identity_user_emails` rows.
- Per-row admin actions: "Set primary", "Edit" (text input replaces value, calls `PATCH`), "Remove" (with collision check — same hard-delete + tombstone rules as Q5b).
- "Add email" form below the list (kind selector + email input) → `POST /api/admin/users/:id/emails`.
- New "Last login" row: `Tue 2026-04-29 22:42 · personal-OTP · IP 1.2.3.4`. Renders from latest `auth_sessions` row.

### #6 CSV import preview (extend existing)

`apps/api/src/services/employee-import.ts`:
- Recognize new optional column `Personal Email` in the CSV header (alongside existing `Email Address [required]` which becomes the workspace email).
- Extend `EmployeeCsvImportResult.flagged` shape:
  ```ts
  flagged: Array<{
    rowNumber: number
    csvWorkspaceEmail?: string
    csvPersonalEmail?: string
    csvName: string
    // ... existing fields
    collisionEmail?: string  // NEW: which email collided
    collisionUserId?: string // NEW: with whom
    collisionUserName?: string // NEW
  }>
  ```
- Pre-commit query: for every CSV email (workspace + personal), check `identity_user_emails` for collisions; flag affected rows.

### #7 Admin find-by-email search

`apps/web/src/routes/(authed)/admin/employees/+page.svelte` — extend existing search:
- Today the search likely matches `name` and `email` on `identity_users`. Update to query `identity_user_emails.email_normalized` joined to identity rows.
- Search hits both kinds (workspace + personal) with kind badge in the result row.

### #9 Admin "sign out everywhere"

On admin user-detail (#5):
- Button "Sign out all sessions" (alongside "Deactivate user", but distinct action).
- Calls `POST /api/admin/users/:id/sign-out-all` which inserts a `session_revocations` row.
- Audit-logged.

### #10 User-facing active-sessions panel

On profile page (#3) below email management:
- "Active sessions" section.
- Lists `auth_sessions WHERE identity_user_id = $self AND expires_at > now() AND revoked_at IS NULL`, showing `deviceLabel`, `authMethod`, `createdAt` ("Started X ago" — no `lastSeenAt` per Q-lifecycle), ip-truncated.
- Per-row "Sign out" button (current session marked "This device").
- "Sign out all other devices" button (revokes all but current).

### #11 Admin OTP-bypass

On admin user-detail (#5):
- Visible only to `portalRole='super_admin'`.
- Button "Issue one-time login link" → modal asks for `reason` (enum dropdown) + `reasonText` (free text, required).
- Submits to `POST /api/admin/users/:id/login-link` → returns URL displayed in modal with one-click copy.
- Below: read-only audit history of past one-time-link issuances on this user (table of `one_time_login_links` rows for this user).

---

## OTP service mechanics (Q7)

| Parameter | Value | Source |
|---|---|---|
| Code length | 6 digits, numeric | Q7a |
| Code TTL | 10 minutes | Q7b |
| Single-use | Yes (consumed on first match) | Q7c |
| Max wrong attempts | 5 | Q7d |
| Per-email request cooldown | 60 seconds | Q7e |
| Per-IP request cap | 30 / hour | Q7f |
| Unknown-email response | Same as success ("if registered, you'll receive…") | Q7g |
| Code storage | SHA-256 hash | Q7h |
| Cleanup | TTL + active-invalidate-on-new-request + nightly cleanup cron (deletes rows with `expires_at < now() - 7 days` from `otp_codes`; rows older than 24h from `otp_request_log`) | Q7i |

---

## Email infrastructure (Q3)

### Brevo setup (development phase, no DNS access)

As shipped in PR B2, the Brevo wiring uses **one** Secret Manager entry (the API key, which is genuinely sensitive) and treats the FROM address as plain config:

1. Owner signs up at `brevo.com` with their personal email.
2. Adds a single sender (e.g., the owner's personal Gmail) — Brevo emails a verification link, click to confirm. No DNS edits.
3. Generates an API key in Brevo dashboard → Settings → SMTP & API.
4. Sets two GitHub Actions repo variables for the deploy workflow:
   - `BREVO_FROM` — the verified sender address (passed as `-var="brevo_from=..."` to tofu).
   - `MAIL_TRANSPORT` — `stdout` for Phase 1, then `brevo` for Phase 2.
5. Phase 1 deploy: tofu creates `google_secret_manager_secret.brevo_api_key` (no version yet) and the IAM binding; Cloud Run env wires `BREVO_FROM`; transport stays `stdout`. The `BREVO_API_KEY` env entry is gated by a `dynamic` block on `var.mail_transport == "brevo"` so the missing-version case doesn't fail revision creation.
6. Operator populates the API key:
   - `echo -n "<brevo-api-key>" | gcloud secrets versions add coms-portal-brevo-api-key --data-file=-`
7. Operator flips the GH Actions repo var: `gh variable set MAIL_TRANSPORT --body "brevo"` and re-runs the deploy workflow.
8. Phase 2 deploy: dynamic env block emits `BREVO_API_KEY` from secret; `mail/index.ts` boot guard verifies both `BREVO_API_KEY` and `BREVO_FROM` are set; transport flips to brevo.

`BREVO_REPLY_TO` is deferred — in dev posture FROM = REPLY_TO = the operator's personal Gmail. Wire it when DNS lands and FROM moves to `noreply@ahacommerce.net`.

### Brevo setup (production gate, requires DNS access for `ahacommerce.net`)

When DNS access is arranged with the domain owner:
1. In Brevo dashboard → Senders → Domains → Add `ahacommerce.net`.
2. Brevo provides three DNS records to publish at the registrar:
   - **Modify existing** SPF TXT to append `include:_spf.brevo.com` (single TXT per domain rule).
   - **New** TXT at `mail._domainkey.ahacommerce.net` (Brevo DKIM).
   - **New** MX/CNAME for bounce/complaint reporting.
3. Verify in dashboard.
4. Update `coms-portal-brevo-from` Secret Manager value to `noreply@ahacommerce.net`.

No code change between dev and production; only the `BREVO_FROM` config value changes.

### Mail service shape

`apps/api/src/services/mail/index.ts`:

```ts
import { logger } from '~/logger'
import * as Brevo from '@getbrevo/brevo'

const apiInstance = new Brevo.TransactionalEmailsApi()
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY!)

export async function sendMail({ to, subject, htmlContent, textContent }: {
  to: string
  subject: string
  htmlContent?: string
  textContent: string
}) {
  const msg = new Brevo.SendSmtpEmail()
  msg.sender = { email: process.env.BREVO_FROM!, name: 'COMS Portal' }
  msg.to = [{ email: to }]
  msg.subject = subject
  msg.textContent = textContent
  if (htmlContent) msg.htmlContent = htmlContent
  try {
    await apiInstance.sendTransacEmail(msg)
  } catch (err) {
    logger.error({ err, to, subject }, '[mail] send failed')
    throw err
  }
}
```

Templates in `apps/api/src/services/mail/templates/`:
- `otp.ts` — login OTP (6-digit code).
- `verify-personal-email.ts` — self-service binding verification.

---

## Testing scope (Q11 — Recommended option)

Solo-dev posture + prod-direct deploys mean tests are the only pre-prod gate. Scope chosen to cover schema-migration correctness, OTP-service security, and auth-route regressions. UI/component tests and Playwright e2e are explicitly skipped — repo has zero precedent for Svelte component testing; adding it for one feature is over-investment.

| Test file | Lands in PR | Cases | Approx LoC |
|---|---|---|---|
| `apps/api/src/__tests__/identity-emails-migration.test.ts` | A | Backfill from `identity_users.email` + `personal_email` produces correct row counts and `isPrimary` per identity; idempotent re-run | 80-120 |
| `apps/api/src/__tests__/auth-workspace-routes.test.ts` | A | Workspace OIDC login still works post-refactor; rejected for non-allowlisted email; `verifiedAt` set on first login if NULL | 80-120 |
| `apps/api/src/__tests__/webhook-payload-shape.test.ts` | A | `user.created` / `user.updated` payload includes both scalar `email` and `emails` array; existing consumers get new field additively | 50-80 |
| `apps/api/src/__tests__/otp-service.test.ts` | B | Issue + verify happy path; expired code rejects; max-attempts (5) invalidates; per-email cooldown (60s) triggers 429; per-IP cap (30/hr) triggers 429; unknown-email returns same response, no `otp_codes` row created; SHA-256 hash compare constant-time (timing test); `invalidatedAt` set on new request supersedes prior live code | 150-200 |
| `apps/api/src/__tests__/auth-otp-routes.test.ts` | B | HTTP-level: `POST /api/auth/otp/request` + `POST /api/auth/otp/verify`; session row created with `authMethod='personal_otp'` and `emailUsed`; deactivated user 403 on verify | 100-150 |
| `apps/api/src/__tests__/auth-self-service-emails.test.ts` | D | `POST /api/me/emails` insert + collision-409 + privacy-preserving message; `PATCH` set primary; `DELETE` with last-login-method guard (cannot remove sole verified email); verify endpoint sets `verifiedAt` and fires `user.updated` | 120-150 |
| `apps/api/src/__tests__/auth-admin-emails.test.ts` | D | Admin add/remove/edit emails on a user; admin-add trusted (`verifiedAt = NOW()`, `addedBy='admin'`); collision shows target user; tombstone trail in `_history` | 100-150 |
| `apps/api/src/__tests__/one-time-login-link.test.ts` | E | super_admin only (other roles 403); 5-min TTL; single-use; both audit rows written (issued + consumed); `consumed_from_ip` recorded | 100-150 |

Total: 8 test files, ~1-2 days of test writing spread across PRs A/B/D/E. Each test uses the existing `test-helpers/` patterns and runs against a transactional Postgres test DB (no real Brevo calls — mock `sendMail`).

**Explicitly skipped:**
- Svelte component tests (no precedent in repo).
- Playwright / browser e2e (subproject-scale setup; revisit when team grows).
- Manual click-through covers UI verification post-deploy.

---

## Implementation plan

### PR A — Foundation (schema + auth-route + session-vehicle refactor)

**Lands:** PR with self-merge (CI gate; large blast-radius refactor).

**Includes:**
- Drizzle migrations:
  1. Create `identity_user_emails` + indexes + GENERATED `email_normalized` column (hand-edit SQL body for the GENERATED expression; journal entry from `drizzle-kit generate`).
  2. Create `identity_user_emails_history` + DELETE trigger on `identity_user_emails`.
  3. Create `auth_sessions` table.
  4. Backfill `identity_user_emails` from existing `identity_users.email` (kind based on `hasGoogleWorkspace`, addedBy='backfill') and `identity_users.personal_email` (kind='personal', addedBy='backfill'), all with `verifiedAt = NOW()`. `isPrimary = true` for the workspace row, or for the personal row when `hasGoogleWorkspace=false`. NB (2026-04-30): no real users on the system — backfill primarily seeds dev/admin pre-provisioned rows. Idempotency still matters for re-runs.
  5. Drop `identity_users.email` and `identity_users.personal_email` columns.
- **Session-vehicle migration (new, replaces the GIP-cookie session model):**
  - New `apps/api/src/services/sessions.ts` exposing `createPortalSession`, `validateSession`, `revokeSession`, `revokeAllSessionsForUser`.
  - Cookie value changes from GIP-encrypted JWT to opaque UUID = `auth_sessions.id`. Cookie name unchanged (`SESSION_COOKIE_OPTIONS.name`).
  - Refactor `POST /api/auth/session` (`auth.ts:151-211`): keep `verifyIdToken` for Workspace OIDC verification; remove `createSessionCookie`; call `createPortalSession({authMethod: 'workspace_oidc', emailUsed: decoded.email, ...})`; set the opaque-UUID cookie.
  - Refactor `POST /api/auth/logout` and `GET /api/auth/logout` (`auth.ts:224-351`): replace `verifySessionCookie` with `validateSession`; call `revokeSession(sessionId, 'logout')` instead of `revokePortalSession` (which now only handles cutoff cases).
  - Refactor `resolveSessionUser` (`auth.ts:133-143`) and every other callsite of `verifySessionCookie` / `getSessionCookieValue` — likely middlewares, `/auth/me`, `/userinfo`, broker handoff, possibly more. (PR A scope: enumerate and migrate all of them. Use `grep -rn "verifySessionCookie\|getSessionCookieValue"` as the migration checklist.)
  - Refactor `/auth/broker/introspect` (`auth.ts:510-618`): keep the userId + sessionIssuedAt contract; query `auth_sessions` for liveness instead of (or in addition to) `session_revocations`. The relying-party app contract does not change.
  - GIP Admin SDK usage narrows to `verifyIdToken` only. `createSessionCookie`, `verifySessionCookie`, and `setCustomUserClaims` calls are removed; `setCustomUserClaims` itself stays in `gip-admin.ts` only if another path needs it (likely deletable).
  - Delete `apps/api/src/services/claims.ts` (`resolveAndSyncClaims`) and remove its callsite at `auth.ts:187`. Per Q-claims, GIP-side custom claims have no consumer post-pivot. `resolveAuthUser` (`middleware/auth.ts`) already computes claims from DB per request and continues to do so. `gipUid` column on `identity_users` stays as a nullable audit-link.
- Refactor `apps/api/src/routes/auth.ts:164-165` identity lookup to query `identity_user_emails` joined to `identity_users` (replaces `email = decoded.email`).
- Refactor `apps/api/src/routes/userinfo.ts` to read primary email per Q8a precedence and emit the new `emails` array per Q8b.
- Refactor OIDC ID-token issuance path (broker handoff / claims) to derive `email` claim per Q8a.
- Update `@coms-portal/shared` to v1.5.0 with new `emails` array on `UserProvisionedPayload` and equivalent shape on user-update payloads. Push, tag, swap `apps/web/package.json` git URL pin.
- Update `apps/api/src/services/employee-import.ts` to write through `identity_user_emails`.
- Update `apps/api/src/services/employee-info-sync.ts` to write through `identity_user_emails`.
- Update `createEmployee` service in `apps/api/src/services/employees.ts`.
- **Bootstrap-admin seed script (per Q-bootstrap):**
  - New `apps/api/scripts/seed-admin.ts`. Reads `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_NAME` (and optionally `BOOTSTRAP_ADMIN_PERSONAL_EMAIL`) from env. No-ops if `BOOTSTRAP_ADMIN_EMAIL` is unset.
  - In a single transaction: ensure an `identity_users` row exists for that email (UPSERT keyed on the `kind='workspace'` `identity_user_emails.email_normalized`); ensure an `identity_user_emails` row exists with `kind='workspace'`, `addedBy='bootstrap'`, `verifiedAt=NOW()`, `isPrimary=true`. Set `portalRole='super_admin'` on the identity row if newly created (do NOT downgrade an existing admin).
  - Add `'bootstrap'` to `IDENTITY_USER_EMAIL_ADDED_BY` enum.
  - Wire `bun run db:seed-admin` script in `apps/api/package.json`.
  - Add a post-migrate hook in the deploy workflow (`infra/.github/workflows/deploy.yml` or wherever `db:migrate` is invoked) to run `db:seed-admin` after every migration. Idempotent so safe to repeat.
  - Add `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_NAME` to Cloud Run env in `infra/cloud-run.tf` (set to your admin identity).
  - Local: add to `.env.example` so a fresh dev clone can self-seed.

**Verification:** existing Workspace-email login still works post-deploy. **No real users on the system today (confirmed 2026-04-30)** — the cookie-format change has no human impact; no advance communication needed; in-flight `auth_handoffs` are not a concern. `validateSession` should still fail cleanly on a malformed (non-UUID) cookie value (return null without a DB query) so the dev's own stale cookies don't generate 500s during the rollout.

**Risk:** large blast radius (every authenticated request path touches the new `validateSession`) and one-shot destructive column drop on a no-staging prod. Mitigations:
- `auth_sessions` table created and `createPortalSession` written first; tested in isolation against transactional Postgres before any callsite migration.
- Cookie format change is reversible only by users re-logging in; revert deploy + revert cookie = users re-auth.
- Backfill is idempotent (UPSERT on `email_normalized`).
- Column drop in step 5 is one-shot per Q-soak (decided 2026-04-30); rollback past it requires restore-from-backup. Confirm a fresh DB backup exists immediately before the migration runs.

### PR B — OTP infrastructure

**Lands:** PR with self-merge (CI gate; security-sensitive code).

**Includes:**
- Drizzle migration: `otp_codes` + `otp_request_log` + `auth_sessions` column additions + `one_time_login_links` (deferred-extras schema; cheaper to land it now than in PR E).
- `apps/api/src/services/mail/index.ts` + Brevo SDK dep + secret-manager wiring + Cloud Run env additions in `infra/cloud-run.tf`.
- `apps/api/src/services/otp.ts` — issue, verify, invalidate-prior, rate-limit checks.
- `apps/api/src/routes/auth/otp.ts` — `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`.
- Cleanup cron registered (one of: cloud-tasks-triggered HTTP endpoint, or a one-line cron in Cloud Scheduler; existing portal infra has cloud-tasks per `infra/cloud-tasks.tf`).

**Verification:** curl-based smoke test against staging-equivalent (or dev) — request OTP, receive email, verify code, see `auth_sessions` row.

### PR C — Login surfaces

**Lands:** PR with self-merge.

**Includes:**
- Login screen rewrite (#1).
- OTP entry screen (#2).
- Frontend client for `/api/auth/otp/*` endpoints.

**Verification:** end-to-end test: a personal-only user (admin pre-created via PR A's migration backfill or via #4 form post-PR D) can log in via OTP.

### PR D — Profile + admin UIs

**Lands:** Direct push.

**Includes:**
- Profile email management (#3) + endpoints (`POST/PATCH/DELETE /api/me/emails/*`).
- Admin user-create form (#4).
- Admin user-detail extensions (#5).
- CSV import flagged-row extensions (#6).
- Admin find-by-email search (#7).

**Verification:** click-through manually on each surface.

### PR E — Extras

**Lands:** Direct push for #9, #10; PR with self-merge for #11 (security-sensitive).

**Includes:**
- Sign-out-everywhere button + endpoint (#9).
- Active-sessions panel + listing endpoint (#10).
- One-time login link UI + endpoints + audit-log integration (#11).

**Verification:** super-admin issues link, target user clicks, session minted, audit log shows both events.

### PR F — Spec update sweep

**Status: shipped 2026-05-03** (commit `8f13c64` + post-merge follow-up).

**Lands:** Direct push (docs-only).

**Includes updates to:**
- This spec (mark "Implementation status: shipped").
- `spec-01-account-widget.md` — update §Visual Spec / userinfo references to reflect `emails` array; widget consumes scalar `email` only (no widget-side change required, but the spec should describe the richer payload).
- `spec-03-user-identity-alias-layer.md` — note that `identity_users.email` is replaced by multi-row `identity_user_emails`; update §Schema and Appendix A as needed.
- `spec-03c-pre-spec-4-hardening.md` — note any overlap (likely none — spec-03c is about removing `APP_LAUNCHER` constant, which is unrelated).
- `heroes-integration-handoff.md` — add a "Spec 06 has shipped portal-side" note in the upper banner; update widget-prop documentation if `emails` field flows through; explicitly state Heroes-side rev3 work is now unblocked.
- `spec-00-implementation-timeline.md` — slot Spec 06 into the timeline.

---

## Pre-implementation checklist (clean session pickup)

Validated 2026-04-30:

**For PR A:**
- [x] `coms-shared` is `git+https://github.com/mrdoorba/coms-shared.git#v1.4.1`. Bump procedure: push to `mrdoorba/coms-shared`, tag `v1.5.0`, swap pin in BOTH `apps/api/package.json` AND `apps/web/package.json`.
- [x] `portalRole` currently has `'employee' | 'admin'` only (`identity-users.ts:19`, `routes/employees.ts:24`). `super_admin` extension deferred to PR E.
- [x] `SESSION_COOKIE_OPTIONS` (in `@coms-portal/shared`) keeps its role for cookie attributes. `maxAge` set to 14d (the longest per-method TTL).
- [x] Deploy workflow precedent for idempotent post-migrate scripts at `.github/workflows/deploy.yml:162-172` ("Bootstrap broker signing key"). Use as the template for `db:seed-admin`.
- [x] `verifySessionCookie` / `getSessionCookieValue` / `createSessionCookie` callsites enumerated: `middleware/auth.ts`, `middleware/session-cookie.ts`, `routes/userinfo.ts`, `routes/auth.ts` (multiple), `services/auth.ts`. 5 files to migrate.
- [x] `auth_handoffs` table carries its own `portalRole`; broker exchange independent of session cookie. Pivot does not break broker flow.
- [x] CLAUDE.md rule on Drizzle migrations (`drizzle-kit generate` for journal, hand-edit SQL body if needed) understood.
- [x] No real users on the system; cookie-format change is harmless to humans.
- [x] Self-merge PR posture; no staging.

**For PR B (validated 2026-05-01):**
- [x] Brevo account with verified single-sender (dev posture, no DNS access for `ahacommerce.net` per Q3-DNS).
- [x] One Brevo secret in GCP Secret Manager: `coms-portal-brevo-api-key` populated via `gcloud secrets versions add`. `BREVO_FROM` lives as `var.brevo_from` (GH Actions repo var `BREVO_FROM`); `BREVO_REPLY_TO` deferred until DNS lands.
- [x] `BOOTSTRAP_ADMIN_PERSONAL_EMAIL` set as a GH Actions repo var to a distinct personal inbox — must NOT match the workspace email (UNIQUE index on `email_normalized` enforces one row per address across all kinds).
- [x] End-to-end OTP smoke test against deployed Cloud Run: `POST /api/auth/otp/request` → email delivered → `POST /api/auth/otp/verify` returns 200 with `__session` cookie set to the new `auth_sessions.id`.

**For PR E (deferred validation):**
- [ ] `super_admin` value added to `portalRole` enum (extend `identity-users.ts`, `routes/employees.ts` t.Union, RBAC middleware, shared types in coms-shared if any).

---

## Out of scope (explicitly deferred)

| Item | Why deferred | Future trigger |
|---|---|---|
| #8 email-history viewer UI | Data captured in `_history` table; SQL access sufficient for v1 | Add when admins ask for it |
| Magic-link auth | OTP chosen for v1 (Q1) | Reconsider only if user feedback demands it; very unlikely |
| Multi-IdP federation (Microsoft, Apple) | Out of scope for "any email provider" requirement (OTP solves it) | If a tenant requires Microsoft SSO, design separately |
| Recovery-email kind | YAGNI; current model is workspace + personal only | Add as a new `kind` enum value when concrete need surfaces |
| `MX` lookup validation on email entry | Adds latency + flakiness for marginal value | Add if typo-rates become a support burden |
| Per-app role MFA / step-up auth | Q6a explicitly punts this — separate concept | Design separately when admin actions need stronger guarantees |
| Email-lifecycle webhook events (Q8d) | Ride on `user.updated` for v1 | Add per-event types if a consumer needs finer-grained handling |

---

## Cross-references

- `spec-01-account-widget.md` — widget consumes `userinfo.email` (scalar); no widget-side change in v1.
- `spec-03-user-identity-alias-layer.md` — multi-row pattern precedent (`user_aliases`); same shape applied here.
- `spec-03c-pre-spec-4-hardening.md` — orthogonal; can land in any order.
- `heroes-integration-handoff.md` — Heroes-side rev3 work depends on this spec shipping + spec-update sweep landing.
- `feedback_drizzle_migrations.md` (memory) — never hand-write journal entries; SQL body editable as long as journal comes from `drizzle-kit generate`.
