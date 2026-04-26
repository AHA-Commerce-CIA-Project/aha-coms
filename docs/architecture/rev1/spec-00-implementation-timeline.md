# Spec 00 — Implementation Timeline

> This document is the coordination plan for all Rev 1 specs.
> It defines what runs in parallel, what blocks what, and when to communicate with the Heroes team.
>
> **Last updated:** 2026-04-26

---

## Completion Status

| Spec | Title | Portal | Heroes |
|------|-------|--------|--------|
| 01 | Security Hardening | DONE | N/A |
| 02 | Provisioning Bridge | DONE | DONE (H1, H2, manifest) |
| 03 | Contract Distribution | DONE | DONE (H3 — shared package consumed) |
| 04 | Resilience | DONE (health probes) | DONE (H4 — stale-while-revalidate) |
| 05 | Architecture | Not started | N/A |

**Verified against the Heroes codebase on 2026-04-26:**

- `packages/server/src/routes/portal-webhooks.ts:101-159` — `user.provisioned` handler implemented per Spec 02 §5 (lookup-or-insert, role mapping, branch resolution with default fallback).
- `packages/server/src/routes/portal-webhooks.ts:160-190` — `user.updated` handler implemented per Spec 02 §5 (email-keyed update of name + role).
- `packages/web/src/lib/server/portal-introspect.ts:15-19, 87-92, 113-120` — two-tier cache (`freshUntil` 30s / `staleUntil` 5min), stale-serve on retry exhaustion with `console.warn`, hard-fail when no cache.
- `portal.integration.json:76-81` — `appRoles` declared (employee default, leader, hr, admin).

---

## Tracks

Work is split into two parallel tracks: Portal and Heroes. Most work is independent. Dependencies are called out explicitly.

```
Phase 1 (Done)  Phase 2 (Done)   Phase 3          Phase 4
──────────────── ──────────────── ──────────────── ────────────
PORTAL:
[Spec 01: Security ✓][Spec 02: Provisioning ✓][Spec 03: Shared ✓ ][Spec 05: SSR     ]
                                                [Spec 04: Health ✓ ][      Cloud Tasks]

HEROES:
[H4: Introspect ✓][H1+H2: Webhook handlers ✓][H3: Use shared ✓ ][Manifest appRoles ✓]
```

All Heroes-side work for Rev 1 is complete. Spec 05 is portal-only.

---

## Phase 1 — COMPLETED

### Portal

| Item | Spec | Status |
|------|------|--------|
| Per-app broker signing keys | 01 | DONE |
| Per-app introspect secrets | 01 | DONE |
| CSRF on broker launch | 01 | DONE |

**Delivered:** Schema migration (two new columns on `app_registry`), updated broker and introspect code, app-card POST conversion, ServiceBar POST conversion, `navigateToLaunch()` POST form for handoff intents, `redirectTo` moved from body to query params.

### Heroes

| Item | Ref | Status |
|------|-----|--------|
| H4: Stale-while-revalidate on introspect client | Spec 04 | DONE |
| H1: `user.provisioned` webhook handler (skeleton) | Spec 02 | DONE |
| H2: `user.updated` webhook handler (skeleton) | Spec 02 | DONE |

### ~~Action: Send Handoff Doc Today~~ DONE

Handoff doc sent. Branch question resolved — portal now sends `branch` label in webhook payloads.

---

## Phase 2 — COMPLETED

### Portal

| Item | Spec | Status |
|------|------|--------|
| App roles in manifest + DB | 02 | DONE |
| Role selection in team-app grant | 02 | DONE |
| Enriched webhook payloads (`appRole`) | 02 | DONE |
| Extract `@coms-portal/shared` package | 03 | DONE — published as `git+https://github.com/mrdoorba/coms-shared.git#v1.1.0` |
| Health probe service | 04 | DONE |
| Dashboard degraded state | 04 | DONE |

**Delivered:** Provisioning bridge is live — granting team access triggers `user.provisioned` with `appRole`. Shared package is published at v1.1.0. Health probes running.

### Heroes

| Item | Ref | Status |
|------|-----|--------|
| H1 + H2: Finalize handlers with `appRole` support | Spec 02 | DONE |
| H3: Replace duplicated types | Spec 03 | DONE — consuming `@coms-portal/shared` v1.1.0 |
| Manifest update: add `appRoles` to `portal.integration.json` | Spec 02 | DONE |

### ~~Action: Notify Heroes When Shared Package Is Published~~ DONE

Package published and Heroes is consuming v1.1.0.

---

## Phase 3 — Not Started

### Portal Only (no Heroes involvement)

| Item | Spec | Dependencies |
|------|------|-------------|
| SSR migration (adapter-static → adapter-node) | 05 | None |
| Cloud Tasks for webhook delivery | 05 | OpenTofu queue + service account |
| Remove in-process webhook worker | 05 | Cloud Tasks live + jobs table drained |
| Health probe to Cloud Scheduler | 05 | Cloud Scheduler job (same scale-to-zero issue as webhook worker) |

---

## Dependency Graph

```
Spec 01 (Security) ✓
  └── no dependencies

Spec 02 (Provisioning) ✓ portal / ✓ Heroes
  ├── Portal: contract types → schema → API → admin UI → webhook dispatch ✓
  └── Heroes: H1, H2 ✓

Spec 03 (Contracts) ✓
  ├── depends on: Spec 02 contracts finalized ✓
  ├── Portal: extract + publish package ✓
  └── Heroes: H3 ✓

Spec 04 (Resilience) ✓ portal / ✓ Heroes
  ├── Portal: health probes ✓
  └── Heroes: H4 ✓

Spec 05 (Architecture)
  └── independent, no Heroes involvement
```

---

## What Blocks What (explicit list)

| Blocked item | Blocked by | Status |
|---|---|---|
| ~~Heroes H3 (replace types)~~ | ~~Portal publishes `@coms-portal/shared`~~ | UNBLOCKED — done |
| ~~Spec 03 (extract package)~~ | ~~Spec 02 contracts finalized~~ | UNBLOCKED — done |
| ~~Portal dashboard degraded UI~~ | ~~Health probe service deployed~~ | UNBLOCKED — done |
| Remove webhook worker | Cloud Tasks live + jobs drained | Blocked — Spec 05 not started |
| Health probe to Cloud Scheduler | Cloud Scheduler job created | Blocked — Spec 05 not started |

---

## Communication Checkpoints

| When | What | Status |
|------|------|--------|
| ~~Today~~ | ~~Send `heroes-team-handoff.md` + 3 questions~~ | DONE |
| ~~After Spec 02 contracts merged~~ | ~~Notify Heroes: enriched payloads are live, finalize H1/H2~~ | DONE |
| ~~After Spec 03 package published~~ | ~~Notify Heroes: `@coms-portal/shared` v1.1.0 available, do H3~~ | DONE |
| After all phases | Confirm all specs implemented, schedule a review | Pending |

---

## Remaining Work

### Heroes

None — all Rev 1 Heroes-side items complete.

**Known follow-up (not Rev 1 scope):** the H4 stale-serve path emits `console.warn` only. Spec 04 §1 calls for severity escalation (`severity: 'ERROR'` after N stale-serves in a window) plus a Cloud Monitoring alert policy. Without it, a multi-minute portal outage is invisible unless logs are tailed manually. Track separately.

### Portal (Spec 05)

- SSR migration
- Cloud Tasks for webhook delivery
- Health probe to Cloud Scheduler
- Remove in-process webhook worker + health probe interval
