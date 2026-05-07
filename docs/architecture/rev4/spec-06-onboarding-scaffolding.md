# Rev 4 — Spec 06: Onboarding — Smoketest + Quickstart Revision

> **Status: DRAFT 2026-05-07 (narrowed).** Owner: Mr. Door (solo). Trigger: Fast (Next.js, brownfield) confirmed as the second first-party H-app onboarding.
>
> **Narrowing note (2026-05-07):** an earlier draft proposed a `coms-app-starter` repo with a Bun + Elysia template, an `infra/` OpenTofu directory, a `Dockerfile`, and a pre-wired GitHub Actions CD workflow. Deleted on review. A starter repo only pays off if consumers share a canonical stack, and they don't: Heroes is SvelteKit + Elysia (split across two packages), Fast is Next.js + Prisma + Cloud Build + Terraform, and the next consumer's stack is unknown. A starter would be a maintained layer of indirection between the SDK and the consumer that every onboarding round would have to update — without removing the architect-paired conversation that was supposed to justify it. The shared contract belongs in *one* layer (the SDK + wire protocol + the docs), not two.
>
> **Prerequisites:** Spec 01 SDK v1.0 SHIPPED 2026-05-07 (the SDK surface this spec wraps). Spec 03 HS256 rip-out SHIPPED or in-flight (so the quickstart revision strips dead transport modes against the post-rip surface, not the pre-rip one).

---

## Status — 2026-05-07 (DRAFT)

Specced; not started. Three PRs across two repos. Estimated effort: one day for one developer (half day for the smoketest verb + portal route, half day for the quickstart revision).

---

## Problem

Spec 01 closed six contract gaps in the SDK and made the *code* path for H-app onboarding small (~30 lines of glue per app, against a typed, tested, semver-locked surface). The post-Spec-02 architecture review of the superapp surface, conducted 2026-05-07, found that the friction around those 30 lines is where onboarding effort actually lives:

1. **GCP service account provisioning** — every new app's CD pipeline rediscovers the same `gcloud auth print-identity-token --impersonate-service-account=<runtime-sa> --audiences=<portal-url> --include-email` chain. Heroes needed three iterations (Spec 02 §F7, F8, F9) to get this right. The pattern is solved but undocumented in the integrator quickstart.
2. **Three transport modes documented; one used.** `docs/architecture/integrator-quickstart.md` §2 walks readers through `one_time_code`, `token_exchange`, and `same_host_cookie`. Production has zero `token_exchange` consumers (per Spec 03 pre-flight check 1) and zero `same_host_cookie` consumers. Cognitive overhead with no payoff.
3. **No retrofit path.** A team with an *existing* app cannot consult a documented brownfield checklist. Today they manually pick which files to copy and which CD steps to add. There is no checklist.
4. **No deploy-time smoke test.** After a new app deploys, there is no portal-side tool that says "the auth loop is healthy" or "the webhook receiver is reachable and acks within 5s." First failures surface as a real user clicking the new app and getting a blank page.
5. **Spec 07 envelope invariants are tribal knowledge.** Per `feedback_webhook_dual_emit.md`: every user-event emitter includes `user.portalSub` and roles flow through `envelope.appRole`, never `configSchema`. These are post-2026-05-06 invariants the quickstart never absorbed; new apps put role in `configSchema` and silently mis-route in production.
6. **Non-TS path is undocumented.** The wire protocol (ES256 JWT against JWKS, HMAC-SHA256 webhook signature, JSON over HTTPS) is language-agnostic but lives only as TypeScript code in `@coms-portal/sdk`. A Python or Go team has nothing to read except the TS source.

The combined effect: onboarding the *second* H-app takes 2–3 days (TS team, GCP-fluent) instead of the 30-minute target the quickstart promises. The friction is hidden from Heroes (because the architect drove the integration) and will resurface as soon as the next dev onboards an app without that hand-holding.

The goal of this spec is to close those six gaps with the smallest possible code investment. After this, a competent dev who has never seen the portal can take a registered app from zero to "smoketest OK" in an afternoon.

---

## Scope

**In scope:**

