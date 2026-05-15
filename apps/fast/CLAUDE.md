# Fast — first-session brief for Claude Code

Auto-loads when Claude Code opens under `apps/fast/`. Covers the parts of fast's
move from `alifm17/aha-fast` into the `AHA-Commerce-CIA-Project/aha-coms`
monorepo that affect how you **edit code** and **deploy**. The application
surface (routes, features, schemas) lives in `apps/fast/README.md` and
`apps/fast/PROJECT_CONTEXT.md`.

## Where fast lives now

- **Repo**: `https://github.com/AHA-Commerce-CIA-Project/aha-coms`
  (was `alifm17/aha-fast`).
- **Subtree**: `apps/fast/` — a bun workspace package named `@coms-portal/fast`.
- **Run commands** via workspace filter:
  `bun run --filter @coms-portal/fast {dev,build,typecheck,db:migrate}`.
  Run `bun install` from the repo root (not from `apps/fast/`) after editing
  any `package.json`.
- **The legacy `bun run deploy` script is gone.** Deploys flow through GitHub
  Actions — see below.

## Deployment way

- **Trigger**: any push to `main` (direct or via merged PR) that touches
  `apps/fast/**`, `packages/**`, `bun.lock`, or
  `.github/workflows/deploy-fast.yml` fires the `Deploy — fast` workflow.
- **Auth**: Workload Identity Federation. The GHA runner mints an OIDC token
  whose `repository` claim must equal `AHA-Commerce-CIA-Project/aha-coms`;
  the WIF pool `coms-fast-wif-pool` exchanges it for an access token
  impersonating `coms-fast-deployer-sa@fbi-dev-484410.iam.gserviceaccount.com`.
  **No long-lived service-account keys exist.** Don't try to download one.
- **Pipeline**: bun install (cached) → `db:migrate` via cloud-sql-proxy →
  `docker build` (buildkit cache-from `:latest`) → push to
  `coms-fast-registry` → `gcloud run deploy coms-fast-web` → smoke check.
- **Skipping the migration step**: include `[skip-db-push]` (exact literal,
  brackets included) **in the commit subject line** — anywhere on the first
  line, conventionally at the end. The workflow's `Resolve db-push skip token`
  step greps only `head -n1` of the commit message (see
  `.github/workflows/deploy-fast.yml`), so the body is not inspected. Two
  cases call for it. (1) Destructive migrations (DROP COLUMN, DROP TABLE)
  — those need the manual `cloud-sql-proxy` + `bun run` sequence per
  `infra/README.md`. (2) The Cloud SQL connection pool is saturated and
  your commits touch no schema (`prisma/schema.prisma` unchanged) —
  `db:push` is a no-op for that diff anyway, and the proxy-bound `db:push`
  step shares the pool with the live `coms-fast-web` revision, so a
  wedged pool will fail the step but unblock the runtime deploy (which
  connects via the Cloud Run socket, not the proxy). Proven in the
  2026-05-15 pool-saturation incident: five sequential deploys
  (`4cabd35`, `cd4f14e`, `1d6fdca`, `75298eb`, plus this one riding
  the my-direct-requests `'pending'` whitelist fix at `f8c49ea`) rode
  the token — the first two invoked case (2) to break the wedged
  pool, `75298eb` carried by inertia while the pool drained, and the
  pool re-wedged 25 minutes later when PR #18 merged (db:push failed
  with `FATAL: remaining connection slots are reserved for
  non-replication superuser connections` on run 25910819034), needing
  one more token ride to get the fix onto Cloud Run.
- **Manual trigger**: deploys auto-fire on every push to `main` that matches
  the path filter above (see Trigger), so a manual kick is rarely needed.
  When it is — e.g. re-running after a transient failure on a no-op commit,
  or shipping a deploy that touched no path-filtered files — use
  `gh workflow run deploy-fast.yml --ref main`. The legacy
  `gcloud builds submit --config=apps/fast/cloudbuild.yaml .` path is gone;
  no Cloud Build config exists for fast (only the four sibling apps —
  heroes-api, heroes-web, portal-api, portal-web — keep one).
- **Live URL**: `https://aha-coms.web.app/fast/` (Firebase Hosting →
  `coms-fast-web` via path-based rewrite). The raw Cloud Run URL
  `https://coms-fast-web-45tyczfska-et.a.run.app` exists but isn't
  user-facing.

## Code modification

