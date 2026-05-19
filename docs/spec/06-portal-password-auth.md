# Spec 06: Portal Password Authentication

> Status: **draft 2026-05-19** — design captured, no code landed. Authoring trigger: `tasks/todo.md` FU-14 ("Portal admin affordance — 'create identity with arbitrary email + password'") plus the in-session expansion to a user-side password sign-in option.
> Type: one-shot (executable plan; document dies once executed, like Specs 01/02/05).
> Owner: TBD
> Filename note: filed as `06-portal-password-auth.md` (not `06-portal-admin-operations.md` originally proposed in conversation) because the in-session scope grew beyond the admin-side affordance — the spec now also covers user-side password sign-in. If a sibling admin-operations spec is later authored, it gets a fresh number.
> Prerequisites: Spec 06 PR A–E (sealed in code, no consolidated doc) — see *Prior art* below.
> Targets: integration contract §§ 1–4 (identity ownership, JWT sessions, multi-email model); ADR 0005 (stateless JWT sessions); ADR 0006 (GIP-only auth — see *ADR 0006 reconciliation* below).

## Prior art — Spec 06 PR A–E (already shipped in code; no consolidated doc exists)

This is the sixth Spec 06 PR in the chain. The prior five live in code references only — no `docs/spec/06-*.md` was ever authored — so this file briefly anchors them. The references that follow are file:line; the prose of each PR's intent lives in the relevant commit message or in `tasks/todo.md`.

| PR | What shipped | Code anchors |
|---|---|---|
| **PR A** | Multi-email identity model (workspace + personal); workspace OIDC session exchange; `identity_user_emails` table; webhook payloads carry the additive `emails: UserEmailEntry[]` array | `apps/portal-api/src/db/schema/identity-users.ts:13` (model comment), `apps/portal-api/src/db/migrations/0029_*.sql` (migration), `apps/portal-api/src/__tests__/webhook-payload-shape.test.ts:3` (test ref) |
| **PR B1** | OTP HTTP routes for personal-email sign-in (`POST /api/auth/otp/request` + `/verify`); enumeration resistance (Q7g); rate-limiting per-email + per-IP | `apps/portal-api/src/routes/auth.ts:726-820` (routes), `apps/portal-api/src/services/otp.ts` (service), `apps/portal-api/src/__tests__/auth-otp-routes.test.ts:2` (test ref) |
| **PR D** | Admin email management (§618-628) — admins can add/remove emails on an identity; self-service `/api/me/emails` (§483-505) — users manage their own personal emails | `apps/portal-api/src/routes/employees.ts:601` (admin), `apps/portal-api/src/routes/me-emails.ts` (self) |
| **PR E** | Super-admin RBAC gate (`requireSuperAdmin`); admin sign-out-everywhere (§9); `/api/me/sessions` self-service active-sessions panel (§10); one-time login link (§11, super-admin-only) | `apps/portal-api/src/middleware/rbac.ts:59` (gate), `apps/portal-api/src/routes/employees.ts:821` (sign-out-all), `apps/portal-api/src/routes/employees.ts:873` (login-link), `apps/portal-api/src/routes/me-sessions.ts` (self), `apps/portal-api/src/routes/auth/one-time.ts` (link consumption) |
| **(Onboarding smoketest)** | "Spec 06 (Rev 4) PR A" labelled separately — onboarding smoketest endpoint `POST /apps/:id/smoketest` | `apps/portal-api/src/routes/app-smoketest.ts:17` |

**This spec authors PR F** — portal password authentication.

## Objective

Add **email + password** as a first-class authentication method on portal-web, alongside the two methods already shipped:

- Google sign-in (workspace emails) — Spec 06 PR A's workspace OIDC path
- One-time code via email (personal emails) — Spec 06 PR B1's OTP path

After PR F lands, a portal identity can sign in via any of three methods depending on what's been provisioned for them. Two distinct surfaces compose the feature:

