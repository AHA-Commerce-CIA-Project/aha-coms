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
  brackets included) on its own line in the commit body. Use this for
  destructive migrations (DROP COLUMN, DROP TABLE) — those need the manual
  `cloud-sql-proxy` + `bun run` sequence per `infra/README.md`. The
  workflow's grep matches the literal at line-start to avoid substring trips
  from prose.
- **Manual escape hatch**: `gcloud builds submit
  --config=apps/fast/cloudbuild.yaml .` from the laptop still works when the
  workflow is offline.
- **Live URL**: `https://aha-coms.web.app/fast/` (Firebase Hosting →
  `coms-fast-web` via path-based rewrite). The raw Cloud Run URL
  `https://coms-fast-web-45tyczfska-et.a.run.app` exists but isn't
  user-facing.

## Code modification

- **Commit voice = Mr. Door**, every commit, PR title + body, and issue title
  + body. Formal/archaic voice anchored to concrete technical detail; every
  commit ends with the literal `Author: Mr. Door` anchor. **NO
  `Co-Authored-By: Claude` lines, NO `🤖 Generated with [Claude Code]`
  footers** — Claude Code's defaults add these and the repo's PreToolUse hook
  at `~/.claude/hooks/mr-door-check` blocks them. The spec lives at
  `~/.claude/skills/mr-door/SKILL.md`; use `/mr-door` to re-invoke it on a
  draft.
- **Pre-commit hooks** that fire on every commit:
  - `Detect hardcoded secrets` — regex scan over the staged diff for
    common secret patterns. The pattern catalogue tightened during FU-15;
    paste a `re_` Resend key or a DSN literal and the commit fails.
  - `code-review-graph detect-changes` — schema-graph consistency check.
- **Branch protection on `main`**: `allow_force_pushes: false`, required
  status checks `Typecheck & unit tests` + `Lint hardcoded URLs`. PRs must
  pass them to merge; direct admin pushes can bypass.
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
- min=1, max=3, cpu=1, memory=512Mi.
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
- `tasks/todo.md` — running corridor of follow-ups. Search `FU-18`, `FU-19`,
  `FU-20`, `FU-21` for fast-related items.
- `tasks/plan.md` — Spec 05 plan documenting the migration.
- `infra/README.md` — laptop-CLI runbook for `tofu apply`.
- `~/.claude/skills/mr-door/SKILL.md` — Mr. Door voice spec.
