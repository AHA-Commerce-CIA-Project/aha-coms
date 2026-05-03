# Rev 3 — Spec 00: Implementation Timeline

> Coordination plan for Rev 3 specs. Rev 3 is the **suite-UX hardening pass** that turns the federation from "SSO works" into "the apps feel like one product."
>
> **Last updated:** 2026-05-03
> **Prerequisites:** Rev 2 closed end-to-end (RS256/JWKS, OIDC discovery, webhook + introspect via Google OIDC). Identity ownership is now firmly in the portal; Rev 3 builds the user-facing surface that makes that ownership visible.

---

## Status — 2026-05-03 (Specs 01 + 02 + 03 + 03b + 03c + 06 portal-side shipped end-to-end including Spec 06 PR F spec-sweep; Spec 02 Phase 4 Heroes adoption shipped; **Heroes-side rev3 adoption now unblocked — next focus**)

Portal/COMS team landed Specs 01 + 02 (Phases 1 + 2 + 3) + 03 (portal-side, all twelve effects) end-to-end on 2026-04-28; Spec 03b test-gate cleanup followed on 2026-04-29 (locally green); Spec 03c pre-Spec-4 hardening shipped 2026-04-29; Spec 02 Phase 4 (primitives lift) shipped portal-side 2026-04-29 and Heroes-side 2026-04-30 — the round-trip is complete and `@coms-portal/ui v1.2.0` is now the single source of truth for primitives across both consumers. Phase 5 (onboarding exercise) and Specs 04/05 remain deferred.

**Shipped (public GitHub repos, consumed via `git+url`):**

| Package | Version | Repo |
|---------|---------|------|
| `@coms-portal/design-tokens` | v1.0.0 | https://github.com/mrdoorba/coms-design-tokens |
| `@coms-portal/ui` (chrome only) | v1.0.0 | https://github.com/mrdoorba/coms-ui |
| `@coms-portal/account-widget` | v0.1.0 | https://github.com/mrdoorba/coms-account-widget |
| `@coms-portal/shared` (+ Spec 03 events + 03c APP_LAUNCHER deprecation) | v1.4.1 | https://github.com/mrdoorba/coms-shared |
| `@coms-portal/sdk` (Spec 03c integrator surface — verifyBrokerToken, verifyWebhookSignature, resolveAlias, introspectSession, getAuditLog) | v0.1.1 | https://github.com/mrdoorba/coms-sdk |

Portal `apps/web` is migrated and dogfooding all four (consuming via `git+https://...#vX.Y.Z`); portal `apps/api` exposes `GET /api/userinfo` and OIDC RP-initiated logout (`GET /api/auth/logout`), both with `app_registry.url` origin allowlist (post-deprecation filter, post red-cell sweep).

**Spec 03 portal-side shipped (2026-04-28):** alias layer (`user_aliases` with Postgres `GENERATED ALWAYS AS` for `alias_normalized`, `alias_collision_queue`, alias service with two-step rename and Levenshtein-or-token-set collision detection, `POST /api/aliases/resolve-batch` with per-app token-bucket rate limiting, `alias.resolved` / `alias.updated` / `alias.deleted` webhooks, admin collision queue UI at `/admin/aliases`); per-app config (`app_manifests`, `app_user_config`, `bulk_edit_locks`, manifest validation service with Heroes seed registered at boot, default config seeded inside the `createEmployee` transaction, `app_config.updated` webhook with per-app slice filtering, `GET /api/users/:portalSub/config/:appId`, admin app-config UI at `/admin/app-config` with single edit + selection-bulk + CSV-bulk preview-then-commit + `bulk_edit_locks` enforcement); inbound app SA token middleware (`requireAppToken`); gated `REVOKE` migration prepared at `apps/api/src/db/migrations/cutover/0001_revoke_heroes_writes.sql` with cutover runbook, NOT auto-applied. `user.provisioned` payload extended with optional per-recipient `appConfig` slice — additive, no consumer breakage. Mission artefacts at `.nelson/missions/2026-04-28_050010_1b5c498e/`.

**Spec 03b test-gate cleanup — shipped 2026-04-29.** Resolution turned out to be entirely Bun `mock.module` cross-file contamination (every failing file passed in isolation), not real fixture bugs. One PR, one new shared test helper at `apps/api/src/test-helpers/schema-barrel-mock.ts`, snapshot+restore pattern adopted across 8 test files, and an `OAuth2Client.prototype` patch replacing a vendor-SDK module mock. Local: 261 pass / 0 fail / 0 typecheck errors. CI deploy gate expected to clear on the next push to `main`. Canonical pattern enforced via `.codebase-memory/adr.md` §7. See `spec-03b-test-gate-cleanup.md` §"Outcome" for the full diff.

