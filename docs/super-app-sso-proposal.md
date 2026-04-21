# Super App Portal — Project Proposal

## What Are We Building?

A unified portal where all employees log in once and access every internal web application — similar to how Google Cloud Platform works. One account, one login, access to everything.

## Why Is This Needed?

Today, each internal app has its own login system, its own user database, and its own access control. Employees manage multiple accounts. There is no central view of who has access to what. Adding a new app means building authentication from scratch.

The portal solves this by creating a single identity layer across all apps.

## What It Looks Like

```
portal.ahacommerce.net     → Login here, see all apps you can access
heroes.ahacommerce.net     → Employee recognition app (currently live)
[app-b].ahacommerce.net       → Already live
[app-c].ahacommerce.net    → Future apps plug in with minimal effort
```

An employee logs in at the portal once. They see a dashboard of apps assigned to their team. Clicking any app opens it immediately — no second login required.

## Scope

| Component | Description |
|-----------|-------------|
| Central Identity Provider | Google Identity Platform (GCP-native, free for our scale) |
| Portal App | Login page, app launcher, team management, employee directory |
| App Integration | Each existing app adds a small verification layer (~1-2 days per app) |
| Team-Based Access | HR assigns employees to teams. Teams are granted access to specific apps. |
| Employee Provisioning | HR creates employee accounts in the portal. Replaces spreadsheet as source of truth. |

## What This Is NOT

- This is not rebuilding any existing app
- This is not merging apps into one codebase
- This is not changing what any app does internally
- Each app keeps its own database, its own features, its own team

## Timeline

| Phase | Deliverable | Duration |
|-------|-------------|----------|
| **Phase 0 — MVP** | Portal login + one app connected (Heroes). Employees can log in once and access Heroes without re-login. | 2-3 weeks |
| **Phase 1 — Access Control** | Team management UI. HR can assign who accesses which app. Second app connected. | 2 weeks |
| **Phase 2 — Full Rollout** | All apps connected. Old login systems removed. Employee spreadsheet retired. | 2 weeks |
| **Phase 3 — Hardening** | Multi-factor authentication, session management, audit logs. | Ongoing |

**Total to production-ready state: 6-7 weeks**

## Why It Takes This Long

This is **infrastructure and security** work, not a feature. The complexity comes from:

1. **Authentication across multiple apps** — login cookies must be shared securely across all apps under the same domain. Misconfiguration = security vulnerability or broken access.

2. **Multiple tech stacks** — each app uses different frameworks and auth libraries. Each integration must be tested independently.

3. **Identity migration** — existing users in each app must be linked to the central identity without disruption. No one should lose access during the transition.

4. **Access control design** — the team/permission model must be designed to scale as new apps are added. Getting this wrong means rebuilding it later.

5. **DNS and networking** — all apps must be routed through the same domain for cookie sharing. This requires coordination with infrastructure (Cloudflare DNS).

## Risks If Rushed

| Risk | Consequence |
|------|-------------|
| Cookie misconfiguration | SSO breaks — employees locked out of apps |
| Incomplete migration | Some users can't log in after switch |
| No fallback period | If new auth breaks, no way to roll back |
| Skipping team access model | No control over who sees what — security gap |

The phased approach mitigates all of these. Phase 0 runs old and new auth in parallel — zero downtime, zero lockouts.

## Cost

| Item | Monthly Cost |
|------|-------------|
| Google Identity Platform | Free (up to 50,000 users, we have ~250) |
| Portal Cloud Run service | ~$5-15 (low traffic, internal use) |
| Cloud SQL (shared instance) | Already paid for |
| Cloudflare DNS | Already paid for |
| **Total additional cost** | **~$5-15/month** |

## What We Need to Start

1. **Decision**: Subdomain routing (`heroes.ahacommerce.net`) vs path-based routing (`portal.ahacommerce.net/heroes`). Engineering strongly recommends subdomain — less development work across all apps.

2. **Cloudflare access**: Someone who can add DNS records for new subdomains under `ahacommerce.net`.

3. **GCP project decision**: Use existing project or create a dedicated one for the identity platform.

4. **App inventory**: Final list of apps that will join the portal, with their current tech stack and auth method.

## Architecture Overview

```
                 ┌─────────────────────────┐
                 │   Cloudflare DNS + SSL   │
                 │      *.ahacommerce.net         │
                 └────┬────┬────┬────┬──────┘
                      │    │    │    │
              portal  │    │    │    │  app-c
              heroes──┘    │    └────[app-b]
                           │
            Google Identity Platform
            ┌──────────────────────────┐
            │  - Google OAuth login    │
            │  - Email/password login  │
            │  - Session cookies       │
            │  - Team/app claims       │
            └──────────────────────────┘
                           │
                  Central Identity DB
            ┌──────────────────────────┐
            │  Employees               │
            │  Teams                   │
            │  App registry            │
            │  Team ↔ App permissions  │
            └──────────────────────────┘
```

Each app keeps its own database and logic. The only change per app is a small middleware that verifies the portal's login cookie — typically 1-2 days of developer work per app.