- New CLI verb on `coms-portal-cli`: `smoketest <slug>` — exercises the integration end-to-end against a registered app, prints OK or the failing step.
- Portal-side route supporting the smoketest verb: a new OIDC-authed route at `POST /api/v1/apps/:slug/smoketest` that lets the CLI verify (a) the app is registered, (b) the app's URL is reachable, (c) a test webhook envelope was delivered with a 2xx ack within the budget. Distinct from the existing admin-authed `POST /api/v1/apps/:id/webhooks/:endpointId/test` route at `apps/api/src/routes/app-webhooks.ts:371` — different auth path, different consumer.
- Integrator quickstart revision: lead with the brownfield retrofit path. Strip `token_exchange` and `same_host_cookie` from the recommended flows (mention as "exists for legacy reasons; do not use" in a footnote). Add a "Spec 07 envelope contract" subsection with the four invariants. Add a "retrofit existing app" subsection structured as a *checklist of decisions and files to wire*, framework-agnostic. Add a "wire protocol reference" subsection sufficient for a non-TS team to integrate without reading TS source.

**Explicitly out of scope (and why):**

- **A starter / template repo.** See the narrowing note in the preamble. The shared contract belongs in the SDK + wire protocol + the docs; a starter would be a maintained layer of indirection that drifts with each new consumer.
- **Per-language SDKs** (Python / Go / Rust / etc.). Spec 06 documents the wire protocol so non-TS teams can integrate by hand; it does not ship a non-TS SDK. Per D4: defer until ≥ 2 apps in a non-TS language exist.
- **Adapter packages for non-Elysia frameworks** (Next.js Route Handlers / Hono / Express / Fastify / SvelteKit endpoints). Brownfield consumers wire the SDK into their own framework's idiom. If a future audit shows multiple consumers re-implementing the same adapter, the conversation reopens.
- **Auto-detect-and-patch retrofit tooling.** Retrofit is a documented checklist; if a future audit shows checklist execution failures the conversation reopens.
- **Replacing or deprecating `docs/architecture/integrator-quickstart.md`.** Quickstart is the canonical reference; this spec revises it, doesn't supersede it.

---

## Decisions log (all locked)