- **Commit format.** Plain technical English. The title is a verb +
  em-dash + technical consequence (e.g. `Fix SSE channel leak — abort
  signal now closes the interval on disconnect`). The body explains the
  why. Every commit ends with exactly these four trailers — and only
  these. **NO `Co-Authored-By: Claude` line, NO `🤖 Generated with
  [Claude Code]` footer.** Claude Code's defaults insert both; strip
  them before committing.

      Confidence: high | medium | low
      Scope-risk: <one-line description of blast radius if wrong>
      Tested: <what you actually ran to verify>
      Related: <FU-IDs, ADR refs, file:line refs, or `none`>

  Example:

      Fix SSE channel leak — abort signal now closes the interval on disconnect

      The /api/channels/stream route opened a setInterval at request start
      but only cleared it inside the stream's catch handler. A client that
      disconnected cleanly (no error thrown) left the interval running for
      the lifetime of the Cloud Run instance. Wired the cleanup to
      request.signal.addEventListener('abort', ...) so the interval closes
      on either path.

      Confidence: high
      Scope-risk: SSE routes only — no behaviour change for non-streaming endpoints.
      Tested: bun run --filter @coms-portal/fast typecheck; manual: opened
        /channels/stream, killed the tab, watched server logs confirm the
        interval cleared.
      Related: apps/fast/app/api/channels/stream/route.ts:42

  The trailers are searchable: `git log --grep "Confidence: low"`,
  `git log --grep "Scope-risk:"`, `git log --grep "Tested:"`. They are
  the load-bearing part of the format — keep them on every commit, even
  the small ones (use `Tested: typecheck` and `Related: none` if there is
  truly nothing more).
- **The `Author: Mr. Door` anchor is reserved for the operator's
  commits.** Do not append it to yours — it is @mrdoorba's personal
  signature.
- **Pre-commit hooks** that fire on every commit:
  - `Detect hardcoded secrets` — regex scan over the staged diff for
    common secret patterns. The pattern catalogue tightened during FU-15;
    paste a `re_` Resend key or a DSN literal and the commit fails.
  - `code-review-graph detect-changes` — schema-graph consistency check.
- **Merges into `main` go through a PR.** The `Sequence 0 — main
  protection` ruleset requires both `Typecheck & unit tests` and
  `Lint hardcoded URLs` status checks to pass; force-pushes and
  branch deletions stay blocked. **As of 2026-05-15 the review
  requirement is relaxed** — open a PR, wait for both checks green,
  merge it yourself. CODEOWNERS routing (`.github/CODEOWNERS`) still
  pings @mrdoorba on cross-cutting paths (`/packages/`, `/infra/`,
  `/.github/`) and on co-owned `/apps/fast/` paths, but approval is
  advisory now — not a hard gate. The full rationale is in
  `docs/adr/0012-sequence-0-main-protection.md`'s 2026-05-15
  addendum.

  The PR template at `.github/pull_request_template.md` auto-fills the
  description with a cross-app-impact checklist; fill it in honestly so
  the diff stays self-explanatory for the relaxed-review model.
- **Secrets handling**. NEVER embed secrets in code. Production secrets live
  in GCP Secret Manager and reach Cloud Run via env vars wired by IaC
  (`infra/fast/cloud-run.tf` `fast_runtime_secret_env` local). Three live
  secrets:
  - `aha-fast-db-url` — Cloud SQL DSN (password rotated via FU-15 / Op-3).
  - `aha-fast-apps-script-secret` — Apps Script HMAC (rotation in flight;
    see Pending below).
  - `aha-fast-google-client-secret` — Google Calendar OAuth.
  For one-off scripts: `gcloud secrets versions access latest --secret=<name>`.
- **Email transport: Apps Script only.** Resend was retired in FU-18 (the
  public-repo + free-tier shape made it dead-weight). All five active senders
  in `apps/fast/lib/email.ts` call Apps Script via HMAC; **there is no
  fallback**. If `APPS_SCRIPT_SECRET` is unset the send fails loudly rather
  than authenticating with a historical literal. The env var carrying the
  "who gets the notification" recipient is now `ADMIN_NOTIFICATION_EMAIL`
  (was `RESEND_NOTIFICATION_EMAIL`).
- **Apps Script source mirror**. `apps/fast/scripts/google-apps-script-email.js`
  is a mirror of the Apps Script project's `Code.gs`. Editing it does NOT
  update the live script — you also have to paste into the Apps Script web
  editor + redeploy. The live `SHARED_SECRET` script property must match
  Secret Manager `aha-fast-apps-script-secret`.