**Spec 03c pre-Spec-4 hardening — shipped 2026-04-29.** Eleven work items across six effects, two missions (main + follow-on), eight commits on `main`, two sibling public repos. Portal foundation: centralised origin/CORS config (`apps/api/src/config.ts` + `apps/web/src/lib/config.ts` via `$env/dynamic/public`), CI hardcoded-URL gate (`.github/workflows/lint.yml`), webhook DLQ docstring reconciliation. Observability: Pino structured logging across all 49 console.* sites (zero remaining), request-ID middleware (UUID-validated inbound, response header on success and error, propagated to webhook outbound + Cloud Tasks payload + redelivery handler), real `/api/health` probing DB + Secret Manager + Cloud Tasks. Audit log: schema migration `0028_little_deadpool.sql` adds `actor_ip` + `request_id` + `actor_app_id` + `target_app_id` (all nullable) + two composite indexes; writer extended; all 28 call sites populated; 12 enumerated app-scoped sites populate `target_app_id`. Integrator pathway: `@elysiajs/swagger` plugin at `/api/openapi.json` + `/api/docs`, response schemas on 7 integrator-relevant routes; new `@coms-portal/sdk` v0.1.1 (five exports, framework-neutral, ESM, jose-only); broker-token middleware + tenant-scoped `GET /api/v1/audit-log` (OR-bounded predicate `actor_app_id OR target_app_id`, `actor_ip` excluded from SELECT, cursor pagination, cross-tenant leak test); launcher migration (chrome reads `/api/userinfo` via SSR, `APP_LAUNCHER` zero hits in `apps/web/src/`); `@coms-portal/shared` v1.4.1 deprecation shim; `docs/architecture/integrator-quickstart.md`. Domain flip to `coms.ahacommerce.net` is now a config change. Red-cell findings F-1 (UUID validation) and F-2 (error-response correlation header) closed in mission; F-3 (SDK JWKS shared cache) closed in follow-on as v0.1.1; F-4 (Postgres integration test fixture) deferred to Spec 4. Mission artefacts at `.nelson/missions/2026-04-29_024712_fd19ceb1/` and `.nelson/missions/2026-04-29_044152_ff8f84c1/` (gitignored). See `spec-03c-pre-spec-4-hardening.md` §"Shipped state" for the full deviations + follow-up table.

**Spec 06 portal-side shipped end-to-end (2026-04-30 → 2026-05-03), including PR F spec-update sweep.** Dual-email auth (workspace-OIDC + personal-email-OTP) is live in production: `identity_users.email` and `personal_email` columns dropped in favour of multi-row `identity_user_emails`; portal-native opaque-UUID `auth_sessions` replacing the GIP session-cookie vehicle (GIP narrowed to OIDC verifier role); OTP service backed by Brevo SaaS; login/profile/admin UI rewritten; admin sign-out-everywhere + user-facing active-sessions panel + super-admin one-time login link extras shipped; 401-as-500 onError fix folded into PR E. PR-by-PR: A (foundation, `049008d`, 2026-04-30), B1 (OTP infra code, `6938553`, 2026-05-01), B2 (Brevo wiring, `ac2f905`, 2026-05-01), C (login surfaces, `df1c90c` + `6f96634`, 2026-05-01), D (profile + admin email management, `a684fa9`, 2026-05-01), E (extras + onError fix, `212e103`, 2026-05-03 — CI run `25265594527`). `super_admin` stays portal-internal: `coms-shared` `PORTAL_ROLES` remains `['employee', 'admin']` (no v1.6.0 bump); `@coms-portal/shared` is at v1.5.0 with the additive `emails: UserEmailEntry[]` field on user-provisioning payloads. PR F (spec-update sweep, commit `8f13c64`, 2026-05-03) closed the rev3 doc loop — touched `spec-06`, `spec-01`, `spec-03`, `spec-03c`, `heroes-integration-handoff`, and this timeline.

**Heroes-side rev3 adoption is now unblocked (Spec 06 PR F shipped 2026-05-03 — commit `8f13c64`).** Heroes-side adoption per `heroes-integration-handoff.md` (Specs 01 + 02 chrome migration) and §Appendix A of `spec-03-user-identity-alias-layer.md` (rename `users` → `heroes_profiles`, drop role/eligibility columns, ingestion rewrite via `POST /api/aliases/resolve-batch`, alias + user-config caches, webhook consumers, audit log, wipe-and-reprovision cutover) is the next focus. Heroes is pre-real-users — wipe-and-reprovision (vs. data-preserving alias backfill) is the locked path. Heroes consumer compiles unchanged against `@coms-portal/shared` v1.5.0 — the `emails` field is additive.

Specs 02 (Phases 4+5), 04, 05 remain deferred until their triggers fire — see each spec's §Why this is deferred.

---

## Theme of Rev 3

Rev 1 hardened the federation. Rev 2 removed shared secrets. Rev 3 closes three gaps that follow from a working SSO:

