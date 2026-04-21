# App Inventory Template

Use this for every candidate service app before Phase 2 pilot selection.

## Purpose
The goal is not to fully design each migration yet. The goal is to collect enough facts to:
- compare apps consistently
- choose a safe first pilot
- identify obvious blockers early

---

## One row per app

| Field | What to capture | Example |
|---|---|---|
| App name | Human-facing service name | Heroes |
| Slug | Portal/app slug | heroes |
| Repo URL | GitHub repository URL | github.com/acme/heroes |
| Owner team | Team responsible for app changes | People Ops Tools |
| Primary contact | Human owner / DRI | Jane Doe |
| Environment URL | Current URL or Cloud Run URL | https://heroes-abc123.run.app |
| Target URL | Planned final domain/subdomain | https://heroes.ahacommerce.net |
| Stack | Runtime + framework | Bun + Elysia |
| Language | Main language | TypeScript |
| Auth today | Current login/session method | Local email+password |
| RBAC today | Current role/permission model | admin/member inside app DB |
| Local user table | Does it keep its own users table? | Yes |
| Local user complexity | Low / Medium / High | Medium |
| Identity mapping difficulty | How hard to map local users to central identity | Medium |
| External dependencies | Systems tightly coupled to auth/session | Google Workspace, Stripe |
| Session sensitivity | Is session/login behavior hard to change? | Medium |
| Business criticality | Low / Medium / High | Medium |
| User count | Approximate active users | ~120 |
| Change tolerance | Can this app tolerate pilot churn / dual-run? | Medium |
| Deployment flexibility | Easy to change env vars / callbacks / middleware? | High |
| AI-agent friendliness | Can agents safely navigate repo and make changes? | High |
| Likely adapter type | server_middleware / edge_proxy / gateway_bridge / frontend_shell | server_middleware |
| Likely transport | portable_token / same_host_cookie | portable_token |
| Likely handoff mode | one_time_code / token_exchange / none | one_time_code |
| Expected compliance path | normal / exception | normal |
| Known blockers | Short bullet summary | No central user id yet |
| Recommended pilot score | Fill after rubric | 18/25 |
| Notes | Anything important not captured above | Uses Cloud Run URL for now |

---

## Suggested score labels
- **Low complexity**: straightforward dual-run or direct migration
- **Medium complexity**: some auth/RBAC cleanup needed but manageable
- **High complexity**: custom auth, brittle session model, or tricky user mapping

---

## Minimal questions to ask each team
1. How does login work today?
2. Where are users and roles stored today?
3. Can the app create its own local session after a trusted portal handoff?
4. Can you add middleware or an auth adapter without major rewrite?
5. What would make this migration risky for your team?

---

## Suggested working format
Keep this as a shared spreadsheet or Markdown table for all apps. Once every candidate app has one row, use `pilot-selection-rubric.md` to choose the first pilot.
