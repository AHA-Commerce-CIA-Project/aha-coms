# Rev 4 — Spec 00: Implementation Timeline

> Coordination plan for Rev 4. Opened 2026-05-06 when Rev 3 closed.
>
> Rev 4 currently holds the two specs that were architecture-decided in Rev 3 but trigger-deferred (Spec 04 User Preferences, Spec 05 Suite Search). Neither has fired its trigger yet, so Rev 4 is a holding container until something does.
>
> **Prerequisites:** Rev 3 closed end-to-end (account widget, identity ownership, alias layer, dual-email auth, org taxonomies + employment block, Heroes cutover). Identity is centrally owned, written, and authenticated; the suite-UX surface is established. Rev 4 builds against that foundation.

---

## Status — 2026-05-06 (opened)

Rev 4 opened by carrying Specs 04 and 05 over from Rev 3 with their architecture intact. No code work scheduled. Each spec ships only when its trigger fires (see each spec's §Triggers to ship section).

No spec table yet — when a trigger fires, populate it then. The next scheduled work is whichever of the two triggers first; until then, this rev exists only to keep the deferred specs durable and out of the closed Rev 3 namespace.

---

## Specs

| Spec | Title | Status | Trigger |
|------|-------|--------|---------|
| 04 | Unified User Preferences (Theme + Language) | Architecture decided. Deferred. | Third H-app onboards, portal localizes, user-visible drift incident, or Rev 3 Spec 02 Phase 2+ ships. |
| 05 | Suite Search / Command Palette | Architecture decided. Deferred. | N > 6 apps, first cross-app search request, an app builds its own palette, or recent-items demand. |

When either trigger fires, the spec moves from deferred to scheduled and a Phase 1 implementation plan is added here.

---

## Out of scope until a real Rev 4 spec lands

The Rev 3 §Out of Scope items (profile editing, MFA enrollment, notifications inbox) remain out of scope. They become candidates for Rev 4 only if a stakeholder asks. Don't pre-design.
