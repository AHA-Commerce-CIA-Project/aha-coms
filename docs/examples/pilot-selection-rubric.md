# Pilot Selection Rubric

Use this after filling `app-inventory-template.md`.

## Goal
Choose the **first pilot app** that best validates the platform model with the least unnecessary risk.

This is not the app with the biggest business impact.
This is not the hardest app.
This is the app that gives the best learning with manageable cost.

---

## Scoring model
Score each app from **1 to 5** on each category.

- **1** = poor pilot candidate
- **3** = acceptable
- **5** = excellent pilot candidate

| Category | What good looks like | Score 1 | Score 3 | Score 5 |
|---|---|---:|---:|---:|
| Owner clarity | Active team and clear DRI | unclear owner | some ownership | clear owner + responsive team |
| Auth simplicity | Current auth can be replaced or dual-run without major surgery | very custom | moderate | straightforward |
| RBAC simplicity | Local permissions are understandable and limited | very custom | some complexity | simple |
| User mapping ease | Local users can map to central identity with low ambiguity | hard | moderate | easy |
| Deployment flexibility | Team can update config, env vars, callback URLs, middleware quickly | hard | moderate | easy |
| Business risk | Pilot failure would be tolerable | very risky | moderate | low risk |
| Representativeness | App is realistic enough to validate the platform | unusual edge case | partially representative | very representative |
| AI-agent friendliness | Repo is navigable and changeable by agents | poor | moderate | strong |
| Time-to-first-value | Team can likely complete pilot in a short cycle | slow | moderate | fast |
| Exception pressure | App likely fits the normal path, not exception path | exception-heavy | uncertain | normal-path fit |

**Suggested total:** out of 50

---

## Hard filters
Avoid using an app as the first pilot if any of these are true:
- no active owner team
- no one can approve production-impact changes
- auth is deeply entangled with critical business flows
- app is the most revenue-critical system
- migration would almost certainly require an exception path first

If any hard filter is true, the app may still be migrated later — just not as the first pilot.

---

## Recommended pilot profile
Your best first pilot usually looks like this:
- independently owned repo
- separate subdomain or Cloud Run URL
- moderate real-world value
- simple or moderate auth/RBAC complexity
- clear owner team
- okay with dual-run / temporary bridging
- likely to use the **normal portal-brokered subdomain SSO path**

---

## Bad first pilot profile
Do **not** start with:
- the hardest legacy app
- the most politically sensitive app
- the most business-critical app
- the app with the strangest identity model
- the app most likely to need gateway exceptions immediately

---

## Tie-breakers
If two apps score similarly, prefer the app that:
1. best matches the **normal path**
2. has the most responsive team
3. can be tested quickly on a temporary Cloud Run URL
4. gives reusable lessons for the next two apps

---

## Recommendation output format
After scoring, produce this for stakeholders:

### Recommended Pilot
- **App:** <name>
- **Why first:** <2-4 bullets>
- **Main risks:** <2-4 bullets>
- **Expected path:** normal / exception
- **Suggested success criteria:**
  - login at portal
  - enter app without second interactive login
  - app creates local session from brokered handoff
  - no sibling-app trust
  - app is no longer global auth/RBAC source of truth

### Next-best backup pilot
- **App:** <name>
- **Why backup:** <short reason>

---

## Fast recommendation rule
If you need to move quickly:
- pick the app with the **highest total score**
- as long as it has **no hard filters**
- and it fits the **normal brokered subdomain SSO path**