1. **The user-experience gap.** A user landing in Heroes (or any future H-app) has no way to reach `/profile`, no account menu, no app switcher, and no consistent sign-out path. The fix (Spec 01) is the same pattern Google (OneGoogle/gbar), Microsoft (M365 suite header), and AWS (Identity Center menu) converged on: a shared account widget every app embeds, driven by props.
2. **The identity-writer gap.** Rev 2 made the portal the sole *authenticator* of users. It did not make the portal the sole *writer*. Heroes' sheet ingestion can still implicitly mint user records — fine pre-real-users, catastrophic the moment real customers arrive. Spec 03 closes this by establishing portal as sole writer of `identity_users`, adding a portal-owned alias layer for name-based resolution, and locking down writes at the DB-role level.
3. **The auth-population gap.** Rev 2 + Spec 01 + Spec 03 assume every user has a Google Workspace email. Two real populations are blocked: employees without a Workspace seat (contractors, casual hires) and Workspace employees who want to also access via their personal email (Gmail or any other provider). Spec 06 closes this by adding an OTP path for any email provider, restructuring identity emails into a multi-row table, and standing up outbound mail (Brevo).

After Rev 3, identity is *centrally owned* (Rev 2), *centrally surfaced* (Spec 01), *centrally written* (Spec 03), and *flexibly authenticated* (Spec 06) — one place creates users, one component surfaces them, the database enforces sole-writer, and any email provider can carry an auth.

---

## Specs

| Spec | Title | Owner | Effort | Heroes-side work? | Critical path? |
|------|-------|-------|--------|-------------------|----------------|
| 00 | Implementation Timeline (this doc) | Portal | — | — | — |
| 01 | Shared Account Widget | Portal | Medium | Yes — H1 (adoption) | Yes — UX surface |
| 02 | Design System (skeleton + spec) | Portal + Heroes | Phases 1+2+3 done portal-side (2026-04-28); Phase 4 shipped end-to-end 2026-04-29 portal-side + 2026-04-30 Heroes-side (primitives, compositions stub); Phase 5 deferred | ✅ Phase 4 Heroes adoption shipped 2026-04-30 (commit `b7b7431`); Phase 2/3 still pending | No — deferred until trigger |
| 03 | User Identity Ownership & Alias Layer | Portal + Heroes | Portal-side shipped 2026-04-28 (twelve effects on `main`); test-gate cleared 2026-04-29 (Spec 03b) | Yes — H1 (rename, ingestion rewrite, caches, webhook consumers) | **Yes — must land before real users** |
| 03b | Spec 03 Test-Gate Cleanup | Portal | Shipped 2026-04-29 — single PR; root cause was Bun mock-pollution, not real fixture bugs | No | Resolved |
| 03c | Pre-Spec-4 Hardening (launcher migration, observability, SDK extraction) | Portal | Queued — ~3 days | No (Heroes consumes new SDK in a follow-up) | **Yes — blocks Spec 4/5 debugging** |
| 03d | Deferred Hardening Backlog (Redis, staging, per-tenant keys, KMS encryption, audit Cloud Logging sink, OTel, canary, feature flags, etc.) | Portal | 11 items, ~13–18 days total if every item ships | No | No — each item ships on its own trigger |
| 04 | Unified User Preferences (theme + locale) | Portal + every H-app | Small per phase | Yes — Phase 3 (preference consumption) | No — deferred until trigger |
| 05 | Suite Search / Command Palette | Portal + every H-app | Medium per phase | Optional — Phase 3 (search provider) | No — deferred until trigger |
| 06 | Dual-Email Auth (workspace OIDC + personal OTP) | Portal | PRs A → F shipped 2026-04-30 → 2026-05-03 (commits `049008d`, `6938553`, `ac2f905`, `df1c90c`+`6f96634`, `a684fa9`, `212e103`, `8f13c64`). | Minimal — Heroes compiles unchanged against `@coms-portal/shared` v1.5.0; no required Heroes work for v1 | **Yes — gated Heroes-side rev3 adoption; gate cleared 2026-05-03** |