## Cloud Run shape (so you know what you're hitting)

- Service: `coms-fast-web` in `fbi-dev-484410` / `asia-southeast2`.
- min=1, max=5, cpu=1, memory=512Mi. (max raised from 3 by the
  2026-05-15 scale-out audit — Cloud Monitoring's 7-day window had
  active instance count p95=max=3 hitting the old ceiling, while CPU
  and memory carried 40–50% headroom; the binding signal was
  service-level concurrency, not per-instance saturation.)
- **cpu_idle=true** (FU-21 audit 2026-05-14 flipped this from false after
  finding no module-level continuous background work — the legacy Path-X
  rationale was theoretical). First request after a quiet window pays
  ~50-200ms wakeup latency.
- **session_affinity=true** (the three SSE routes in `app/api/{chat,
  notifications,channels}/stream/` carry per-instance state via setInterval
  scoped to `request.signal.abort`; affinity routes consecutive requests
  from the same client to the same instance).

## Pending action items for the Fast engineer

The Apps Script editor lives under `alif.masyhur@ahacommerce.net`, not the
operator's `handers.the@ahacommerce.net` — so these were left for you. Full
context in `tasks/todo.md` under FU-18's caveat block.

**FU-18 (b): finish the Apps Script HMAC rotation.** Three of five steps
already landed in the 2026-05-14 operator window (script rewritten to read
from PropertiesService; Secret Manager v2 created and disabled; Cloud Run
pinned to v1 via `infra/fast/cloud-run.tf:153`). Two remain for you:

1. **Apps Script editor**. Open https://script.google.com logged in as the
   owner. Replace `Code.gs` with the contents of
   `apps/fast/scripts/google-apps-script-email.js`. Save. In Project Settings
   → Script Properties, set `SHARED_SECRET` to a chosen value — either
   re-enable v2 of the Secret Manager secret and read its value
   (`gcloud secrets versions enable 2 --secret=aha-fast-apps-script-secret
   --project=fbi-dev-484410 && gcloud secrets versions access 2
   --secret=aha-fast-apps-script-secret --project=fbi-dev-484410`) or
   generate your own via `openssl rand -hex 32` and add it as v3
   (`gcloud secrets versions add aha-fast-apps-script-secret
   --data-file=- --project=fbi-dev-484410`). Run `testSend` in the editor to
   verify end-to-end. Deploy → Manage deployments → existing deployment →
   edit (pencil) → "New version" → Deploy.

2. **Lift the Cloud Run pin**. Edit `infra/fast/cloud-run.tf` (around line
   153) to change the `APPS_SCRIPT_SECRET` version pin from `"1"` back to
   `"latest"` (or to the specific version number you chose). Then
   `cd infra/fast && tofu apply` from the laptop. Cloud Run rolls a new
   revision; the new value takes effect on the next cold start.

3. **Cleanup**. Once you've verified emails flow through the new secret,
   disable v1: `gcloud secrets versions disable 1
   --secret=aha-fast-apps-script-secret --project=fbi-dev-484410`. The
   historical literal `aha-fast-email-secret-2026` becomes unauthenticated
   end-to-end. Then update `tasks/todo.md`'s FU-18 caveat block to record
   completion + flip FU-19's partial-2 from gated to unblocked. The operator
   then runs the second force-push window for the history scrub.

## Quick references

- `apps/fast/README.md` — application surface (routes, features, schemas).
- `apps/fast/PROJECT_CONTEXT.md` — pre-integration architectural context.
- `tasks/todo.md` — running corridor of follow-ups. Search `FU-18`,
  `FU-19`, `FU-20`, `FU-21`, `FU-22`, `FU-23`, `FU-24`, `FU-25`, `FU-26`
  for fast- or access-related items.
- `tasks/plan.md` — Spec 05 plan documenting the migration.
- `infra/README.md` — laptop-CLI runbook for `tofu apply`.
- `docs/adr/0011-fast-keeps-prisma.md` — why fast keeps Prisma when the
  rest of the suite is on Drizzle; the per-app exception's reopen
  criteria.
- `docs/adr/0012-sequence-0-main-protection.md` — the ruleset +
  CODEOWNERS + Sequence 0 bypass-team model, and the 2026-05-15
  addendum where the review requirement was relaxed (CI checks are
  the only hard gate).
