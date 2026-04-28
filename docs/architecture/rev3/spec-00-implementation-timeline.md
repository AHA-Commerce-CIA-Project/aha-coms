# Rev 3 — Spec 00: Implementation Timeline

> Coordination plan for Rev 3 specs. Rev 3 is the **suite-UX hardening pass** that turns the federation from "SSO works" into "the apps feel like one product."
>
> **Last updated:** 2026-04-28
> **Prerequisites:** Rev 2 closed end-to-end (RS256/JWKS, OIDC discovery, webhook + introspect via Google OIDC). Identity ownership is now firmly in the portal; Rev 3 builds the user-facing surface that makes that ownership visible.

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
| 02 | Design System (skeleton + spec) | Portal | Phase 1 done; Phase 2+ deferred | Eventually (Phase 3 adoption) | No — deferred until trigger |
| 03 | User Identity Ownership & Alias Layer | Portal + Heroes | Large | Yes — H1 (rename, ingestion rewrite) | **Yes — must land before real users** |
| 04 | Unified User Preferences (theme + locale) | Portal + every H-app | Small per phase | Yes — Phase 3 (preference consumption) | No — deferred until trigger |
| 05 | Suite Search / Command Palette | Portal + every H-app | Medium per phase | Optional — Phase 3 (search provider) | No — deferred until trigger |

Specs 01 and 03 are the load-bearing pair for Rev 3: 01 surfaces identity, 03 hardens who can write it. Specs 02, 04, 05 are full architecture decided + deferred until their trigger conditions fire (documented in each spec's §Why this is deferred).

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
