# Operator runbook — the CP14 → CP20 window

A single operator session that crosses four Spec 05 checkpoints in one
sitting. Estimated time end-to-end: **30–60 minutes** if no findings
surface; longer if step 4 (registration) or step 5 (destructive apply)
needs investigation.

## What crosses by the end

- **CP14** — fast has no Better Auth surfaces in code AND no orphan
  rows in the DB. The three legacy tables (`session`, `account`,
  `verification`) drop; `User.emailVerified` drops.
- **CP17** — fast renders the platform chrome. ServiceBar visible above
  fast's TopNav on desktop; AccountWidget mounted; cross-app
  navigation flows.
- **CP18** — fast is in `app_registry`. Portal dashboard's HEROES card
  analog now shows fast; webhook endpoint declared (`status='disabled'`
  until T77 lands the consumer).
- **CP20** — fast installs as a distinct PWA from portal-web and
  heroes-web. Three install registrations live on the shared origin,
  scoped by `start_url`.

After this window, **Spec 05 Phase 10** opens (T87 smoke + T88 perf +
T89 README + T90 contract update); **CP21 (Spec 05 complete)** is one
focused session away.

## Why this is one window, not six

Each step's verification produces evidence the next step needs:

1. **Step 1's deploy** lands the four pre-window commits (manifest,
   sw.js, chrome wiring) onto the live revision; nothing past step 1
   reads the new shape until the deploy is green.
2. **Step 2's authenticated walk** confirms middleware T68 fires for
   real sign-ins, the React chrome renders against the live
   `/api/userinfo` response, and `__session` survives every transition.
3. **Step 3's screenshot grid** is captured under the same authenticated
   session step 2 establishes.
4. **Step 4's registration** writes to `portal_db.app_registry`; portal's
   dashboard probe (60s polling) discovers fast within the window.
5. **Step 5's destructive apply** runs deploy-first-then-migrate; the
   step 1 deploy already serves code that reads nothing from the
   to-be-dropped tables.
6. **Step 6's on-device verification** rounds out installability on the
   manifests + service worker step 1 deployed.

## Prerequisites

| Tool | How |
|---|---|
| `git` + `gh` | committer identity already configured; `gh auth login` if expired |
| `gcloud` | `gcloud auth login` then `gcloud config set project fbi-dev-484410` |
| `cloud-sql-proxy` | `gcloud components install cloud-sql-proxy` (`v2.21.1`+) |
| `psql` | `brew install postgresql@16` or any `psql` ≥ 14 |
| `bun` | matches the workspace lockfile (`bun --version` ≥ 1.1) |
| Phone | Chrome (Android) + Brave (Android or iOS) — for step 6 |
| Lighthouse | Chrome DevTools or `npx -y lighthouse@latest` |

IAM you'll need: `roles/cloudsql.client` + `roles/secretmanager.secretAccessor`
on `fbi-dev-484410`, plus the portal-api repo's gh-actions write secret
(for step 4 if you run it locally rather than via CI).

## Step 1 — Push, watch the deploy

The four pre-window commits live on `main` already; they need to land
in prod via `deploy-fast.yml` before step 2 can walk a real corridor.

```bash
cd "$REPO_ROOT"
git status                                  # expect: nothing to commit
git log --oneline origin/main..HEAD         # expect: 0 lines (push happened)
# If the four commits are NOT on origin, push:
#   git push origin main
gh run watch                                # wait for green; cancel with Ctrl-C if it stalls
```

**What to expect.** The workflow runs path-filter against `apps/fast/**`
+ the workspace packages the chrome chunk touches; runs `prisma db push`
through the Cloud SQL proxy (non-destructive for the additive changes);
builds the Docker image; pushes to `coms-fast-registry`; deploys
`coms-fast-web`. Typical green run: 6–8 minutes.

**If the deploy fails.** Check the workflow run's logs in
`gh run view --log`. The Op-6 Dockerfile chain (libssl/Prisma binary
targets) is closed, so failures here are likely fresh — fix at the
source, push a follow-up commit. **Do not skip step 1**; everything
downstream assumes the deploy is green.

## Step 2 — T70 authenticated walk

Open `https://aha-coms.web.app/fast/` in a **fresh incognito window**
(or a browser profile with no `__session` cookie).

Expected flow:

1. **Initial GET** — `https://aha-coms.web.app/fast/dashboard` returns
   `307 → https://aha-coms.web.app/portal?app=fast&redirect_to=%2Ffast%2Fdashboard`
   (middleware T68 firing). If you land directly on `/fast/` without
   a redirect, you already have a `__session` cookie — sign out first.