1. **Admin-side (FU-14's original ask):** A portal admin can create an identity with an arbitrary email (any RFC-5322-valid address, no deliverability check) and an admin-set initial password. The use cases are real and named in FU-14: test accounts (`test@anywhere.com`), shared admin logins (`admin@gmail.com`), sub-admin identities without `@ahacommerce.net` workspace email (`tools-bot@internal`).

2. **User-side:** Any user — workspace or personal — can sign in with email + password as an alternative to Google sign-in or OTP. First-login flow on accounts without a password forces the user to set one (per the in-session expansion: *"when user logging in for first time, they will prompted to set new password"*).

The two surfaces share a single password policy (defined below), a single sign-in route on portal-api, and a single password-setup component on portal-web.

## Success criteria

This spec is done when all of the following are true:

- [ ] `POST /api/auth/password/sign-in` exists on portal-api. Accepts `{ email, password }`. Verifies via GIP REST (`accounts:signInWithPassword`). On success mints a portal session cookie (same `authMethod` field shape as `personal_otp` / `workspace_oidc`, value `'password'`). Returns 401 with `{ error: 'INVALID_CREDENTIALS' }` on bad password; 403 with `{ error: 'INACTIVE_USER' }` on disabled identity; 429 with `Retry-After` on rate-limit hit.
- [ ] `POST /api/auth/password/set` exists on portal-api. Accepts `{ currentPassword?, newPassword }` (current-password is optional for the first-set case, required for subsequent change-password calls). Validates `newPassword` against the policy below. Calls GIP REST (`accounts:update` with `password`) to apply. On success, records the audit event `password_set` (no password value in the payload).
- [ ] `POST /v1/identities` exists on portal-api as the sibling-to-`/v1/employees` admin endpoint. Body: `{ name, email, password, notes? }` (kind is hard-coded to `'personal'` per §2; no `kind` field on the wire). Only `requireRole('admin')` callers pass. Creates a lean `identity_users` row (no phone/dept/position/branch/leader/teamId required) with `password_only_auth = TRUE`, one `identity_user_emails` row with `kind = 'personal'` + `addedBy = 'admin'`, calls `createGipUser(email, password)` directly (no random-temp + reset-link dance — admin-supplied password lands verbatim). Returns the new identity's id + initial provisioning state.
- [ ] `identity_users.notes` column added (TEXT, nullable). Migration 0033 (or next sequential — verify at implementation time). Captured for the audit-trail use case named in FU-14 recommended-shape §3.
- [ ] `identity_users.password_set_at` column added (timestamp, nullable). Set to `now()` whenever GIP password is updated via `/api/auth/password/set` or `POST /v1/identities`. Read by the first-login flow to decide whether to force the password-setup prompt.
- [ ] `identity_users.password_only_auth` column added (BOOLEAN NOT NULL DEFAULT FALSE). Set to `TRUE` by `POST /v1/identities`. Read by `POST /api/auth/otp/request` (returns `{ error: 'PASSWORD_ONLY' }` when true) and by the forgot-password handler (refuses to issue reset link when true).
- [ ] `identity_users.password_lockout_until` column added (timestamp, nullable). Written by `POST /api/auth/password/sign-in` when the 5-failures-in-10-minutes threshold trips. Cleared on first successful sign-in.
- [ ] `apps/portal-web/src/routes/login/+page.svelte` extends to a four-step flow: `choose → email → password|otp`. The `choose` and `email` steps stay as-is; the third step routes to `otp` if the email is OTP-only or `password` if a password has been set. A `forgot-password` link sits on the `password` step (reuses the existing `generatePasswordResetLink` REST helper at `apps/portal-api/src/gip-admin.ts:77` — already wired, no new code).
- [ ] First-login forced-set: when an identity signs in for the first time AND has no `password_set_at`, the session is minted but flagged `requires_password_setup`. portal-web's `(authed)` layout reads the flag, redirects to a one-time `/onboarding/set-password` route, blocks all other routes until the user POSTs to `/api/auth/password/set`. On success, the flag clears.
- [ ] Password policy enforced server-side at both `POST /api/auth/password/set` and `POST /v1/identities`: **minimum 12 characters, no composition rules.** Revised from the original "8 chars + letter + digit" gate on 2026-05-19 to match NIST SP 800-63B and OWASP ASVS L2 guidance — composition rules are research-debunked (users defeat them trivially with `Password1`, `Pa$$w0rd1` etc. without raising actual strength). Length plus rate-limiting plus zxcvbn-based UI feedback do the real work. The server rejects shorter passwords with `{ error: 'WEAK_PASSWORD', message }`. The portal-web meter (`password-strength-meter.svelte`) uses **zxcvbn-ts** for pattern-aware scoring — catches dictionary words, sequences, keyboard runs, leet substitution, personal-info matches (email/name passed as `userInputs`), and displays an estimated offline crack time. zxcvbn score 0-1 surfaces as "weak/very weak", 2 as "fair", 3-4 as "strong/very strong". The score is a UI hint only; the server enforces only length.
- [ ] New `apps/portal-web/src/routes/(authed)/admin/identities/` route exists. List view shows all `identity_users` with `source = 'manual'`. Create form: name + email + kind + password (cleartext field with show/hide toggle + strength meter) + notes. Calls `POST /v1/identities`. Audit-log links from the row to the create event.
- [ ] Audit log records `create_identity_with_password` (admin path) and `password_set` (user path) actions; details payload includes actor, target email, kind, but never the password.
- [ ] Tests cover: GIP password-sign-in happy path; bad password 401; inactive-user 403; rate-limit 429; password policy rejection (too short / no digit / no letter); admin-create-identity happy path; first-login forced-set redirect; subsequent change-password requires `currentPassword`.
- [ ] No regression in existing Google sign-in or OTP flows (verified by running existing test suites + a manual smoke).
- [ ] ADR 0006 (GIP-only auth) reconciled — see below.
- [ ] `tasks/todo.md` FU-14 marker flips `[ ]` → `[x]` with a Done block citing the new spec + the commits that implement it.

## Out of scope

- **Password reuse policy / age-out / history.** A future tightening if compliance ever requires it. Today's minimum is sufficient for the use cases FU-14 names.
- **Breach-corpus check (Have I Been Pwned k-anonymous range API).** Deliberately deferred to a follow-up FU. The 2026-05-19 policy revision (minimum 12, no composition) already removes the worst common-password patterns by length alone; HIBP closes the residual "I picked `correctbatteryhorse2025` and didn't realise it was in last year's dump" gap. Tracked as a Phase-6 carryover. Adding it is ~10 lines in `validateMinimum` (single GET to `https://api.pwnedpasswords.com/range/{sha1-prefix}`); the dependency is only that portal-api can make outbound HTTPS to that domain.
- **Multi-factor authentication.** GIP supports TOTP + SMS but the suite has no need yet. If MFA lands, it's a separate spec.
- **Password recovery via security questions.** Already covered by `generatePasswordResetLink` → email-based reset; questions/answers aren't on the roadmap.
- **Per-app password policies.** Per ADR 0006 + the integration contract §1, portal owns credentials. The five apps (portal-api, portal-web, heroes-api, heroes-web, coms-fast-web) all sign in via portal; none operate their own password store. Per-app policies are nonsensical under that model.
- **Disabling Google sign-in for a specific identity.** Today every workspace identity can ALSO use OTP if their personal email is provisioned; after PR F they can also use password. Coexistence is the design. If a future spec wants to disable a method per identity, it's separate.
- **Bulk admin-create-identity from CSV.** The bulk import path stays employee-shaped (`apps/portal-api/scripts/spec07-*.ts` and the CSV importer at `routes/employees.ts:272`). PR F's `/v1/identities` is single-create only. Bulk-create is straightforward future work if the operational need surfaces.

## Resolved decisions (2026-05-19)

All five open questions were resolved in the design session. The decisions below replace the original open-question table; the spec body below them assumes these answers.

| Question | Decision |
|---|---|
| **§1 — Who gets the forced password-set prompt on first sign-in?** | **Aggressive rollout — everyone with `password_set_at = NULL` gets prompted on their next sign-in, regardless of method (Google / OTP / password).** At PR F deploy time, every existing user (workspace + personal) is treated as "first-time login" until they explicitly set a password. UX hit at the moment of deploy, but the population converges to all-passworded within ~one active-user window. After convergence, no future user can reach the dashboard without a known password set. Aligns with the operator's original phrasing *"when user logging in for first time, they will prompted to set new password"*. |
| **§2 — `kind` for admin-created identities + are they OTP-eligible?** | **`kind = 'personal'` always for `/v1/identities`-created identities, AND those identities are password-only.** Admin-created identities are "credential bags" — typically `tools-bot@internal` (no real mailbox) or `admin@gmail.com` (shared login the org doesn't want OTP-able). To enforce password-only behaviour, add a new column `identity_users.password_only_auth: boolean DEFAULT FALSE`. `/v1/identities` sets it `TRUE` automatically. `POST /api/auth/otp/request` checks the flag and returns `{ error: 'PASSWORD_ONLY' }` (frontend routes to the password step, no OTP email sent). The forgot-password / `generatePasswordResetLink` path also checks the flag and refuses to issue a reset link (admin must use a future admin-side recovery action — out of scope for PR F; tracked as a Phase-6 carryover below). |
| **§3 — What does `/v1/identities` fire downstream?** | **Full fanout.** `createGipUser` + `identity_users` insert + `identity_user_emails` insert + `seedAppUserConfigForUser` + `emitUserProvisioned` (fans `user.provisioned` webhook to fast / heroes / future apps). **Skipped:** `processEmployeeProvisioning`'s reset-link email (admin already set the password); team-membership seeding (no `teamId` field on `/v1/identities`); the `provisioningStatus` state machine (admin-created identities are immediately `ready`). Treats admin-created identities as first-class — downstream apps get a profile row immediately. |
| **§4 — Rate-limit + lockout on password sign-in?** | **Moderate two-axis limit + email-scoped lockout.** Per-email: 5 attempts/min (with `Retry-After`). Per-IP: 30 attempts/min. After 5 FAILED password attempts on the same email within 10 minutes, lock password sign-in for that email for 15 minutes (recorded on `identity_users.password_lockout_until` — new nullable timestamp column). Counter resets on first successful sign-in. Lockout is portal-side only; GIP-side is unaffected. Mirrors OTP route's existing per-email + per-IP shape. |
| **§5 — Audit-log retention for password events?** | **Default — same retention as other audit events.** No special handling. The `create_identity_with_password`, `password_set`, and `password_signin_lockout` events record actor + target identity + email + kind + timestamp + IP; the password value never appears in any audit row. Retention follows whatever the existing audit table enforces (verify at implementation; likely 90-day rolling). |

## ADR 0006 reconciliation

ADR 0006 declares portal as **GIP-only** for identity. PR F adds email+password as an auth method but does NOT introduce a new identity store — GIP itself owns the password verification (via `accounts:signInWithPassword` REST). Portal-api's role is to:

1. Forward the credential check to GIP.
2. Mint its own session cookie on success (same shape as `personal_otp` / `workspace_oidc` paths).
3. Enforce policy at create/change time.

Identity is still in GIP. Sessions are still portal-issued. The ADR's claim holds. The only material change to the ADR's posture is that GIP's password field — previously written to only as `crypto.randomUUID()` during employee provisioning, immediately followed by a `generatePasswordResetLink` email — now also gets written with admin- or user-supplied values. This is a usage shift inside GIP's existing capability, not a new identity store.

**Action:** add a short addendum to `docs/adr/0006-gip-only-auth.md` recording PR F as a usage expansion + linking back to this spec. No new ADR is needed.

## Phases

### Phase 1: Schema + policy library

Acceptance: all DB columns + the policy-validation helper exist and have unit tests. No HTTP surface yet.

- [ ] **T01: Migration 0033 — add four columns to `identity_users`.**
  - Columns: `notes TEXT NULL`, `password_set_at TIMESTAMPTZ NULL`, `password_only_auth BOOLEAN NOT NULL DEFAULT FALSE`, `password_lockout_until TIMESTAMPTZ NULL`.
  - Steps: author Drizzle schema diff in `apps/portal-api/src/db/schema/identity-users.ts`; generate migration via `bun drizzle-kit generate`; eyeball the SQL; run `bun drizzle-kit push` against the dev DB.
  - Acceptance: `\d identity_users` in psql shows the four new columns with the constraints above.
  - Verification: `bun --filter @coms-portal/portal-api typecheck` green.

- [ ] **T02: Author the password-policy validator.**
  - File: `apps/portal-api/src/services/password-policy.ts` (new). Pure function. Two exports: `validateMinimum(pwd: string): { ok: true } | { ok: false; reason: string }` (**≥12 chars; no composition rule** — see §Success criteria for the rationale) + `scoreStrength(pwd: string): 'weak' | 'fair' | 'strong'` (length-only fallback tier: <12 weak, 12-15 fair, 16+ strong; the authoritative UI tier comes from zxcvbn in the portal-web meter).
  - Acceptance: unit tests cover the boundary cases (11 chars rejected, 12 accepted, all-digits-12 accepted (no composition rule), non-string input rejected; `scoreStrength` returns `weak`/`fair`/`strong` on the three length tiers).
  - Verification: `bun test apps/portal-api/src/services/__tests__/password-policy.test.ts` green.

### Phase 2: Admin-side affordance — `POST /v1/identities`

Acceptance: an admin can create `admin@gmail.com` with admin-set password via curl; the new identity_users row has `source = 'manual'`, `password_set_at` populated; the email row has `kind` matching the request; a fast sign-in attempt with that credential lands at `loadFastAuthUser` and provisions a fast User row.

- [ ] **T03: Author `apps/portal-api/src/services/identities.ts`.**
  - Export `createIdentityWithPassword({ name, email, password, notes? })`. Calls `createGipUser` (existing helper at `gip-admin.ts:102`), inserts `identity_users` row with `source = 'manual'` + `password_only_auth = TRUE` + `password_set_at = now()`, inserts `identity_user_emails` row with `kind = 'personal'` + `addedBy = 'admin'` + `isPrimary = TRUE` + `verifiedAt = now()`, all in a single tx. Post-tx (fire-and-forget): `seedAppUserConfigForUser` + `emitUserProvisioned`. Returns `{ id, gipUid }`. Validates policy via `validateMinimum` before calling GIP.
  - Acceptance: function exists; unit test covers the happy path + GIP-create-failure rollback (no `identity_users` row left orphaned on failure) + the `password_only_auth = TRUE` invariant on the resulting row.
  - Verification: `bun test apps/portal-api/src/services/__tests__/identities.test.ts` green.

- [ ] **T04: Author `apps/portal-api/src/routes/identities.ts`.**
  - Single endpoint: `POST /v1/identities`. Gated by `requireRole('admin')`. Body validation via Elysia `t.Object({ name: t.String(...), email: t.String({ format: 'email' }), password: t.String(...), notes: t.Optional(t.String()) })`. No `kind` field on the wire — service hard-codes `'personal'`. Calls `createIdentityWithPassword`. Logs `create_identity_with_password` audit event with actor + target + email + notes (no password). Wires into `apps/portal-api/src/index.ts` under the existing admin routes namespace.
  - Acceptance: route test covers admin-callable path, non-admin caller gets 403, malformed body 400, weak password 400, duplicate-email 409.
  - Verification: `bun --filter @coms-portal/portal-api typecheck` + `bun --filter @coms-portal/portal-api test` green.

- [ ] **T05: Author the portal-web `/admin/identities` route.**
  - Files: `apps/portal-web/src/routes/(authed)/admin/identities/+page.server.ts` (loader: list identity_users where `password_only_auth = TRUE`), `apps/portal-web/src/routes/(authed)/admin/identities/+page.svelte` (list + create form with the password strength meter), `apps/portal-web/src/lib/components/admin/IdentityCreateForm.svelte` (extracted form).
  - Form fields: name + email + password (with show/hide Eye/EyeOff toggle + real-time strength meter) + optional notes. No kind radio (hard-coded `'personal'` server-side). Uses Eden RPC to POST to `/v1/identities`. Strength meter is `apps/portal-web/src/lib/components/password-strength-meter.svelte` and uses **zxcvbn-ts** (`@zxcvbn-ts/core` + `language-common` + `language-en`) for pattern-aware scoring. The meter receives `userInputs={[name, email]}` so zxcvbn flags identity-derived attempts. The shared length-only `scorePasswordStrength` in `packages/shared/src/password-strength.ts` remains as a dependency-free fallback for non-UI consumers (tests, future CLI tools, server-side gates that don't want the zxcvbn dictionary bundle). SERVER-side `validateMinimum` (length-only) is the authoritative gate; the client meter is UX-only.
  - Acceptance: form posts cleanly; created identity appears in the list after refresh; non-admin caller gets a 403 redirect to dashboard.
  - Verification: smoke against local dev server; visual check of the strength meter on weak/fair/strong inputs.

### Phase 3: User-side sign-in route + login page

Acceptance: a user with `email + password` provisioned (either admin-created or future self-set) can sign in via portal-web → `password` step. A user without a password sees only the existing Google/OTP options.

- [ ] **T06: Author `POST /api/auth/password/sign-in`.**
  - File: extends `apps/portal-api/src/routes/auth.ts`. Calls GIP REST `accounts:signInWithPassword` (new helper in `gip-admin.ts` — `signInWithPassword(email, password)` returns `{ localId, idToken }` or throws). Verifies the returned token, looks up the matching `identity_users` row by `gip_uid`, mints a portal session with `authMethod = 'password'`. Applies the §4 rate-limits (per-email + per-IP + lockout).
  - Acceptance: route test covers happy path; bad password 401; inactive user 403; rate-limit 429; lockout 423.
  - Verification: typecheck + test green.

- [ ] **T07: Extend `POST /api/auth/otp/request` with two new short-circuit outcomes.**
  - **`PASSWORD_ONLY`** — when the email's identity has `password_only_auth = TRUE`, the OTP-request response returns `{ error: 'PASSWORD_ONLY' as const, message: 'This account uses a password only. Please enter it on the next step.' }` (no OTP email sent). Used for admin-created identities (`/v1/identities` set the flag).
  - **`HAS_PASSWORD`** — when the email's identity has `password_set_at IS NOT NULL` AND `password_only_auth = FALSE`, the response returns `{ error: 'HAS_PASSWORD' as const, message: 'This account uses a password. Please enter it on the next step, or click \"Use code instead\" to receive a one-time code.' }`. The user CAN still fall back to OTP (the email is deliverable; the frontend shows a "Use code instead" link that re-fires OTP request with a `force_otp: true` flag — separate handling at the route level).
  - Existing `WRONG_LOGIN_PATH` and `SENT` / `UNKNOWN_EMAIL` outcomes preserved.
  - Acceptance: existing OTP tests stay green; new tests cover the `PASSWORD_ONLY` + `HAS_PASSWORD` branches + the `force_otp` fallback for `HAS_PASSWORD` identities.
  - Verification: typecheck + test green.

- [ ] **T08: Extend `apps/portal-web/src/routes/login/+page.svelte` to a four-step flow.**
  - Step machine: `choose` → `email` (existing) → `password` (new) | `otp` (existing). Routing decision lives in the email-step handler: on `requestOtp` returning `error: 'HAS_PASSWORD'`, switch to `password` step; on `error: 'WRONG_LOGIN_PATH'`, show the existing "Switch to Google" CTA; on `outcome: 'sent'`, switch to `otp` step (existing behaviour).
  - Password step: single input + show/hide toggle + "Forgot password?" link (calls `generatePasswordResetLink` via a new portal-api shim `POST /api/auth/password/forgot`, ENUMERATION-RESISTANT — same shape as OTP request).
  - Acceptance: manual smoke covers each of the three paths.

### Phase 4: First-login forced password set (aggressive rollout)

Acceptance: every existing identity with `password_set_at IS NULL` is forced through `/onboarding/set-password` on their NEXT sign-in (regardless of method — Google, OTP, or password). After they set a password, subsequent logins are normal. Admin-created identities (where the admin set the password at creation, so `password_set_at IS NOT NULL`) skip this flow entirely. At PR F deploy time, this hits ~100% of the existing user base; the population converges within roughly one active-user window.

**Rollout discipline:** Phase 4 deploys behind a feature flag `FORCE_PASSWORD_SETUP_ENABLED` so the schema migration (T01) + service code (T03–T09) can ship without immediately triggering the prompt suite-wide. There is no separate staging environment — the four Cloud Run services run `environment = "prod"` directly (see the prior decision in `tasks/todo.md` against splitting staging/prod). The dry-run is therefore (a) the engineer running portal-web locally against the dev DB with `FORCE_PASSWORD_SETUP_ENABLED=true` in their local env, signing in as their own identity, verifying the redirect to `/onboarding/set-password` fires and clears cleanly; then (b) creating a scratch test identity in prod via `/admin/identities`, flipping the flag in Cloud Run's env (via Tofu or `gcloud run services update --update-env-vars`), signing in as the test identity from a separate browser, watching auth metrics for the first hour. Document the flip in `tasks/todo.md`.

- [ ] **T09: Author `POST /api/auth/password/set`.**
  - Two modes: first-set (no `currentPassword` required; the session must be `requires_password_setup`-flagged) and change-password (requires `currentPassword`; available to any authenticated session). Validates new password via `validateMinimum`. Calls GIP REST `accounts:update` with new password. Updates `identity_users.password_set_at`. Logs `password_set` audit event.
  - Acceptance: route test covers both modes; weak password 400; current-password mismatch 401; first-set called without the setup flag 403.

- [ ] **T10: Author `apps/portal-web/src/routes/(authed)/onboarding/set-password/+page.svelte`.**
  - Form: new password + confirm-new-password fields + strength meter. POSTs to `/api/auth/password/set`. On success, clears the `requires_password_setup` flag (via the session cookie's payload update or a session-refresh round-trip) and redirects to `redirectTo` from query string.
  - Acceptance: manual smoke covers the forced-redirect from `(authed)` layout + the post-set redirect.

- [ ] **T11: Wire the `requires_password_setup` flag into the session payload + the `(authed)` layout guard.**
  - Session payload addition: the JWT (or session cookie body) now carries `passwordSetupRequired: boolean`. Setting logic: `true` if `identity_users.password_set_at IS NULL` AND `FORCE_PASSWORD_SETUP_ENABLED` is true at session-mint time; `false` once a password is set OR the feature flag is off.
  - Layout guard: `apps/portal-web/src/routes/(authed)/+layout.server.ts` reads the flag; if true, redirects every route except `/onboarding/set-password` to that route.
  - Belt-and-suspenders: every authed RPC handler additionally checks the flag (cheap defence-in-depth against direct-POST bypass attempts).
  - Acceptance: manual smoke against (a) a freshly-admin-created identity with admin-set password — flag is FALSE, normal navigation; (b) an existing Google-sign-in identity at first sign-in after deploy — flag is TRUE, forced redirect; (c) the same identity AFTER setting a password — flag clears, free navigation.

### Phase 5: Tests, verification, ADR addendum, FU-14 closure

Acceptance: full test suite green; FU-14 marker flips to `[x]`; ADR 0006 carries the PR F addendum; CONTEXT.md and integration contract docs reflect the new auth method.

- [ ] **T12: Test suite — integration sweep.**
  - Run full `bun --filter '*' test` cycle. Add to `apps/portal-api/src/__tests__/auth-password-routes.test.ts` for the new auth surface. Add to `apps/portal-api/src/__tests__/admin-identities.test.ts` for the admin surface. End-to-end: admin creates `test@anywhere.com` via `/v1/identities`, signs in via `/api/auth/password/sign-in`, lands on dashboard, hits `loadFastAuthUser` from a fast surface — full chain green.

- [ ] **T13: ADR 0006 addendum.**
  - Append a 2026-MM-DD addendum to `docs/adr/0006-gip-only-auth.md` recording PR F as a usage expansion of GIP's existing email+password capability + linking back to this spec.

- [ ] **T14: CONTEXT.md update.**
  - Refresh the auth section to enumerate three methods (Google / OTP / Password) instead of two. Note the first-login forced-set flow.

- [ ] **T15: FU-14 closure.**
  - `tasks/todo.md` FU-14 marker flips `[ ]` → `[x]`. Done block cites this spec + the commits that landed each phase. The verification clause in the original FU-14 ("portal admin can create `test@anywhere.com` with a password; the new identity_users row carries `source = manual`, the email row carries `kind = personal`, and a fast sign-in attempt with that credential succeeds end-to-end through `loadFastAuthUser`") is now load-bearing — run that verification and record the result.

## Risks worth tracking

- **Aggressive-rollout UX hit at deploy.** Per §1, every existing user with `password_set_at = NULL` gets the forced-prompt on their next sign-in. That's ~100% of the user base at PR F deploy time. Mitigations: (a) `FORCE_PASSWORD_SETUP_ENABLED` feature flag — deploy schema + code without the prompt, flip the flag separately; (b) operator announcement in the project's normal comm channel before flag flip, so users aren't surprised; (c) the onboarding page copy clearly explains *why* the prompt is firing and that this is a one-time setup, not a hack or phish.
- **Credential-stuffing.** Password sign-in is the most-attacked auth method on any portal. The §4 rate-limit + lockout policy is the first line; the second is the existing audit log + Cloud Monitoring on the auth surface. Worth a watch-period after Phase 3 lands.
- **Forgot-password phishing.** The reset-link email is sent verbatim by GIP; the FROM address + template are not under portal's control. Spoofed phishing emails purporting to be reset links won't carry GIP's real reset token. The mitigation is user education — covered in CONTEXT.md.
- **Forced-set bypass via direct route navigation.** A user with `passwordSetupRequired = true` could theoretically POST directly to a non-onboarding route. The `(authed)` layout guard catches navigation but not direct POSTs — every authed route's RPC handler also checks the flag (cheap belt-and-suspenders). T11 enforces this.
- **Cross-app session implications.** Fast and heroes consume the portal session via `loadFastAuthUser` / `loadHeroesAuthUser`. The `authMethod = 'password'` value is new — verify neither app does anything role-dependent on this value (they shouldn't; they read sub/email/role from `/api/userinfo`).
- **Admin-side recovery for password-only identities.** Per §2, admin-created identities have `password_only_auth = TRUE`, which blocks both OTP and the forgot-password reset link. If the admin forgets the password they themselves set, the only recovery path is a separate admin-side "rotate this identity's password" action — **NOT in PR F's scope**. Carryover: tracked as a follow-up in `tasks/todo.md` (potential FU-30 or similar) for a future PR G. Until that lands, the operator workaround is direct GIP REST `accounts:update` with a new password (the `gip-admin.ts` helpers exist; only the UI affordance is missing).

## What's deliberately not in this plan

- **MFA, security questions, password history, age-out.** Listed under Out of scope; each is a possible follow-up if compliance ever demands.
- **Bulk admin-create from CSV.** Out of scope per above.
- **Disabling Google or OTP for a specific identity.** Out of scope per above.
- **A consolidated Spec 06 doc covering PR A–E.** Beyond Prior art's anchor table. Authoring that doc requires reverse-engineering five PRs from their code + tests + commit messages — large enough to be its own spec-authoring task, not bundled with PR F.

## Confidence in the plan

**Medium-high.** The structure mirrors Spec 05's worked example. The hard parts — GIP integration, RBAC middleware, audit logging, multi-email model — already exist; PR F mostly composes them. The two real unknowns are (a) the first-login flag's exact wire-shape (JWT field vs. session-store field) and (b) the lockout column's interaction with the existing OTP rate-limit logic. Both have proposed defaults in *Open questions* §1 + §4 above and resolve cleanly during implementation.
