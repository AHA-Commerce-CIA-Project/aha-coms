# Rev 3 — Spec 06: Dual-Email Auth (Workspace + Personal)

> Priority: **Critical-path. Must land before Heroes-side rev3 implementation begins.**
>
> Drafted: 2026-04-30. Owner: Mr. Door (solo). Implementation status: not started.
>
> Sequencing rule: portal-side full delivery (PRs A-E) → spec-update sweep (PR F, this spec set + spec-01, spec-03 cross-references) → pivot to Heroes-side rev3 implementation per `heroes-integration-handoff.md`.

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
      // 'sent' | 'rate_limited_email' | 'rate_limited_ip' | 'unknown_email'
  },
  (t) => [
    index('otp_request_log_email_time_idx').on(t.emailNormalized, t.requestedAt),
    index('otp_request_log_ip_time_idx').on(t.requestIp, t.requestedAt),
  ],
)
```

Cleanup cron prunes rows older than 24h.

### `auth_sessions` — column additions for Q6e/Q10 admin tooling

```diff
 export const authSessions = pgTable('auth_sessions', {
   // ... existing columns ...
+  authMethod: varchar('auth_method', { length: 20 }).notNull(),
+    // 'workspace_oidc' | 'personal_otp' | 'admin_bypass'
+  emailUsed: varchar('email_used', { length: 255 }),
+    // The specific email (workspace or personal) used to authenticate this session.
+    // Surfaced on admin user-detail (Q6e); never returned to user/H-apps (Q6a).
+  deviceLabel: varchar('device_label', { length: 255 }),
+    // From User-Agent at session creation, e.g. "Mac · Safari 18". For active-sessions panel (#10).
 })
```

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

### Workspace OIDC path (existing, behaviorally unchanged)

1. User clicks "Sign in with Google" on portal login page.
2. GIP redirect → token returned to portal.
3. Portal validates token, extracts `decoded.email`.
4. Portal looks up `identity_user_emails WHERE email_normalized = lower(trim(decoded.email)) AND kind = 'workspace' LIMIT 1`. (Replaces today's `identity_users WHERE email = decoded.email`.)
5. If found: continue session creation. If `verifiedAt IS NULL`, set it now (first successful login auto-verifies workspace email per Q4c).
6. If not found: 403 (matches today's behavior — pre-provisioned-only).
7. Session row inserted with `authMethod='workspace_oidc'`, `emailUsed=decoded.email`.

### Personal-email OTP path (new)

#### Request OTP (`POST /api/auth/otp/request`)

Body: `{ email: string }`

1. Normalize: `emailNormalized = lower(trim(email))`.
2. Rate-limit checks against `otp_request_log`:
   - Count rows for this `emailNormalized` in last 60 seconds. If ≥1, return 429 with `Retry-After: 60`.
   - Count rows for this `requestIp` in last 60 minutes. If ≥30, return 429.
3. Look up `identity_user_emails WHERE email_normalized = $1 AND kind = 'personal' AND verified_at IS NOT NULL LIMIT 1`.
4. If not found → log to `otp_request_log` with `outcome='unknown_email'` and **return 200 with the same response shape as success** (Q7g enumeration resistance). Do NOT send email.
5. If found:
   - Generate 6-digit numeric code: `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`.
   - Hash: `sha256(code).hex()`.
   - Invalidate any prior live row for this `emailNormalized`: `UPDATE otp_codes SET invalidated_at = now() WHERE email_normalized = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()`.
   - Insert new `otp_codes` row: `{emailNormalized, codeHash, expiresAt = now() + 10 minutes, attemptsRemaining = 5, requestIp}`.
   - Send email via Brevo: subject "Your COMS portal sign-in code", body containing the code and a "did not request? ignore" line. Template lives in `apps/api/src/services/mail/templates/otp.ts`.
   - Log to `otp_request_log` with `outcome='sent'`.
6. Response (always, success or unknown-email): `{ message: "If this email is registered, you'll receive a code shortly. The code is valid for 10 minutes." }`.

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
- Lists `auth_sessions WHERE identity_user_id = $self AND expires_at > now()`, showing `deviceLabel`, `authMethod`, `lastSeenAt`, ip-truncated.
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

1. Owner signs up at `brevo.com` with their personal email.
2. Adds a single sender (e.g., the owner's personal Gmail) — Brevo emails a verification link, click to confirm. No DNS edits.
3. Generates an API key in Brevo dashboard → Settings → SMTP & API.
4. Adds three secrets to GCP Secret Manager:
   - `coms-portal-brevo-api-key` — the API key
   - `coms-portal-brevo-from` — the verified sender address
   - (Optionally) `coms-portal-brevo-reply-to` — if different from `from`
5. Wires as Cloud Run env vars in `infra/cloud-run.tf` env block (same pattern as `DATABASE_URL`).
6. Cloud Run service account gets `roles/secretmanager.secretAccessor` on those secrets.

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

### PR A — Foundation (schema + auth-route refactor)

**Lands:** Direct push to `main` (or PR-with-self-merge if you want a CI gate).

**Includes:**
- Drizzle migration (one or two files):
  1. Create `identity_user_emails` table + indexes + GENERATED `email_normalized` column (hand-edit SQL body for the GENERATED expression; journal entry from `drizzle-kit generate`).
  2. Create `identity_user_emails_history` table + DELETE trigger on `identity_user_emails`.
  3. Backfill: insert rows from existing `identity_users.email` (kind based on `hasGoogleWorkspace`, addedBy='backfill') and existing `identity_users.personal_email` (kind='personal', addedBy='backfill'), all with `verifiedAt = NOW()` and `isPrimary = true` for the workspace row (or for the personal row in `hasGoogleWorkspace=false` rows).
  4. Drop `identity_users.email` and `identity_users.personal_email` columns.
- Refactor `apps/api/src/routes/auth.ts` lookup (line 164-165) to query `identity_user_emails`.
- Refactor `apps/api/src/routes/userinfo.ts` to read primary email per Q8a precedence.
- Refactor OIDC token issuance path to derive `email` claim per Q8a.
- Update `coms-shared` to v1.5.0 with new `emails` array on `UserProvisionedPayload`. Push, tag, swap `apps/web/package.json` git URL pin.
- Update `apps/api/src/services/employee-import.ts` to write through `identity_user_emails`.
- Update `apps/api/src/services/employee-info-sync.ts` to write through `identity_user_emails`.
- Update `createEmployee` service in `apps/api/src/services/employees.ts`.

**Verification:** existing Workspace-email login still works post-deploy. (Behavior unchanged from user perspective.)

**Risk:** schema migration on prod with no staging. Mitigation: backfill is idempotent (UPSERT on email_normalized); migration is reversible by dropping tables (the column drop in step 4 is the destructive step — split into a follow-up migration if you want a soak window).

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

Before starting PR A in a clean session, verify:

- [ ] `coms-shared` repo is reachable; the version-bump + push pattern is understood (per `feedback_drizzle_migrations.md` — but specific to npm/git+url pinning, not Drizzle).
- [ ] Brevo account exists with verified single-sender (dev posture).
- [ ] Three Brevo secrets in GCP Secret Manager.
- [ ] CLAUDE.md rule on Drizzle migrations (`drizzle-kit generate` for journal, hand-edit SQL body if needed) is understood.
- [ ] Hybrid push plan from Heroes side (PR-with-self-merge for security-sensitive PRs B, C, E#11; direct push for the rest) carries over.
- [ ] No staging exists for portal — prod-direct deploys are the rule.

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