2. **Portal sign-in** — sign in with your `@ahacommerce.net` Google
   account. Portal sets `__session` (HttpOnly, Secure, SameSite=Lax,
   Path=/, host-only on `aha-coms.web.app`).
3. **Redirect back** — portal honours `redirect_to`, lands you at
   `https://aha-coms.web.app/fast/dashboard`. The 36px ServiceBar
   strip sits above fast's indigo TopNav on desktop; mobile sees only
   the TopNav.
4. **ServiceBar render** — three tabs visible: **COMS** /
   **AHA Heroes** / **AHA Fast** (AHA Fast is the active "Here" tab).
   The right slot carries the AccountWidget avatar with your initials.
5. **Cross-app navigation** — click each ServiceBar tab. `__session`
   survives every transition because Firebase Hosting forwards it
   across the three apps; no re-auth.
6. **AccountWidget popover** — click the AccountWidget avatar. The
   menu shows: name + email + portal role badge → "Manage account"
   (links to portal `/profile`) → app launcher list (same three apps,
   "Here" marker on AHA Fast) → "Sign out".
7. **Sign-out** — click "Sign out". Portal's `/api/auth/sign-out`
   clears the cookie and redirects to the post-logout destination
   (`https://aha-coms.web.app/`). Confirm you can't access
   `https://aha-coms.web.app/fast/dashboard` after — should bounce
   back to the portal sign-in.

**Record the outcome** in `tasks/todo.md` under T70:

```
- **Sealed (operator-window verified, 2026-05-14):** sign-in → fast
  dashboard render → ServiceBar cross-app navigation (portal, heroes,
  fast) → AccountWidget popover → sign-out → re-bounce. Every
  transition green. `__session` HostOnly + Path=/ across all three apps.
```

Flip `T70` from `[ ]` to `[x]`.

**Findings expected.** Likely four categories:

- **Cosmetic** (theme colours, font weights, alignment) — record as a
  T75 finding; don't block CP17 on these.
- **Functional** (a link breaks, a redirect loops) — block CP17; mend
  in a same-window follow-up commit.
- **Visual two-avatar artifact** — desktop shows the AccountWidget in
  the ServiceBar AND fast's in-app TopNav profile menu. Documented as
  intentional in `apps/fast/components/layout/SuiteServiceBar.tsx`'s
  prose; T75 decides whether to collapse.
- **Mobile chrome** — ServiceBar hidden on `<md`. Confirm fast's
  TopNav + BottomNav still work; the chrome mount didn't touch them.

## Step 3 — T75 screenshot grid

Still in the authenticated session from step 2:

```bash
mkdir -p apps/fast/docs/t75-screenshots
# Capture four screenshots via Chrome DevTools (Cmd+Shift+P → "Capture
# full size screenshot") or any screen-capture tool. Save as:
#
#   apps/fast/docs/t75-screenshots/fast-desktop-light.png
#   apps/fast/docs/t75-screenshots/fast-desktop-dark.png
#   apps/fast/docs/t75-screenshots/fast-mobile-light.png   (390×844 viewport)
#   apps/fast/docs/t75-screenshots/fast-mobile-dark.png    (390×844 viewport)
#
# Use Chrome DevTools' device toolbar (Cmd+Shift+M) → "iPhone 14 Pro"
# for the mobile shots.
```

Compare against `packages/ui-react/docs/t54-screenshots/` (heroes
baseline). Document divergences in `apps/fast/docs/t75-screenshots/README.md`:

```markdown
# T75 visual parity capture

| Combo | Parity vs heroes T54 baseline | Notes |
|---|---|---|
| Desktop + light | <verdict> | <notes> |
| Desktop + dark | <verdict> | <notes> |
| Mobile + light | <verdict> | <notes> |
| Mobile + dark | <verdict> | <notes> |
```

Flip `T72 + T73`, `T74`, and `T75` from `[~]` to `[x]` in `tasks/todo.md`.
**CP17 crosses** at this point.

## Step 4 — T76 register fast in `app_registry`

Run from the operator's laptop with portal's DB credentials in env.
The script is **idempotent on slug='fast'** — if fast is already
registered, it logs the existing id and exits 0 without rewriting.

