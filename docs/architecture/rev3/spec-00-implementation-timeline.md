# Rev 3 — Spec 00: Implementation Timeline

> Coordination plan for Rev 3 specs. Rev 3 is the **suite-UX hardening pass** that turns the federation from "SSO works" into "the apps feel like one product."
>
> **Last updated:** 2026-04-28
> **Prerequisites:** Rev 2 closed end-to-end (RS256/JWKS, OIDC discovery, webhook + introspect via Google OIDC). Identity ownership is now firmly in the portal; Rev 3 builds the user-facing surface that makes that ownership visible.

---

## Status — 2026-04-28 (portal-side shipped; Heroes adoption pending)

Portal/COMS team landed Specs 01 + 02 (Phases 2 + 3) end-to-end on 2026-04-28. Spec 03 remains scheduled but un-started.

**Shipped (public GitHub repos, consumed via `git+url`):**

| Package | Version | Repo |
|---------|---------|------|
| `@coms-portal/design-tokens` | v1.0.0 | https://github.com/mrdoorba/coms-design-tokens |
| `@coms-portal/ui` (chrome only) | v1.0.0 | https://github.com/mrdoorba/coms-ui |
| `@coms-portal/account-widget` | v0.1.0 | https://github.com/mrdoorba/coms-account-widget |
| `@coms-portal/shared` (+ APP_LAUNCHER) | v1.3.0 | https://github.com/mrdoorba/coms-shared |

Portal `apps/web` is migrated and dogfooding all four (consuming via `git+https://...#vX.Y.Z`); portal `apps/api` exposes `GET /api/userinfo` and OIDC RP-initiated logout (`GET /api/auth/logout`), both with `app_registry.url` origin allowlist (post-deprecation filter, post red-cell sweep).

**Heroes-side work pending** — see `heroes-integration-handoff.md` (mirrored into this folder) for the install lines, mount snippets, file-deletion list, and verification checklist. Spec 01 widget adoption + Spec 02 Phase 2 token consumption are unblocked; Phase 3 chrome adoption can land at the same time or later.

**Spec 03 status:** un-started. Heroes signed off on the design 2026-04-28; both teams can sequence the three-deploy cutover whenever capacity opens. Specs 02 (Phases 4+5), 04, 05 remain deferred until their triggers fire — see each spec's §Why this is deferred.

---

## Theme of Rev 3

Rev 1 hardened the federation. Rev 2 removed shared secrets. Rev 3 closes two gaps that follow from a working SSO:

1. **The user-experience gap.** A user landing in Heroes (or any future H-app) has no way to reach `/profile`, no account menu, no app switcher, and no consistent sign-out path. The fix (Spec 01) is the same pattern Google (OneGoogle/gbar), Microsoft (M365 suite header), and AWS (Identity Center menu) converged on: a shared account widget every app embeds, driven by props.
2. **The identity-writer gap.** Rev 2 made the portal the sole *authenticator* of users. It did not make the portal the sole *writer*. Heroes' sheet ingestion can still implicitly mint user records — fine pre-real-users, catastrophic the moment real customers arrive. Spec 03 closes this by establishing portal as sole writer of `identity_users`, adding a portal-owned alias layer for name-based resolution, and locking down writes at the DB-role level.

After Rev 3, identity is *centrally owned* (Rev 2), *centrally surfaced* (Spec 01), and *centrally written* (Spec 03) — one place creates users, one component surfaces them, and the database enforces both.

---

## Specs

| Spec | Title | Owner | Effort | Heroes-side work? | Critical path? |
|------|-------|-------|--------|-------------------|----------------|
| 00 | Implementation Timeline (this doc) | Portal | — | — | — |
| 01 | Shared Account Widget | Portal | Medium | Yes — H1 (adoption) | Yes — UX surface |
| 02 | Design System (skeleton + spec) | Portal | Phases 1+2+3 done portal-side (2026-04-28); Phase 4+5 deferred | Phase 2 token consumption + Phase 3 chrome adoption | No — deferred until trigger |
| 03 | User Identity Ownership & Alias Layer | Portal + Heroes | Large | Yes — H1 (rename, ingestion rewrite) | **Yes — must land before real users** |
| 04 | Unified User Preferences (theme + locale) | Portal + every H-app | Small per phase | Yes — Phase 3 (preference consumption) | No — deferred until trigger |
| 05 | Suite Search / Command Palette | Portal + every H-app | Medium per phase | Optional — Phase 3 (search provider) | No — deferred until trigger |