Specs 01 + 03 + 06 are the load-bearing trio for Rev 3 closure: 01 surfaces identity, 03 hardens who can write it, 06 widens who can authenticate. Specs 02, 04, 05 are full architecture decided + deferred until their trigger conditions fire (documented in each spec's §Why this is deferred).

---

## Heroes scope at a glance

Every Rev 3 spec touches Heroes eventually, but only Specs 01 + 03 are scheduled now. The rest are decided-and-deferred until their trigger fires.

| Spec | Heroes work | Effort (Heroes) | When | Trigger |
|------|-------------|-----------------|------|---------|
| 01 | Adopt `@coms-portal/account-widget`; refactor `ServiceBar` / `MobileTopBar` to mount the widget in the right slot; remove existing avatar dropdown + sign-out button | ~1 week | **Now** (parallel with Spec 03) | Scheduled |
| 02 | Phase 1: nothing (done portal-side). Phase 2+: consume `@coms-portal/design-tokens` Tailwind preset (still pending — Heroes' own app.css owns tokens locally); Phase 3: migrate chrome to `@coms-portal/ui/chrome` (pending); Phase 4: ✅ shipped 2026-04-30 — `commit b7b7431` deleted Heroes' local `packages/web/src/lib/components/ui/*` (103 files, 2,276 lines) and rewired all 24 importers to `@coms-portal/ui/primitives` | **Phase 4 SHIPPED 2026-04-30** | Spec 02 Phase 4 round-trip complete |
| 03 | Rename `users` → `heroes_profiles`; drop all user-creation paths; ingestion rewrite (resolve-batch + pending queue + audit log + alias_cache); webhook consumer; DB-role REVOKE | ~2 weeks engineering + portal cutover coordination | **Now — critical-path** | Must land before real users |
| 04 | Read `coms_prefs` claim from ID token; apply theme + locale on render; remove Heroes' standalone theme toggle (widget popover from Spec 01 owns it) | ~½ day | **Deferred** | 3rd H-app onboards, drift report, or Spec 02 Phase 2+ ships |
| 05 | Register Heroes searchables (heroes, courses, cohorts) with portal search registry; expose `POST /search/provider` endpoint | ~1 day | **Deferred (optional)** | N > 6 apps, first cross-app search request, or Heroes ops asks |
| 06 | Heroes consumes `userinfo.email` (scalar) — no widget-side change. Per Q8e Heroes mirrors primary email only on `heroes_profiles`; `emails` array fetched directly from `/api/userinfo` only if Heroes ever ships a "show all my login methods" UI (no v1 use case) | ~0 (no required Heroes work for v1) | **N/A** | Heroes-side rev3 (Specs 01 + 02 + 03) unblocked 2026-05-03 — Spec 06 PR F shipped |

**Wall-clock — what shipped and what remains:**

- **2026-04-28 (single session):** Spec 03 portal-side built end-to-end — twelve effects across alias layer, per-app config, admin UIs, webhooks, gated REVOKE migration. Merged to `main` as commits `b6e3bd1` through `e296ab5` (Mr. Door commit format), with a follow-up svelte-check fix at `b407682` and Spec 03b doc at `7f059fa`.
- **2026-04-29 — Spec 03b shipped:** CI test gate cleared. Single PR — diagnostic work showed every failing file passed in isolation, so the planned Class A/B/C three-PR phasing collapsed once the dominant root cause (Bun `mock.module` cross-file contamination) was identified. New shared helper at `apps/api/src/test-helpers/schema-barrel-mock.ts`; snapshot+restore mock-isolation pattern adopted across 8 test files; `OAuth2Client.prototype.verifyIdToken` patched directly in the verifyGoogleIdToken test. 261 pass / 0 fail / 0 typecheck errors. Pattern enforced via `.codebase-memory/adr.md` §7.
- **2026-04-29 — Spec 02 Phase 4 shipped portal-side:** `@coms-portal/ui v1.2.0` published with 15 shadcn-svelte primitive families (button, badge, card, label, input, textarea, separator, skeleton, table, avatar, tabs, dialog, dropdown-menu, select, sheet) lifted from Heroes verbatim. New direct deps: bits-ui, clsx, tailwind-merge, tailwind-variants, lucide-svelte. Portal `apps/web` second-consumer adoption across all 13 admin pages — trigger fired by portal itself. Compositions deliberately stub. Mission artefacts at `.nelson/missions/2026-04-29_094141_e71c70c4/`.
- **2026-04-30 — Spec 02 Phase 4 round-trip complete (Heroes adoption + portal employees-list follow-up):** Heroes adopted v1.2.0 — 24 files rewritten to flat `@coms-portal/ui/primitives` imports, namespace-style usage flattened, `PullToRefresh.svelte` moved out of `ui/`, `cn()` + four type helpers stripped from Heroes' `utils.ts`, local `ui/` directory deleted (103 files, 2,276 lines net) — `commit b7b7431` on `mrdoorba/coms-aha-heroes`. Fork risk between Heroes' local primitives and the platform package permanently closed. Portal `admin/employees/+page.svelte` (the one out-of-scope file from the main mission) refactored — `commit 8b2d476` on `coms_portal`. `coms-ui` ONBOARDING.md Step 4a documents the canonical `<span>` inside `<SelectTrigger>` pattern — `commit 6f7f8c2`. See `.nelson/missions/2026-04-29_094141_e71c70c4/followup.md`.
- **2026-04-30 — Design-system contribution guide shipped:** new `DESIGN_SYSTEM.md` at the repo root (portal + Heroes mirror) — canonical contribution guide for the COMS design system. Decision tree (token / primitive / chrome / widget / app-local), local-dev loop with `file:` refs, PR workflow + reviewer expectations, semver rules, forbidden patterns, discussion cadence. Pointer stubs (`CONTRIBUTING.md`) shipped in the three sibling shared-package repos: `coms-ui` (`commit 77aeb44`), `coms-design-tokens` (`commit 48120af`), `coms-account-widget` (`commit de0c412`). Hand `DESIGN_SYSTEM.md` to any team consuming the design system — Heroes today, future H-apps tomorrow.
- **2026-04-30 — Spec 06 drafted:** Planning conversation produced `spec-06-dual-email-auth.md`. Eleven decisions locked (auth mechanism: OTP; schema: multi-row `identity_user_emails`; email provider: Brevo; admin allowlist semantics; collision rules; session model; OTP service mechanics; OIDC + webhook wire format additions; UI scope = surfaces 1-7+9+10+11; PR sequencing A-F prod-direct; testing scope: migration + OTP + auth-route + webhook coverage). Heroes-side rev3 adoption paused pending Spec 06 PR F landing.
- **2026-04-30 — Spec 06 PR A shipped (commit `049008d`):** Portal-side foundation. `identity_users.email` and `identity_users.personal_email` dropped; multi-row `identity_user_emails` table live (kind discriminator `'workspace' | 'personal'`, per-row `verifiedAt`, `addedBy` provenance, tombstone trail `identity_user_emails_history`). Session vehicle pivoted from GIP-managed encrypted-JWT cookie to portal-native opaque-UUID cookie backed by `auth_sessions`. GIP narrowed to OIDC-verifier role (`verifyIdToken` only); `resolveAndSyncClaims` deleted; claims now compute from DB per-request via `resolveAuthUser`. `/api/userinfo` adds additive `emails: UserEmailEntry[]` array; scalar `email` derived (workspace > personal-primary > first-personal). Webhook payloads (`user.provisioned`, `user.updated`) carry additive `emails` field via `@coms-portal/shared` v1.5.0 — existing Heroes consumer compiles unchanged. Bootstrap-admin seed script added for disaster recovery. Workspace OIDC Q-mismatch guard returns 403 `WRONG_LOGIN_PATH` when Google verifies an email registered as `kind='personal'`.
- **2026-05-01 — Spec 06 PR B1 shipped (commit `6938553`):** OTP infrastructure code-only. Drizzle migration `0030_famous_pretty_boy` adds `otp_codes` (SHA-256-hashed code, 10-min TTL, single-use, max 5 attempts, per-email cooldown 60s, per-IP cap 30/hr), `otp_request_log` (rate-limit ledger, written on every outcome including 429s), `one_time_login_links` (deferred E-PR schema landed early). Three-mode mail service `apps/api/src/services/mail/index.ts` (`stdout|brevo|memory`) with hard-fail-in-prod guard on `stdout` and lazy Brevo SDK import. `services/otp.ts` exposes `requestOtp`/`verifyOtp` returning discriminated-union outcomes (`'sent' | 'rate_limited_email' | 'rate_limited_ip' | 'unknown_email' | 'wrong_login_path'`). Routes `POST /api/auth/otp/{request,verify}` + OIDC-protected `POST /api/internal/cleanup/otp` for nightly cleanup. Cloud Scheduler job at 03:17 UTC declared in `infra/cloud-scheduler.tf` (apply deferred — see B2 fixups). 363 tests pass.
- **2026-05-01 — Spec 06 PR B2 shipped (primary commit `ac2f905`):** Brevo SaaS wired through Terraform + CI, full curl smoke test green (`POST /api/auth/otp/request` → email delivered from `handers.the@ahacommerce.net` to a personal Gmail → `POST /api/auth/otp/verify` returns 200 with opaque-UUID `__session` cookie matching the new `auth_sessions` row). Final shape deviates from spec-06's earlier "three secrets" wording — only the API key is a real secret. One Secret Manager entry `coms-portal-brevo-api-key` populated manually via `gcloud secrets versions add`; `BREVO_FROM` lives as plain Cloud Run env from `var.brevo_from`; `BREVO_REPLY_TO` deferred until DNS for `ahacommerce.net` lands. `MAIL_TRANSPORT` and `BREVO_FROM` driven by GitHub Actions repo vars passed as `-var=` flags in `deploy.yml`. Dynamic env block on `BREVO_API_KEY` so Phase 1 (transport=stdout, secret resource present but unpopulated) still applies cleanly. Boot-time guard in `mail/index.ts` hard-fails if `MAIL_TRANSPORT=brevo` and either `BREVO_API_KEY` or `BREVO_FROM` is missing. Four unblock-fixups landed alongside: `e947778` bumped google provider `~> 6.0` → `~> 7.0` to match a previously-drifted lock; `cdd4578` populated cross-platform hashes in `.terraform.lock.hcl` (CI runners are linux); `a284ef8` added `roles/cloudscheduler.admin` for the GitHub Actions WIF SA (PR B1's `cloud-scheduler.tf` had never actually applied due to lock drift, so the missing grant only surfaced when B2 finally got past validate); `0b03bbf` patched `apps/api/scripts/seed-admin.ts` to insert a `kind='personal'` row when the workspace identity already exists and `BOOTSTRAP_ADMIN_PERSONAL_EMAIL` is set (the original idempotency check returned early before reaching the personal-email branch).
- **2026-05-01 — Spec 06 PR C shipped (primary commit `df1c90c`, build fixup `6f96634`):** Login surfaces. `apps/web/src/routes/login/+page.svelte` rewritten as a 3-step component (`step = 'choose' | 'email' | 'otp'`) keeping the existing card chrome (StarField, glow, fade-in, AHA logo). Choose step shows two stacked equal-weight buttons (Continue with Google + Sign in with email); the legacy Firebase email+password form is removed and `/forgot-password` deleted (Firebase password identities are off-mission post-Q1-session). OTP entry uses a single 6-digit `<input inputmode="numeric" autocomplete="one-time-code" pattern="\d{6}" maxLength=6>` with letter-spacing/tabular-nums styling, strip-non-digits-live, auto-submit at length 6. Hybrid resend countdown (60s frontend timer + backend `Retry-After` authoritative). WRONG_LOGIN_PATH renders inline with a Switch-to-Google CTA. INVALID_OR_EXPIRED swaps message at `attemptsRemaining=0`; INACTIVE_USER disables verify and resend. Single shared `loading` flag; `completeLogin()` helper unifies post-auth handoff for both Google and OTP paths. New `apps/web/src/routes/login/+page.server.ts` redirects already-authed visitors via same-origin `fetch('/api/auth/me')` + `redirect(303, ?redirect ?? '/')`. Typed `requestOtp`/`verifyOtp` wrappers in `apps/web/src/lib/auth.ts` use plain `fetch` (Eden treaty's tagged-union narrowing of the `Retry-After` header was awkward). **Build fixup `6f96634`:** the initial commit imported `validateSession` from `~/services/auth` directly into `+page.server.ts`, which dragged the drizzle/db chain into a per-route SSR chunk and broke `vite-plugin-sveltekit-compile.writeBundle` under bun-rollup with `TypeError: undefined is not an object (evaluating 'raw.includes')` — a build-only failure that survived `bun run typecheck` (which does not exercise the SSR chunk renderer). Reproduced locally with `docker build --target web-build`, fixed by routing through SvelteKit's same-origin `fetch` instead. Lesson logged: per-route server modules must not import server services that pull drizzle. No automated tests (per Q11 testing scope §Login surfaces); 6 of 12 manual smoke items locally verified, items 2/3/4/5/6/8 flagged owner-side against deployed Cloud Run.
- **2026-05-01 — Spec 06 PR D shipped (six-slice chain `7ace00d → b63c7f8 → 5df8250 → 1b831f3 → 9d3d539 → a684fa9`):** Self-service `/api/me/emails` (POST/PATCH/DELETE + verify + resend) backed by `services/me-emails.ts` with privacy-preserving collision (flat `EMAIL_IN_USE` — never reveals owner) and last-verified-email + workspace-kind-forbidden guards. Admin `/v1/employees/:id/emails` (POST/PATCH/DELETE) backed by `services/admin-emails.ts` with collision-reveals-target (`collisionUserId` + `collisionUserName`), four new audit-log actions, and `user.updated` fanout. OTP gatekeeper widened by single `template?: 'login' \| 'verify_personal_email'` parameter on `requestOtp` rather than a forked binding-OTP service; `verify-personal-email.ts` mail template added. `/api/userinfo` carries new `emailId` per row via `getEmailEntriesWithIds()` (webhook `UserEmailEntry` shape stays id-free). Profile UI rewritten with email-list section + add-personal-email modal (single 6-digit input, auto-submit, hybrid 60s resend, defense-in-depth identity check at verify). Admin user-detail extended with email-list card; orphan post-PR-A no-op personal-email inline-edit removed; new-employee form `email` → `workspaceEmail` rename completes API alignment; workspace-upgrade button rerouted from defunct `updateEmployee({email})` to dedicated `POST /:id/upgrade-workspace`. CSV import gains optional `Personal Email` column; collisions land in `flagged[]` with `collisionKind: 'email_collision' \| 'name_collision'` discriminator; preview UI links email-collisions to the colliding user's admin detail page. 70 tests green per-file (otp 17/17, me-emails 16/16, admin-emails 11/11, employee-import 3/3, employee-import-collisions 4/4, userinfo 19/19); `svelte-check` clean. CI run `25219023046` ✓; deploy revision `coms-portal-app-00142-fr8`. Routes split into dedicated `routes/me-emails.ts` to avoid colliding with `userinfo.test.ts`'s authPlugin stub at module-load time.
- **2026-05-03 — Spec 06 PR E shipped (commit `212e103`, CI run `25265594527`):** Extras — sign-out-everywhere (#9), active-sessions panel (#10), super_admin one-time login link (#11; `portalRole` enum extended in this PR). Incidental fix folded in: global error handler now returns 401 (was 500) for `throw status(401, ...)` from `authPlugin` — fix covers every `/api/v1/*` and `/api/me/*` route. `/api/userinfo` was unaffected (uses `set.status = 401` directly).
- **2026-05-03 — Spec 06 PR F shipped (commit `8f13c64` + post-merge follow-up):** Spec-update sweep across this doc + spec-01 + spec-03 + spec-03c + spec-06 + heroes-integration-handoff. Marks Spec 06 SHIPPED end-to-end. Heroes-side rev3 adoption now unblocked.
- **Next — Heroes-side rev3 adoption (Specs 01 + 02 chrome + 03 cutover):** Unblocked 2026-05-03. Plan from 2026-04-30 grilling: 5-PR slicing for Heroes (chrome migration → Deploy A schema rename + tables → Deploy B truncate runbook → Deploy C REVOKE → doc-sync + secrets cleanup); hybrid push (direct push for safe surfaces, PR-with-self-merge for spec-03 Deploy A schema, manual ops for truncate + REVOKE); two-database-one-instance Cloud SQL setup retained for cutover dry-run on staging before prod.
- **Rev 3 closes** when spec-00 §Success Criteria are green: widget renders identically in portal + Heroes from one package version; Heroes' DB role cannot write `identity_users`; sheet ingestion mints zero new user rows; non-Workspace users can authenticate via personal-email OTP; Workspace users can self-bind a personal email and log in via either path.

No fixed dates — gated by team capacity, not calendar. Specs 02 / 04 / 05 sit on the shelf with full architecture pre-baked; spinning one up is a "trigger fires → start phase plan" decision, not a re-design.

---

## Team split + handoffs

Concrete team breakdown for the scheduled work (Specs 01 + 03). Spec 02 Phase 1 already shipped portal-side; Specs 04 and 05 deferred.

### Portal team builds

**Spec 01 — Widget**
- Package `@coms-portal/account-widget` (Svelte 5 component + store), publish as a standalone GitHub repo, semver-tagged.
- New endpoints: `GET /api/userinfo` (widget data source), RP-initiated OIDC logout (`/api/auth/logout` with `id_token_hint`).
- Portal `apps/web` adopts the widget itself before Heroes touches it (dogfood).

**Spec 03 — Alias layer**
- Schema: `user_aliases`, `alias_collision_queue`, `alias_normalized` trigger, partial-unique on `is_primary`.
- API: `POST /api/aliases/resolve-batch` (1000 names/req, 20 RPS, burst 40, 4 parallel).
- Webhook fan-out: `alias.resolved` / `alias.updated` / `alias.deleted` riding existing Rev 2 Spec 03 delivery + DLQ.
- Admin UI: collision queue, manual resolve, merge/reject buttons; `blocked_app_rows` aggregator that polls each H-app's queue-stats endpoint.
- One-shot backfill seed script (consumes Heroes' CSV export) + DB-role REVOKE migration.

### Heroes team builds

**Spec 01 — Widget adoption**
- `bun add @coms-portal/account-widget`; mount in `ServiceBar.svelte` + `MobileTopBar.svelte` right slot.
- Remove existing avatar dropdown, sign-out button, and any userinfo fetching the widget now owns.

**Spec 03 — Ingestion rewrite**
- Rename `users` → `heroes_profiles` (pure rename, FK stays).
- Drop every user-creation code path (auto-provision on first login, admin imports, signup endpoints).
- Build: resolve-batch caller, `pending_alias_resolution` queue + drainer, `alias_cache` (full resolve response — `tombstoned` + `deactivated_at` included, not just `portal_sub`), `deactivated_user_ingest_audit` writer, webhook consumer for all three alias events, `GET /internal/alias-resolution/queue-stats` endpoint for portal to poll.
- One-time CSV export of distinct production `users.name` strings for the seed (`user_id, name`).

### Independence + handoff blockers

**Build phase: independent.** Spec 01 and Spec 03 touch different surfaces (UX vs identity writer). Inside each spec, both teams can work in parallel — Heroes can develop against a stub widget / a staging alias API while portal builds the real thing. Cross-spec: none. Spec 01 ↔ Spec 03 only intersect at the `is_primary` rename gap (Heroes follow-up F — widget falls back to `ORDER BY created_at DESC LIMIT 1`).

**Sequence blockers** (handoff points, not build-time dependencies):

| # | Blocker | Who blocks whom | Mitigation |
|---|--------|----------------|-----------|
| B1 | Portal must publish widget v0 before Heroes can integrate end-to-end (Spec 01) | Portal → Heroes | Heroes mounts a stub during dev; swaps to the real package on publish |
| B2 | Heroes must hand over the `users.name` CSV before portal can seed aliases (Spec 03 cutover step 3) | Heroes → Portal | Heroes runs export anytime in week 1; portal validates dedup pre-seed and aborts on duplicate `alias_normalized` across distinct `portal_sub`s |
| B3 | Portal seed must complete + Heroes reconciliation must pass before Heroes flips `INGESTION_USE_ALIAS_API=true` (Spec 03 cutover step 4) | Portal → Heroes | Freeze window target <2h; reconciliation query is automated, not manual |
| B4 | Heroes must verify dual-mode flip is healthy before portal runs DB-role REVOKE (Spec 03 cutover step 5) | Heroes → Portal | 24–72h soak between Deploy B and Deploy C |

If any blocker slips, the side waiting can keep working on the other spec — they're independent.

---

## Order and Dependencies

```
Rev 2 Spec 04 (introspect OIDC) ──→ Rev 3 Spec 01 (account widget)
                                    widget calls portal userinfo via OIDC
                                    introspect path; no new auth surface needed

Rev 2 Spec 03 (webhook delivery) ──→ Rev 3 Spec 03 (alias.resolved webhook
                                     reuses existing delivery + DLQ infra)

Specs 01 + 03 (shipped portal-side) ──→ Spec 03c (pre-Spec-4 hardening:
                                          launcher migration, observability,
                                          @coms-portal/sdk, integrator quickstart)
                                          ──→ Spec 06 (dual-email auth:
                                                identity_user_emails multi-row,
                                                OTP, Brevo)
                                          ──→ Heroes-side rev3 adoption
                                          ──→ Specs 4, 5 (when their triggers fire)
```

Spec 01 and Spec 03 are independent — they touch different surfaces (UX vs identity-writer enforcement) and shipped in parallel. Spec 03c is sequenced *after* both have shipped portal-side and *before* Spec 4/5 critical-path debugging begins; it is independent of Heroes' Rev 3 adoption. **Spec 06 sits between portal-side hardening (Specs 01/03/03c shipped) and Heroes-side adoption — owner decision 2026-04-30 is to land Spec 06 portal-side fully before unblocking Heroes' rev3 adoption.** This trades parallelism for sequencing clarity: Heroes adopts against a stable, complete identity model rather than tracking a moving target.

**Recommended sequence:**

1. **Rev 3 Spec 01** — Shared account widget package, portal adoption, Heroes adoption as the pilot H-app. *(Portal-side shipped 2026-04-28.)*
2. **Rev 3 Spec 03** — Portal alias layer + Heroes ingestion rewrite + DB-role REVOKE. Critical-path: must land before any H-app takes real users. *(Portal-side shipped 2026-04-28; test gate cleared 2026-04-29 via Spec 03b.)*
3. **Rev 3 Spec 03c** — Pre-Spec-4 hardening. *(Shipped 2026-04-29.)* Closes the launcher data-source mismatch (`/api/userinfo` already exists; chrome ignores it), lays observability foundations (Pino + request-IDs + Cloud Logging structured ingestion + real `/api/health`), corrects webhook-dispatcher doc/code drift, and extracts `@coms-portal/sdk` + a generic integrator quickstart.
4. **Rev 3 Spec 06** — Dual-email auth. **Shipped end-to-end 2026-04-30 → 2026-05-03 (PRs A → F).** Multi-row `identity_user_emails` table replaces single-column model; OTP path for any email provider via Brevo (smoke-tested end-to-end on prod 2026-05-01); self-service personal-email binding; admin tooling (find-by-email, sign-out-everywhere, super_admin one-time login link). 6 PRs (A-F); F closed the rev3 spec sweep on 2026-05-03 (commit `8f13c64`) and unblocked Heroes-side rev3.
5. **Then — Heroes-side rev3 adoption** per `heroes-integration-handoff.md` + spec-03 §Appendix A.

**Deferred specs (no scheduled work; ship on trigger):**

- **Spec 02** — Design System Phase 2+. Trigger: third H-app onboards, token value change, or drift detected.
- **Spec 03d** — Deferred Hardening Backlog. 11 items (Redis-backed rate limiter, staging environment, per-tenant signing keys, KMS encryption for webhook secrets, `compliance_status` enforcement, session-expiry UX, broker refresh flow, rate-limit extension, audit Cloud Logging sink, OpenTelemetry → Cloud Trace, canary + feature flags). Each ships on its own trigger; documented as a backlog so deferred work stays visible. Max combined infra spend if everything ships: ~$85/mo.
- **Spec 04** — User Preferences. Trigger: third H-app onboards, portal localizes, drift incident, or Spec 02 Phase 2+ ships. *(Spec 03c is now a documented prerequisite — the preference-write debug path needs structured logging + request IDs.)*
- **Spec 05** — Suite Search. Trigger: N > 6 apps, first cross-app search request, an app builds its own palette, or recent-items demand. *(Spec 03c is now a documented prerequisite — federated `/api/search` calls need request-ID propagation to debug timeouts and silently-skipped providers.)*

---

## Out of Scope for Rev 3

- **Profile editing** (name change, avatar upload, password reset). The portal `/profile` page stays read-only in Rev 3; Spec 01 only ensures it is *reachable* from every app. Editable profile is its own Rev (likely Rev 4) because it pulls in IdP-side identity management questions.
- **MFA enrollment surface.** Same reason — pushed to a later Rev.
- **Notifications inbox / bell icon.** The widget reserves a slot for it but does not ship the inbox itself.
- **Cross-app deep search.** Out of scope; not a federation concern.

---

## Success Criteria

Rev 3 is done when:

1. A user inside Heroes can click the avatar in the top-right and see the same popover they see inside the portal — with name, email, role, and an "Manage account" link to portal `/profile`.
2. Sign-out from inside Heroes ends the portal session and any other H-app session via RP-initiated OIDC logout.
3. The portal and Heroes both render the widget from the **same package version** (no forks, no copy-paste).
4. Onboarding a third H-app's chrome is a one-import / one-prop change, not a design exercise.
5. `identity_users` rows can only be written by the portal API service account; Heroes' DB role attempts an `INSERT` and the database refuses.
6. Heroes' sheet ingestion creates zero user records — every row resolves through the portal alias layer or lands in `pending_alias_resolution`. Tombstoned-user rows route to audit, never silently ingested or dropped.
7. A user without a Google Workspace seat can be admin-allowlisted via personal email and authenticate via OTP. A Workspace user can self-bind a personal email post-login (OTP-verified) and authenticate via either path. Both produce identical `portal_sub`-keyed sessions; downstream H-apps cannot tell which path was used.
