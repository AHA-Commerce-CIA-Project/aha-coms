# Spec 00 — Implementation Timeline

> This document is the coordination plan for all Rev 1 specs.
> It defines what runs in parallel, what blocks what, and when to communicate with the Heroes team.

---

## Tracks

Work is split into two parallel tracks: Portal and Heroes. Most work is independent. Dependencies are called out explicitly.

```
Phase 1 (Now)   Phase 2          Phase 3          Phase 4
──────────────── ──────────────── ──────────────── ────────────
PORTAL:
[Spec 01: Security ][Spec 02: Provisioning ][Spec 03: Shared pkg][Spec 05: SSR     ]
                                             [Spec 04: Health    ][      Cloud Tasks]

HEROES:
[H4: Introspect][H1+H2: Webhook handlers   ][H3: Use shared pkg ]
                                                   ↑
                                                   blocked on Spec 03
```

---

## Phase 1 — Start Immediately

### Portal

| Item | Spec | Dependencies |
|------|------|-------------|
| Per-app broker signing keys | 01 | None |
| Per-app introspect secrets | 01 | None |
| CSRF on broker launch | 01 | None |

**Deliverable:** Schema migration (two new columns on `app_registry`), updated broker and introspect code, app-card POST conversion.

### Heroes

| Item | Ref | Dependencies |
|------|-----|-------------|
| H4: Stale-while-revalidate on introspect client | Spec 04 | None — fully independent |
| H1: `user.provisioned` webhook handler (skeleton) | Spec 02 | Heroes answers the 3 open questions (see below) |
| H2: `user.updated` webhook handler (skeleton) | Spec 02 | None |

Heroes can code H1 and H2 against the **current** webhook payload shape. The `appRole` field will be `null`/absent until Portal ships Spec 02. Their handlers should default to `'employee'` when `appRole` is missing — no breakage.

### Action: Send Handoff Doc Today

Send `heroes-team-handoff.md` to the Heroes team with these three questions:

1. What should the default `branchId` be for auto-provisioned users?
2. Should auto-provisioned users get `canSubmitPoints: false` by default?
3. Any concerns about the `appRole` → `UserRole` mapping being 1:1?

These are Heroes-internal decisions. The answers do not change any portal spec, schema, or code. They only affect what Heroes writes inside their `case 'user.provisioned':` block. The reason to ask early: if they don't have a default branch set up, they may need to create one before they can finish H1.

---

## Phase 2 — After Spec 01 + 02 Ship

### Portal

| Item | Spec | Dependencies |
|------|------|-------------|
| App roles in manifest + DB | 02 | None |
| Role selection in team-app grant | 02 | App roles in DB |
| Enriched webhook payloads (`appRole`) | 02 | App roles in DB |
| Extract `@coms-portal/shared` package | 03 | Spec 02 contracts finalized (so the package includes `PortalAppRole`) |
| Health probe service | 04 | None |
| Dashboard degraded state | 04 | Health probe |

**Deliverable:** Provisioning bridge is live — granting team access triggers `user.provisioned` with `appRole`. Shared package is published. Health probes running.

### Heroes

| Item | Ref | Dependencies |
|------|-----|-------------|
| H1 + H2: Finalize handlers with `appRole` support | Spec 02 | Portal ships enriched webhooks |
| H3: Replace duplicated types | Spec 03 | **Blocked on** portal publishing `@coms-portal/shared` |
| Manifest update: add `appRoles` to `portal.integration.json` | Spec 02 | Portal ships app roles support |

### Action: Notify Heroes When Shared Package Is Published

Send a short message: "v1.0.0 of `@coms-portal/shared` is published at `github:mrdoorba/coms-portal-shared#v1.0.0`. You can now do H3."

---

## Phase 3 — When Capacity Allows

### Portal Only (no Heroes involvement)

| Item | Spec | Dependencies |
|------|------|-------------|
| SSR migration (adapter-static → adapter-node) | 05 | None |
| Cloud Tasks for webhook delivery | 05 | Terraform queue + service account |
| Remove in-process webhook worker | 05 | Cloud Tasks live + jobs table drained |

---

## Dependency Graph

```
Spec 01 (Security)
  └── no dependencies

Spec 02 (Provisioning)
  ├── Portal: contract types → schema → API → admin UI → webhook dispatch
  └── Heroes: H1, H2 (can start now, finalize after enriched payloads ship)

Spec 03 (Contracts)
  ├── depends on: Spec 02 contracts finalized
  ├── Portal: extract + publish package
  └── Heroes: H3 (blocked on publish)

Spec 04 (Resilience)
  ├── Portal: health probes (independent)
  └── Heroes: H4 (independent, start now)

Spec 05 (Architecture)
  └── independent, no Heroes involvement
```

---

## What Blocks What (explicit list)

| Blocked item | Blocked by | When unblocked |
|---|---|---|
| Heroes H3 (replace types) | Portal publishes `@coms-portal/shared` | After Spec 03 |
| Spec 03 (extract package) | Spec 02 contracts finalized | After Spec 02 contract types are merged |
| Portal dashboard degraded UI | Health probe service deployed | After Spec 04 probe is live |
| Remove webhook worker | Cloud Tasks live + jobs drained | After Spec 05 Cloud Tasks |

Everything else is **unblocked** — it can start now or whenever capacity allows.

---

## Communication Checkpoints

| When | What | Channel |
|------|------|---------|
| Today | Send `heroes-team-handoff.md` + 3 questions | Direct message to Heroes team |
| After Spec 02 contracts merged | Notify Heroes: enriched payloads are live, finalize H1/H2 | Direct message |
| After Spec 03 package published | Notify Heroes: `@coms-portal/shared` v1.0.0 available, do H3 | Direct message |
| After all phases | Confirm all specs implemented, schedule a review | Team sync |