| # | Question | Decision | Reason |
|---|---|---|---|
| D1 | Smoketest — separate binary or new verb on existing CLI? | **New verb on `coms-portal-cli`.** Per Spec 01 §Q9: bundle CLI in SDK, one binary. | Keeps the install story to one package. Adds zero new dependencies. The CLI's auth path (Google OIDC ID token via `requireAppToken`) is already proven for `register-manifest`; smoketest reuses it. |
| D2 | What does smoketest actually exercise? | **Three checks against a registered app:** (1) Registry lookup confirms the app is registered and `status=active`. (2) `GET <app.url><healthCheckPath>` returns 200 within 5s (app's URL is live). (3) Portal sends a test `app.smoketest` envelope to each registered endpoint and reports the response status + latency. | Surfaces the three failure modes that account for ~90% of onboarding breakage: app not registered, app not deployed, webhook receiver not wired. Doesn't try to exercise the full handoff loop (that needs a live user session and is hard to synthesize). |
| D3 | Smoketest portal route — extend the existing admin `/test` route, or add a new route? | **New route, separate auth path.** `POST /api/v1/apps/:slug/smoketest`, OIDC-authed via the same path as `register-manifest`. Lives in a different file/subapp from `app-webhooks.ts`. | The existing `apps/api/src/routes/app-webhooks.ts:371` `/test` route is wrapped by `.use(requireRole('admin'))` — it expects an admin user session. The smoketest CLI runs from a CD pipeline using a runtime SA's OIDC token; there is no admin user. Sharing a route would require broadening the admin surface to accept SA tokens — wrong direction. The two routes can share the underlying `dispatchPortalWebhook` machinery internally without sharing auth. |
| D4 | Per-language SDKs (Python / Go / etc.)? | **No SDKs ship in this spec.** Document the wire protocol in the quickstart's new "wire protocol reference" subsection precisely enough that a non-TS team can integrate using standard JOSE + HMAC + HTTP libraries (~100 lines). | Per-language SDK is real engineering work — port the verifier, port the test fixtures, version-bump in lock-step forever. Only worth paying once ≥ 2 apps in that language exist. Today's stack is Bun/TS-dominant. The wire protocol is standard JOSE + HMAC + JSON; teams can read the reference and integrate by hand. |
| D5 | Retrofit support — worked example, framework-agnostic checklist, or scaffold tool? | **Framework-agnostic checklist.** The §0.2 retrofit subsection lists the *decisions* a brownfield team must make, the *files they need to wire*, the *invariants their wiring must honor*, and the *command that validates it*. No stack-specific code. | A worked example in any single stack rots the moment a consumer arrives in a different stack — and consumers are diverse (Heroes = SvelteKit + Elysia, Fast = Next.js + Prisma + Cloud Build + Terraform). A checklist names the decisions without picking them; teams make the calls in their idiom. The smoketest verb tells them whether the result is wired correctly. |
| D6 | Quickstart fate — replace, deprecate, or revise? | **Revise in place.** Document remains the canonical reference; the underlying contract is what the quickstart describes. | Two-doc strategies (one for "fast start", one for "full reference") drift apart. Better to have one doc with a clear "fast path / full path" split. |

---

## What gets built

### 1. SDK CLI: new `smoketest` verb

In `mrdoorba/coms-sdk`, add a verb to `coms-portal-cli` (alongside the existing `register-manifest` verb at `src/cli.ts:170`):

```bash
coms-portal-cli smoketest <slug>
```

Auth: same Google OIDC ID token path as `register-manifest` (`COMS_PORTAL_CLI_OIDC_TOKEN`). Behavior:

```
[1/3] Registry check     → app registered, status=active, handoff_mode=one_time_code
[2/3] App URL reachable  → GET <app.url><healthCheckPath>
                            ✓ 200 OK (134ms)
[3/3] Webhook delivery   → POST /api/v1/apps/:slug/smoketest
                            ✓ endpoint=https://fast.../webhook  status=200  latency=87ms

Smoketest OK.
```

On failure, prints which step broke and the underlying status/error. Exit code non-zero so CD pipelines fail loud.

### 2. Portal-side support

`mrdoorba/coms_portal` adds:

- A new OIDC-authed route `POST /api/v1/apps/:slug/smoketest` (in a new file, e.g. `apps/api/src/routes/app-smoketest.ts`) that:
  - Verifies the app is registered and active (returns 404 / 409 on miss); returns the registry summary in the response so the CLI can satisfy step 1 in one call.
  - Synthesizes an `app.smoketest` envelope (with a fresh `eventId`) and dispatches it to every active endpoint for the app via the existing `dispatchPortalWebhook` machinery, returning `{ endpoint, status, latencyMs, error? }[]`.
  - The admin-authed `app-webhooks.ts:371` `/test` route is left untouched.
- Add `'app.smoketest'` to the `PortalWebhookEvent` union (`@coms-portal/shared` + SDK re-export). Receiver-side: brownfield handlers recognize the event name and ack 2xx without business-side processing.

### 3. Quickstart revision

Restructure `docs/architecture/integrator-quickstart.md`:

- New §0: "Pick your path" — three subsections.
  - **§0.1 Greenfield** — `bun add @coms-portal/sdk`, follow the contract in §2 / §3, run `coms-portal-cli smoketest <slug>`. No framework-specific code.
  - **§0.2 Retrofit existing app** — framework-agnostic checklist:
    - **Decisions to make.** Where your session lives (e.g. database row keyed by `user.portalSub`, signed-cookie JWT, auth-library wrapper). Which CD platform mints your OIDC token (GitHub Actions / Cloud Build / etc.) — the *mint chain* is the same; the *YAML syntax* differs. Which IaC tool declares your IAM bindings. Your framework's request-handler shape (Elysia handlers / Next.js Route Handlers / SvelteKit endpoints / etc.).
    - **Files to wire.** A handoff handler (receive `?coms_code`, call `exchangeBrokerToken`, set your session). A webhook handler (verify HMAC, dedup by `eventId`, ack 2xx). A manifest registration call (or use the admin App Registry UI — see §1). A CD step that mints an OIDC SA token impersonating your runtime SA and calls `coms-portal-cli register-manifest` + `coms-portal-cli smoketest`.
    - **Invariants your wiring must honor.** The four rules in §3.
    - **Validation.** `coms-portal-cli smoketest <slug>` returns OK in CD and locally.
  - **§0.3 Non-TS app** — pointer to the new wire protocol reference (§8).
- §2 (broker token) — strip `token_exchange` and `same_host_cookie` from prose; keep one-paragraph footnote: "Other transport modes exist for legacy reasons; do not use." (This deletion happens *after* Spec 03 lands, which removes the dead-mode plumbing on the portal side.)
- §3 (webhook) — add "Spec 07 envelope contract" subsection covering the four invariants:
  1. Read role from `envelope.appRole`, never from `configSchema`.
  2. Dedup by `envelope.eventId` — Cloud Tasks can deliver twice.
  3. Ack 2xx within 5s — slow handlers should queue work and ack early.
  4. Verify HMAC + (optionally) OIDC; both headers present is normal.
- New §8: "Wire protocol reference" — the JWT shape (header + claims + signing alg + JWKS URL), the HMAC scheme (canonical string format, header names, algorithm), the HTTP endpoints (`POST /api/auth/broker/exchange`, `GET /api/admin/aliases/:alias`, etc. with request/response shapes). Sufficient for a non-TS team to integrate using standard JOSE + HMAC + HTTP libraries in ~100 lines.

---

## PR breakdown

| PR | Repo | Scope | Depends on |
|----|------|-------|------------|
| A | `mrdoorba/coms_portal` | Add `POST /api/v1/apps/:slug/smoketest` route (OIDC-authed, new file). Add `'app.smoketest'` to `PortalWebhookEvent` union (shared types + SDK re-export). | None (additive). |
| B | `mrdoorba/coms-sdk` | Add `smoketest <slug>` verb to `coms-portal-cli`. Bump SDK to v1.1.0 (additive). | PR A portal route, or coordinated. |
| C | `mrdoorba/coms_portal` | Revise `docs/architecture/integrator-quickstart.md` per the §0 / §2 / §3 / §8 plan above. | Spec 03 SHIPPED (so §2 deletions match the post-rip surface). |

PRs A + B interlock: B needs the portal route to exist; A is additive and harmless without a CLI consumer. Either ship simultaneously, or land A first.

PR C ships last — it documents the post-rip, post-smoketest surface as a coherent story.

---

## Heroes-side coordination

**None required.** Heroes is already integrated and is not the audience for Spec 06. The four invariants the new "Spec 07 envelope contract" section documents are already followed by Heroes (per the 2026-05-06 role refactor + post-Spec-08 cutover); the section codifies what's already true.

---

## Acceptance criteria

- `bunx coms-portal-cli smoketest <registered-slug>` returns OK against a live app with subscribed webhook endpoints.
- `bunx coms-portal-cli smoketest <unreachable-slug>` returns non-zero with a clear "step 2: app URL unreachable" message.
- `bunx coms-portal-cli smoketest <unregistered-slug>` returns non-zero with a clear "step 1: app not registered" message.
- `docs/architecture/integrator-quickstart.md` no longer recommends `token_exchange` or `same_host_cookie` in §2 prose. The "Spec 07 envelope contract" subsection exists in §3 and documents the four invariants. The "retrofit existing app" subsection exists as §0.2 and is structured as a framework-agnostic checklist of decisions + files + invariants + validation. The "wire protocol reference" exists as §8 and is reviewed by one non-TS-stack person for clarity.
- A first-time onboarder doing a brownfield retrofit (a developer who has never integrated against the portal before) can take their app from zero to "Smoketest OK" using only the quickstart, without hand-holding from the architect, in under one working day. Validation: pick one developer who hasn't seen the portal; time them.

---

## Out of scope (until trigger fires)

- **A starter / template repo.** The shared contract lives in the SDK and the wire protocol; a template repo would be a maintained layer of indirection that drifts with each new consumer. If a future audit shows ≥ 2 greenfield consumers on the same canonical stack, the conversation reopens — and even then, the canonical shape is harvested from those consumers' real code, not pre-speculated.
- **Per-language SDKs** (Python / Go / Rust / etc.). The wire protocol reference is the documented fallback. Build a per-language SDK only when ≥ 2 apps in that language exist; until then, every line of port work is speculative.
- **Adapter packages for non-Elysia frameworks** (Next.js Route Handlers / Hono / Express / Fastify / SvelteKit endpoints). Brownfield consumers wire the SDK into their own framework's idiom; defer until a real audit shows multiple consumers re-implementing the same adapter.
- **Auto-detect-and-patch retrofit tooling.** Retrofit is a documented checklist; if a future audit shows checklist execution failures the conversation reopens.
- **Multi-tenant test fixtures.** The smoketest verb assumes one tenant per app instance — the portal's standard model. Multi-tenant SaaS-style apps are a future-spec concern.
- **Portal admin-UI changes** to surface "smoketest results." Out of scope; the CLI prints to stdout and that's enough until a real consumer asks for a dashboard.