```bash
# Open the Cloud SQL proxy against portal's DB (which shares the
# instance with heroes per FU-13's recorded artefact).
cloud-sql-proxy --port 5434 \
  fbi-dev-484410:asia-southeast2:coms-aha-heroes-db &
PROXY_PID=$!

# Fetch portal's DSN from Secret Manager + rewrite the host to localhost:5434.
# Portal's stored DSN uses the Unix-socket form `@/dbname?host=/cloudsql/...`,
# matching the sed pattern in .github/workflows/deploy-portal-api.yml:119.
PORTAL_DSN=$(gcloud secrets versions access latest \
  --secret=coms-portal-db-url-production \
  --project=fbi-dev-484410)
export DATABASE_URL=$(echo "$PORTAL_DSN" \
  | sed -E 's#@/#@127.0.0.1:5434/#; s#\?host=.*##')

# Env the register script reads (lives in apps/portal-api/scripts/spec07-register-fast.ts).
export FAST_APP_URL=https://aha-coms.web.app/fast
export FAST_APP_SA=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com
export FAST_BROKER_ORIGIN=https://aha-coms.web.app
export FAST_WEBHOOK_HMAC=$(gcloud secrets versions access latest \
  --secret=aha-fast-webhook-hmac \
  --project=fbi-dev-484410)

bun run --cwd apps/portal-api scripts/spec07-register-fast.ts

# Tidy.
kill $PROXY_PID
```

**Expected output:** three `Inserted` lines (app_registry +
app_manifests + app_webhook_endpoints). If `[spec07-register-fast]
FAST already registered (id=…)`, fast was registered previously and
nothing changes — that's fine.

**Post-registration check.** Within 60 seconds, portal's dashboard
probe hits `https://aha-coms.web.app/fast/api/health`, gets 200 +
`dbReachable:true`, and the dashboard's fast card flips to "healthy".

Verify on the live dashboard, then **flip T76 to `[x]`** and
record the registration outcome under T76's body.

**Also flip T79 in the same edit** — T79 is currently `[x]` but its
"portal-side row two" caveat now resolves because `app_registry` carries
`healthCheckUrl=https://aha-coms.web.app/fast/api/health` and the
dashboard probe is running.

Then **enable the uptime alert** — the IaC carried `enabled = false`
on the monitoring uptime check at T80, deliberately, until the route
existed + the registration landed. Now both are true:

```bash
cd "$REPO_ROOT/infra/fast"
# Edit main.tf's monitoring module call: enabled = false → enabled = true
tofu init && tofu plan && tofu apply
```

Commit the IaC change in a follow-up alongside todo.md updates.

## Step 5 — CP14 destructive Prisma apply

The new `coms-fast-web` revision deployed in step 1 reads nothing
from `Session`, `Account`, `Verification`, or `User.emailVerified`.
T64 sealed the code-side cut at commit `95edacb`; the destructive
SQL has been waiting at `apps/fast/prisma/sql/0002_drop_better_auth_tables.sql`
for this window.

**Prerequisite check — T60 backfill.** Every active user needs a
non-null `portal_sub` before the eventual PK promotion. The drop
itself doesn't require this; only the future PK promotion does. To
verify the backfill is in good shape:

```bash
# Different SQL proxy port than step 4 to avoid clobbering.
cloud-sql-proxy --port 5435 \
  fbi-dev-484410:asia-southeast2:aha-fast-db-instance-cd5db712 &
FAST_PROXY_PID=$!

# Fast's stored DSN uses the public-IP form `@HOST:5432/db`, matching the
# sed pattern in .github/workflows/deploy-fast.yml:142.
FAST_DSN=$(gcloud secrets versions access latest \
  --secret=aha-fast-db-url \
  --project=fbi-dev-484410)
FAST_DSN_LOCAL=$(echo "$FAST_DSN" \
  | sed -E 's#@[^/@]+:[0-9]+/#@127.0.0.1:5435/#')

psql "$FAST_DSN_LOCAL" -c \
  'SELECT COUNT(*) FILTER (WHERE portal_sub IS NULL) AS still_null,
          COUNT(*) AS total
     FROM "user";'
```

If `still_null > 0`, the operator runs the backfill first — see the
header comment in `apps/fast/scripts/backfill-portal-sub.ts` for the
CSV-from-portal dance. If `still_null = 0`, proceed.

**Apply the destructive SQL:**

```bash
psql "$FAST_DSN_LOCAL" -f apps/fast/prisma/sql/0002_drop_better_auth_tables.sql

# Verify the three tables are gone:
psql "$FAST_DSN_LOCAL" -c \
  "SELECT to_regclass('session') AS session_table,
          to_regclass('account') AS account_table,
          to_regclass('verification') AS verification_table;"
# Expect three NULLs.

# Verify emailVerified is gone:
psql "$FAST_DSN_LOCAL" -c \
  "SELECT column_name FROM information_schema.columns
     WHERE table_name = 'user' AND column_name = 'emailVerified';"
# Expect zero rows.

# Tidy.
kill $FAST_PROXY_PID
```

**PK promotion (`User.id` → `portal_sub`) is intentionally NOT in this
window.** It cascades through 38 product-model FK relations and
deserves its own commit. T64's body documents the shape; lift to a
follow-up after CP14 closes here.