Specs 01 and 03 are the load-bearing pair for Rev 3: 01 surfaces identity, 03 hardens who can write it. Specs 02, 04, 05 are full architecture decided + deferred until their trigger conditions fire (documented in each spec's §Why this is deferred).

---

## Heroes scope at a glance

Every Rev 3 spec touches Heroes eventually, but only Specs 01 + 03 are scheduled now. The rest are decided-and-deferred until their trigger fires.

| Spec | Heroes work | Effort (Heroes) | When | Trigger |
|------|-------------|-----------------|------|---------|
| 01 | Adopt `@coms-portal/account-widget`; refactor `ServiceBar` / `MobileTopBar` to mount the widget in the right slot; remove existing avatar dropdown + sign-out button | ~1 week | **Now** (parallel with Spec 03) | Scheduled |
| 02 | Phase 1: nothing (done portal-side). Phase 2+: consume `@coms-portal/design-tokens` Tailwind preset; Phase 3: migrate chrome to `@coms-portal/ui/chrome`; Phase 4: primitives + compositions | Phase 2: ~½ day · Phase 3: ~3–5 days · Phase 4: incremental | **Deferred** | 3rd H-app onboards, token value change, or drift detected |
| 03 | Rename `users` → `heroes_profiles`; drop all user-creation paths; ingestion rewrite (resolve-batch + pending queue + audit log + alias_cache); webhook consumer; DB-role REVOKE | ~2 weeks engineering + portal cutover coordination | **Now — critical-path** | Must land before real users |
| 04 | Read `coms_prefs` claim from ID token; apply theme + locale on render; remove Heroes' standalone theme toggle (widget popover from Spec 01 owns it) | ~½ day | **Deferred** | 3rd H-app onboards, drift report, or Spec 02 Phase 2+ ships |
| 05 | Register Heroes searchables (heroes, courses, cohorts) with portal search registry; expose `POST /search/provider` endpoint | ~1 day | **Deferred (optional)** | N > 6 apps, first cross-app search request, or Heroes ops asks |

**Wall-clock for the scheduled work** (Specs 01 + 03 in parallel):

- **Weeks 0–2:** Spec 01 widget package built portal-side + Heroes pilot adoption. In parallel, Spec 03 portal alias-layer API + Heroes Phase 0 prep (rename, ingestion-path scaffolding behind feature flag).
- **Weeks 2–4:** Spec 03 three-deploy cutover (Deploy A → freeze + seed → Deploy B → Deploy C). Spec 01 ships to production in Heroes.
- **Rev 3 closes** when spec-00 §Success Criteria are green: widget renders identically in portal + Heroes from one package version; Heroes' DB role cannot write `identity_users`; sheet ingestion mints zero new user rows.

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
```

Spec 01 and Spec 03 are independent — they touch different surfaces (UX vs identity-writer enforcement) and can ship in parallel. Specs 02, 04, 05 stay deferred until their own triggers fire.

**Recommended sequence:**

1. **Rev 3 Spec 01** — Shared account widget package, portal adoption, Heroes adoption as the pilot H-app.
2. **Rev 3 Spec 03** — Portal alias layer + Heroes ingestion rewrite + DB-role REVOKE. Critical-path: must land before any H-app takes real users. Once portal answers the six §Open Questions in spec-03 and Heroes confirms, both teams can sequence the three-deploy cutover.

**Deferred specs (no scheduled work; ship on trigger):**

- **Spec 02** — Design System Phase 2+. Trigger: third H-app onboards, token value change, or drift detected.
- **Spec 04** — User Preferences. Trigger: third H-app onboards, portal localizes, drift incident, or Spec 02 Phase 2+ ships.
- **Spec 05** — Suite Search. Trigger: N > 6 apps, first cross-app search request, an app builds its own palette, or recent-items demand.

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