**Record + flip:**

- `T64` `[~] → [x]`. Record the SQL output + the three-NULLs verification.
- `CHECKPOINT 14` `[ ] → [x]`. **CP14 crosses.**

## Step 6 — T86 Lighthouse + on-device install

### Lighthouse PWA audit

```bash
# Headless Lighthouse — works without a browser open:
npx -y lighthouse@latest https://aha-coms.web.app/fast/ \
  --only-categories=pwa \
  --form-factor=mobile \
  --throttling-method=devtools \
  --output=html \
  --output-path=apps/fast/docs/t86-lighthouse.html
```

Open the report. Three sections matter: **Installable**, **PWA Optimized**,
**Manifest**. Every check should pass green; fix any flagged item
(typically: missing maskable icon, missing `lang` attribute on
`<html>`, missing description, etc.).

### Three-PWA-on-one-device install (closes FU-6 + FU-10's structural promise)

On an Android phone with **Chrome**:

1. Visit `https://aha-coms.web.app/portal/` → menu → "Install app" →
   "AHA COMS" tile lands on home screen with portal icon.
2. Visit `https://aha-coms.web.app/heroes/` → menu → "Install app" →
   "AHA Heroes" tile lands separately (different icon, different
   scope).
3. Visit `https://aha-coms.web.app/fast/` → menu → "Install app" →
   "AHA Fast" tile lands separately.

Open each from its home-screen tile in sequence. Each launches in
standalone chrome with its own splash + scope; cross-app navigation
inside the standalone PWA opens links in-app or hops to a sibling
PWA per Android's `scope_extensions` heuristics.

Repeat on **Brave** (Android or iOS): same three installs, same three
tiles.

**Record + flip:**

- `T86` `[ ] → [x]`. Drop the Lighthouse HTML at the documented path;
  record a sentence under T86 noting all three PWA installs succeeded.
- `T84` + `T85` `[~] → [x]` (live manifest + service worker verified).
- `CHECKPOINT 20` `[ ] → [x]`. **CP20 crosses.**

## Closer — what to commit

Three classes of changes from this window:

1. **`tasks/todo.md` updates** — every flip recorded inline above.
2. **`infra/fast/main.tf`** — the uptime alert flip from `enabled = false`
   to `enabled = true` after T76 landed (commit alongside todo.md
   under the same window's voice).
3. **`apps/fast/docs/`** — `t75-screenshots/` directory, `t86-lighthouse.html`,
   optional findings notes.

Suggested commit shape (Mr. Door voice):

```
Walk the corridor — CP14 + CP17 + CP18 + CP20 cross

The operator window of <date> ran six steps in one sitting:
  - Step 1: ...
  ...

Confidence: high — every step verified live against
 aha-coms.web.app/fast/* + cross-checked against the
 plan body's expected shape.
Scope-risk: ...
Tested: ...

Author: Mr. Door
```

After this window, Spec 05's Phase 10 is the only remaining chunk —
T87 smoke, T88 perf, T89 fast README, T90 contract update. CP21
seals Spec 05 when those four close.

## When things go sideways

| Symptom | Probable cause | Recovery |
|---|---|---|
| Step 1 deploy fails on Prisma binary mismatch | A `prisma generate` cache lingers in CI | Re-run the workflow; if it persists, follow Op-6's binaryTargets chain at commit `43fbafd` |
| Step 2 sign-in loops back to /portal | `__session` cookie scope didn't include `/fast/` | Verify Firebase Hosting's cookie passthrough; FU-2's prior fix for portal-web stands for fast |
| Step 4 reports `FAST already registered` | Prior session ran the script | Confirm the row's `url` matches the new single-origin shape; if not, run the script with `--force-update` (script needs auditing first — operator decides) |
| Step 5 `psql` connects but no tables drop | Schema search_path mismatch | Run `\dt` first; tables may live under a non-`public` schema. The migration is `CASCADE`; safe to retry once. |
| Step 6 Lighthouse reports "manifest missing" | The deploy didn't include the manifest update | Confirm the four commits are on origin AND deployed; `curl https://aha-coms.web.app/fast/manifest.webmanifest` should return JSON, not 404 |
| Step 6 Chrome refuses install | scope overlap with an already-installed PWA | FU-10 was meant to close this; if it recurs, capture the Chrome `chrome://app-launcher` page + the Application panel's scope details, file a Finding |

Most failures here are recoverable in-session. The destructive apply
(step 5) is the only step that needs a rollback plan: re-create the
three tables via `git checkout` at the pre-T64 schema.prisma + run
`prisma db push`. The tables held only Better-Auth-session state, no
product data, so the rollback restores shape without data loss.
