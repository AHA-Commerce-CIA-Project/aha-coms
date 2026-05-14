# Operator runbook — the CP14 → CP20 window

A single operator session that crosses four Spec 05 checkpoints in one
sitting. Estimated time end-to-end: **45–75 minutes** if no findings
surface; longer if step 2 (registration) or step 3 (destructive apply)
needs investigation.

> Authored 2026-05-14 against the original CP14 → CP20 plan; rewritten
> later the same day after the live walk surfaced that the planned
> order doesn't work (steps depend on each other in a different order
> than the original draft assumed). This file now reflects the
> **executed order** — deploy → register → destructive → walk →
> screenshots → CP18 closure → PWA install. The CP18-closure step is
> a 2026-05-14 addition that didn't exist in the v1 runbook because
> T77's webhook consumer + T78's taxonomy projection hadn't landed
> yet. Subsequent operator windows should follow this order verbatim.

## What crosses by the end

- **CP14** — fast has no Better Auth surfaces in code AND no orphan
  rows in the DB. The three legacy tables (`session`, `account`,
  `verification`) drop; `User.emailVerified` drops.
- **CP17** — fast renders the platform chrome. ServiceBar visible above
  fast's TopNav on desktop; AccountWidget mounted; cross-app
  navigation flows.
- **CP18** — fast is in `app_registry` AND webhooks deliver end-to-end.
  Portal dashboard's HEROES card analog shows fast; webhook endpoint
  flipped to `status='active'`; `taxonomy_cache` seeded with the
  `'teams'` taxonomy; smoketest confirms portal-to-fast delivery
  returns 200 + dedup row.
- **CP20** — fast installs as a distinct PWA from portal-web and
  heroes-web. Three install registrations live on the shared origin,
  scoped by `start_url`.

After this window, **Spec 05 Phase 10** opens (T87 smoke + T88 perf +
T89 README + T90 contract update); **CP21 (Spec 05 complete)** is one
focused session away.

## Why this order, not the original

The v1 runbook had **walk → screenshots → register → destructive** as
steps 2–5. The live walk on 2026-05-14 proved that order doesn't work,
because each downstream step depends on a state earlier in the chain:

1. **The walk needs registration** — `loadFastAuthUser` reads `apps`
   from portal's `/api/userinfo` response; until `app_registry`
   carries fast's row with the post-Phase-4 URL, the user's session
   doesn't include `'fast'` in `apps` and the route throws
   `PortalSessionDeniedError`.
2. **The walk needs the destructive cut** — `/api/auth/me`'s upsert
   path validates `User.emailVerified` (NOT NULL column on the live
   DB until `0002_drop_better_auth_tables.sql` runs); even rows that
   would have UPDATEd via ON CONFLICT abort at INSERT-validation,
   returning 500.
3. **The smoketest of CP18 closure needs the walk** to establish a
   live revision with the right env vars; the audience-mismatch
   check (FU-24) only surfaces under a real portal-issued webhook.

Re-ordered as **deploy → register → destructive → walk → screenshots →
CP18 closure → PWA install**, each step's verification produces evidence
the next step needs without backtracking.

## Prerequisites

| Tool | How |
|---|---|
| `git` + `gh` | committer identity already configured; `gh auth login` if expired |
| `gcloud` | `gcloud auth login` then `gcloud config set project fbi-dev-484410` |
| `cloud-sql-proxy` | `gcloud components install cloud-sql-proxy` (`v2.21.1`+) |
| `psql` | `brew install postgresql@16` or any `psql` ≥ 14 |
| `bun` | matches the workspace lockfile (`bun --version` ≥ 1.1) |
| Phone | Chrome (Android) + Brave (Android or iOS) — for step 7 |
| Lighthouse | Chrome DevTools or `npx -y lighthouse@latest` |

IAM the operator needs on `fbi-dev-484410`:

- `roles/cloudsql.client` — connect to both DB instances via the proxy.
- `roles/secretmanager.secretAccessor` — read DSN + HMAC secrets.
- `roles/iam.serviceAccountTokenCreator` on `coms-fast-web-sa@…` —
  required for step 6's smoketest, which mints an ID token via SA
  impersonation. The 2026-05-14 window discovered the operator account
  didn't carry this; `gcloud iam service-accounts add-iam-policy-binding`
  granted it mid-session (the operator has `roles/owner` on the
  project so self-grant works). If the next operator already has it,
  skip the grant; if not, the grant is one command.

```bash
# Optional pre-window self-grant (operator with project owner):
gcloud iam service-accounts add-iam-policy-binding \
  coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com \
  --member=user:$(gcloud config get-value account) \
  --role=roles/iam.serviceAccountTokenCreator \
  --project=fbi-dev-484410
# IAM propagation: ~25–60 seconds before the impersonation works.
```

## Step 1 — Push, watch the deploy

The pre-window commits live on `main` already; they need to land in
prod via `deploy-fast.yml` before step 2 can do anything portal-side.

> **`[skip-db-push]` gate convention (post-FU-23).** The deploy
> workflow skips the `prisma db push` step when the commit's SUBJECT
> LINE contains `[skip-db-push]` — body prose mentioning the token
> no longer matters (FU-23 fixed the prior whole-message substring
> match that self-tripped on body text). Put the token at the end
> of the subject when you genuinely want to skip; leave it absent
> otherwise.

```bash
cd "$REPO_ROOT"
git status                                  # expect: nothing to commit
git log --oneline origin/main..HEAD         # expect: 0 lines (push happened)
# If commits are NOT on origin, push:
#   git push origin main
gh run watch                                # wait for green; cancel with Ctrl-C if it stalls
```

**What to expect.** The workflow runs path-filter against `apps/fast/**`
+ the workspace packages the chrome chunk touches; runs `prisma db push`
through the Cloud SQL proxy on port 5433 (additive shapes only); builds
the Docker image; pushes to `coms-fast-registry`; deploys
`coms-fast-web`. Typical green run: 3–4 minutes (matches the post-Op-6
Dockerfile chain timing).

**If the deploy fails.** Check `gh run view --log`. The Op-6 chain
(libssl/Prisma binary targets) is closed, so failures here are likely
fresh — fix at the source, push a follow-up. **Do not skip step 1**;
everything downstream assumes the new revision is serving.

## Step 2 — T76 register fast in `app_registry`

Run from the operator's laptop with portal's DB credentials in env.
The script is **drift-detect-and-upsert** (FU-22 shape, sealed
2026-05-14) — if fast is already registered, it inspects each
drift-prone field and either reports "already registered with matching
values" or applies UPDATEs for the diverging fields in a single
transaction.

```bash
# Open the Cloud SQL proxy against portal's DB (which shares the
# instance with heroes per FU-13's recorded artefact).
cloud-sql-proxy --port 5434 \
  fbi-dev-484410:asia-southeast2:coms-aha-heroes-db &
PROXY_PID=$!
until nc -z 127.0.0.1 5434 2>/dev/null; do sleep 1; done

# Fetch portal's DSN from Secret Manager.
# Secret name is `coms-portal-database-url` (NOT
# `coms-portal-db-url-production` — the v1 runbook's secret name
# was wrong; confirmed 2026-05-14).
# Portal's stored DSN is Unix-socket form:
#   postgresql://USER:PASS@/dbname?host=/cloudsql/<instance>
# Rewrite to TCP form pointing at the proxy.
PORTAL_DSN=$(gcloud secrets versions access latest \
  --secret=coms-portal-database-url \
  --project=fbi-dev-484410)
export DATABASE_URL=$(echo "$PORTAL_DSN" \
  | sed -E 's#@/([^?]+)\?host=/cloudsql/[^&]+#@127.0.0.1:5434/\1#')

# Env the register script reads (lives in
# apps/portal-api/scripts/spec07-register-fast.ts).
export FAST_APP_URL=https://aha-coms.web.app/fast
export FAST_WEBHOOK_URL=https://aha-coms.web.app/fast/api/webhooks/portal
export FAST_HEALTH_CHECK_URL=https://aha-coms.web.app/fast/api/health
export FAST_APP_SA=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com
export FAST_BROKER_ORIGIN=https://aha-coms.web.app
# FAST_WEBHOOK_HMAC is stored in app_webhook_endpoints.secret but isn't
# used by fast's verifier (fast uses Google ID-token verification, not
# HMAC). Any non-empty string satisfies the script's requiredEnv check;
# a placeholder is fine for a session that doesn't actually need HMAC
# signing. The portal-side webhook dispatcher falls back to HMAC-only
# when OIDC minting fails, so a real value here would only matter in
# a degraded fallback path.
export FAST_WEBHOOK_HMAC=placeholder-not-used-by-oidc-path

bun run --cwd apps/portal-api spec07:register-fast

# Tidy.
kill $PROXY_PID
```

**Expected output (first-time INSERT path).** Three `Inserted` lines:
`app_registry`, `app_manifests`, `app_webhook_endpoints` (with
`status=disabled`).

**Expected output (drift-detect-and-upsert path).** Either
`already registered with matching values (id=…, status=…); nothing to
do.` (clean) or a list of diverging fields:

```
[spec07-register-fast] Updated app_registry row id=…:
  - url: https://aha-fast-app-…/run.app → https://aha-coms.web.app/fast
  - healthCheckUrl: (null) → https://aha-coms.web.app/fast/api/health
  - serviceAccountEmail: aha-fast-run-sa@… → coms-fast-web-sa@…
  - brokerOrigin: https://coms-portal-app-…/run.app → https://aha-coms.web.app
[spec07-register-fast] Updated app_webhook_endpoints id=…: url=… (status preserved)
```

**Post-registration check.** Within 60 seconds, portal's dashboard
probe hits `https://aha-coms.web.app/fast/api/health`, gets 200 +
`dbReachable:true`, and the dashboard's fast card flips to "healthy".
Verify on the live dashboard.

Then **enable the uptime alert** — the IaC carried `enabled = false`
on the monitoring uptime check at T80, deliberately, until the route
existed + the registration landed. Now both are true:

```bash
cd "$REPO_ROOT/infra/fast"
# Edit main.tf's monitoring module call: enabled = false → enabled = true
tofu init && tofu plan && tofu apply
```

**Flip in `tasks/todo.md`:** T76 `[ ] → [x]` with the script output
recorded under T76's body. Commit the IaC change in a follow-up
alongside todo.md updates.

## Step 3 — CP14 destructive Prisma apply

The new `coms-fast-web` revision deployed in step 1 reads nothing from
`Session`, `Account`, `Verification`, or `User.emailVerified`. T64
sealed the code-side cut; the destructive SQL has been waiting at
`apps/fast/prisma/sql/0002_drop_better_auth_tables.sql` for this
window.

**Prerequisite check — T60 backfill.** Every active user needs a
non-null `portal_sub` before the eventual PK promotion. The drop
itself doesn't require this; only the future PK promotion does. To
verify the backfill is in good shape:

```bash
# Different SQL proxy port than step 2 to avoid clobbering.
cloud-sql-proxy --port 5435 \
  fbi-dev-484410:asia-southeast2:aha-fast-db-instance-cd5db712 &
FAST_PROXY_PID=$!
until nc -z 127.0.0.1 5435 2>/dev/null; do sleep 1; done

# Fast's stored DSN uses the public-IP form `@HOST:PORT/db?schema=public`,
# matching the sed pattern in .github/workflows/deploy-fast.yml.
# Fast's password contains URL-special characters; use the PGPASSWORD +
# key=value connection form rather than the URL form (libpq's URL parser
# is fussy about percent-encoding; key=value sidesteps it).
FAST_DSN=$(gcloud secrets versions access latest \
  --secret=aha-fast-db-url \
  --project=fbi-dev-484410)
FAST_PASS=$(echo "$FAST_DSN" | sed -E 's#^postgresql://[^:]+:(.+)@[^/]+/.*#\1#')
FAST_USER=$(echo "$FAST_DSN" | sed -E 's#^postgresql://([^:]+):.*#\1#')
FAST_DBNAME=$(echo "$FAST_DSN" | sed -E 's#^.*/([^?]+)(\?.*)?#\1#')
FAST_CONN="host=127.0.0.1 port=5435 dbname=$FAST_DBNAME user=$FAST_USER"

PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c \
  'SELECT COUNT(*) FILTER (WHERE portal_sub IS NULL) AS still_null,
          COUNT(*) AS total
     FROM "user";'
```

If `still_null > 0`, the operator runs the backfill first — see the
header comment in `apps/fast/scripts/backfill-portal-sub.ts` for the
CSV-from-portal dance. If `still_null = 0`, proceed.

**Apply the destructive SQL:**

```bash
PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" \
  -f apps/fast/prisma/sql/0002_drop_better_auth_tables.sql

# Verify the three tables are gone:
PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c \
  "SELECT to_regclass('session') AS session_table,
          to_regclass('account') AS account_table,
          to_regclass('verification') AS verification_table;"
# Expect three NULLs.

# Verify emailVerified is gone:
PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c \
  "SELECT column_name FROM information_schema.columns
     WHERE table_name = 'user' AND column_name = 'emailVerified';"
# Expect zero rows.
```

Keep `FAST_PROXY_PID`'s proxy running — step 4's authenticated walk
hits the live `/api/auth/me`, and any subsequent SQL probe in steps 5/6
reuses the same proxy.

**PK promotion (`User.id` → `portal_sub`) is intentionally NOT in this
window.** It cascades through 38 product-model FK relations and
deserves its own commit. T64's body documents the shape; lift to a
follow-up after CP14 closes here.

**Record + flip:**

- `T64` `[~] → [x]`. Record the SQL output + the three-NULLs verification.
- `CHECKPOINT 14` `[ ] → [x]`. **CP14 crosses.**

## Step 4 — T70 authenticated walk

Now both prerequisites the walk needs are in place: `app_registry`
carries fast (step 2) and the destructive cut landed (step 3). Open
`https://aha-coms.web.app/fast/` in a **fresh incognito window** (or a
browser profile with no `__session` cookie).

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
- **Sealed (operator-window verified, <date>):** sign-in → fast
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
  the ServiceBar AND fast's in-app TopNav profile menu. The 2026-05-14
  window stripped the in-app TopNav duplicates (commit `61a58be`); if
  duplicates resurface, audit `apps/fast/components/layout/TopNav.tsx`
  for new state additions that re-introduce the cluster.
- **Mobile chrome** — ServiceBar hidden on `<md`. Confirm fast's
  TopNav + BottomNav still work; the chrome mount didn't touch them.

## Step 5 — T75 screenshot grid

Still in the authenticated session from step 4:

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

## Step 6 — CP18 closure (webhook delivery)

Step 2 wrote the `app_webhook_endpoints` row with `status='disabled'`
— that's the registration shape. To make portal start dispatching, the
status must flip to `'active'`, the taxonomy cache must seed, and the
audience check on fast's verifier must hold against what portal mints.

**Sub-step 6a — Verify SELF_PUBLIC_URL matches portal's mint.** This
is the FU-24 check the 2026-05-14 window discovered the hard way.
Portal mints `aud = new URL(endpoint.url).origin` for every webhook
dispatch; for fast's single-origin endpoint
`https://aha-coms.web.app/fast/api/webhooks/portal`, the audience is
`https://aha-coms.web.app` (no `/fast` suffix).

```bash
gcloud run services describe coms-fast-web \
  --region=asia-southeast2 \
  --project=fbi-dev-484410 \
  --format="value(spec.template.spec.containers[0].env)" \
  | tr ';' '\n' | grep SELF_PUBLIC_URL
# Expect: SELF_PUBLIC_URL value=https://aha-coms.web.app
# (NOT https://aha-coms.web.app/fast — the /fast suffix breaks the
# audience match.)
```

If the live env shows `/fast` suffix (or anything other than the bare
origin), fix it in place via:

```bash
gcloud run services update coms-fast-web \
  --region=asia-southeast2 \
  --project=fbi-dev-484410 \
  --update-env-vars=SELF_PUBLIC_URL=https://aha-coms.web.app
# Cloud Run rolls a new revision; the env-flip is effective in ~30 seconds.
```

The IaC at `infra/fast/cloud-run.tf` was aligned in commit `c7844a3`
(2026-05-14), so a fresh `tofu apply` against the current state should
not drift. If the live env is wrong despite the IaC, the working theory
is that an out-of-band `gcloud run services update` reverted it; the
in-place fix above is sufficient.

**Sub-step 6b — Flip `app_webhook_endpoints.status` to `'active'`.**
Reuse the proxy from step 2 (port 5434) if you killed it, restart it:

```bash
cloud-sql-proxy --port 5434 \
  fbi-dev-484410:asia-southeast2:coms-aha-heroes-db &
PROXY_PID=$!
until nc -z 127.0.0.1 5434 2>/dev/null; do sleep 1; done

PORTAL_DSN=$(gcloud secrets versions access latest \
  --secret=coms-portal-database-url \
  --project=fbi-dev-484410)
DATABASE_URL=$(echo "$PORTAL_DSN" \
  | sed -E 's#@/([^?]+)\?host=/cloudsql/[^&]+#@127.0.0.1:5434/\1#')

psql "$DATABASE_URL" -c "
  UPDATE app_webhook_endpoints
  SET status = 'active'
  WHERE app_id = (SELECT id FROM app_registry WHERE slug = 'fast')
    AND status = 'disabled'
  RETURNING id, status;
"
# Expect one UPDATEd row.
```

**Sub-step 6c — Seed `taxonomy_cache`.** The canonical path is
`bun run apps/fast/scripts/sync-taxonomies.ts` against fast's prod DB
with ADC impersonating `coms-fast-web-sa`. If the operator's account
already carries `roles/iam.serviceAccountTokenCreator` on that SA (see
Prerequisites), this is one command:

```bash
gcloud auth application-default login \
  --impersonate-service-account=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com
# (or `gcloud auth application-default login` once if ADC is already set)

cloud-sql-proxy --port 5435 \
  fbi-dev-484410:asia-southeast2:aha-fast-db-instance-cd5db712 &
FAST_PROXY_PID=$!
until nc -z 127.0.0.1 5435 2>/dev/null; do sleep 1; done

FAST_DSN=$(gcloud secrets versions access latest \
  --secret=aha-fast-db-url --project=fbi-dev-484410)
export DATABASE_URL=$(echo "$FAST_DSN" \
  | sed -E 's#@[^/@?]+:[0-9]+/#@127.0.0.1:5435/#')
export PORTAL_BASE_URL='https://aha-coms.web.app'

bun run apps/fast/scripts/sync-taxonomies.ts
```

**Fallback (SQL-to-SQL) when impersonation is unavailable** — the
2026-05-14 window used this path because the role grant was applied
mid-session and IAM propagation hadn't completed when the seed needed
to happen. Reuse the portal proxy from sub-step 6b and the fast proxy
from step 3:

```bash
# Pull the 'teams' taxonomy entries from portal:
psql "$DATABASE_URL" --tuples-only --no-align --field-separator=$'\t' -c "
  SELECT taxonomy_id, key, value, COALESCE(metadata::text, 'NULL')
  FROM org_taxonomies WHERE taxonomy_id = 'teams' ORDER BY key;
" > /tmp/teams.tsv

# Build a multi-row INSERT for fast:
TOTAL=$(wc -l < /tmp/teams.tsv | tr -d ' ')
{
  echo "BEGIN;"
  echo "INSERT INTO taxonomy_cache (taxonomy_id, key, value, metadata, cached_at) VALUES"
  awk -v total="$TOTAL" -F'\t' '
    {
      metadata = ($4 == "NULL") ? "NULL" : "'"'"'" $4 "'"'"'::jsonb"
      printf "  ('"'"'%s'"'"', '"'"'%s'"'"', '"'"'%s'"'"', %s, NOW())", $1, $2, $3, metadata
      if (NR < total) print ","
      else print ""
    }
  ' /tmp/teams.tsv
  echo "ON CONFLICT (taxonomy_id, key) DO UPDATE"
  echo "  SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, cached_at = NOW();"
  echo "COMMIT;"
} > /tmp/seed-teams.sql

PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -f /tmp/seed-teams.sql

# Verify:
PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c "
  SELECT taxonomy_id, COUNT(*) AS entries FROM taxonomy_cache GROUP BY taxonomy_id;
"
# Expect one row per subscribed taxonomy with the count matching portal.
```

**Sub-step 6d — Smoketest end-to-end.** Mint an ID token via SA
impersonation and call portal's smoketest endpoint:

```bash
PORTAL_AUDIENCE="https://coms-portal-api-45tyczfska-et.a.run.app"
ID_TOKEN=$(gcloud auth print-identity-token \
  --audiences="$PORTAL_AUDIENCE" \
  --include-email \
  --impersonate-service-account=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com)
# --include-email is critical — without it the token omits the email
# claim and portal-api's requireAppToken() rejects with missing_token.
# Confirmed 2026-05-14.

curl -sS -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS: %{http_code}\n" \
  "https://aha-coms.web.app/api/v1/apps/fast/smoketest"
# Expect: {"app":{...},"endpoints":[{"status":200,"latencyMs":<N>}],"ok":true}
# If "endpoints[0].status":401 — recheck sub-step 6a's SELF_PUBLIC_URL.
```

Confirm the dedup row landed:

```bash
PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c \
  "SELECT event_id, received_at FROM portal_webhook_events
     ORDER BY received_at DESC LIMIT 5;"
# Expect: at least one row with received_at within the last minute.
```

**Record + flip:**

- `T77 + T78` `[ ] → [x]` if not already flipped from the code-side
  authoring window (they cross both code-side and operator-side here).
- `CHECKPOINT 18` `[ ] → [x]`. **CP18 crosses.**

Tidy:

```bash
kill $PROXY_PID $FAST_PROXY_PID
rm -f /tmp/teams.tsv /tmp/seed-teams.sql
```

## Step 7 — T86 Lighthouse + on-device install

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
   to `enabled = true` after step 2 landed (commit alongside todo.md
   under the same window's voice).
3. **`apps/fast/docs/`** — `t75-screenshots/` directory, `t86-lighthouse.html`,
   optional findings notes.

Suggested commit shape (Mr. Door voice):

```
Walk the corridor — CP14 + CP17 + CP18 + CP20 cross

The operator window of <date> ran seven steps in one sitting:
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
| Step 1 `Apply Prisma schema (db push)` step skipped unexpectedly | `[skip-db-push]` token in the commit subject line | Push a follow-up commit without the token to force the schema apply (the gate is subject-line-only post-FU-23; body prose containing the token no longer trips it) |
| Step 2 reports `coms-portal-database-url not found` | Old runbook used `coms-portal-db-url-production` | Use the correct secret name `coms-portal-database-url` (confirmed 2026-05-14) |
| Step 2 reports `already registered with matching values` | All five drift-prone fields already match | This is the FU-22 "clean state" path; nothing to do. Proceed to step 3 |
| Step 3 `psql` connects but no tables drop | Schema search_path mismatch | Run `\dt` first; tables may live under a non-`public` schema. The migration is `CASCADE`; safe to retry once |
| Step 4 sign-in loops back to /portal | `__session` cookie scope didn't include `/fast/` | Verify Firebase Hosting's cookie passthrough; FU-2's prior fix for portal-web stands for fast |
| Step 6a SELF_PUBLIC_URL shows `/fast` suffix | An older `tofu apply` predates `c7844a3`'s alignment, or a manual revert | Run the `gcloud run services update` from 6a; commit IaC drift if persistent |
| Step 6d smoketest 401 with `missing_token` | ID token minted without `--include-email` | Re-mint with `--include-email`; portal-api's `requireAppToken()` reads the email claim from the token |
| Step 6d smoketest 401 with empty body | Audience mismatch — `SELF_PUBLIC_URL` on fast ≠ portal's mint | Re-check sub-step 6a; the live env must equal `https://aha-coms.web.app` exactly |
| Step 6 SA impersonation 403 | Operator lacks `serviceAccountTokenCreator` on `coms-fast-web-sa` | Apply the optional pre-window self-grant from Prerequisites; wait 30–60s for IAM propagation |
| Step 7 Lighthouse reports "manifest missing" | The deploy didn't include the manifest update | Confirm the commits are on origin AND deployed; `curl https://aha-coms.web.app/fast/manifest.webmanifest` should return JSON, not 404 |
| Step 7 Chrome refuses install | scope overlap with an already-installed PWA | FU-10 was meant to close this; if it recurs, capture the Chrome `chrome://app-launcher` page + the Application panel's scope details, file a Finding |

Most failures here are recoverable in-session. The destructive apply
(step 3) is the only step that needs a rollback plan: re-create the
three tables via `git checkout` at the pre-T64 schema.prisma + run
`prisma db push`. The tables held only Better-Auth-session state, no
product data, so the rollback restores shape without data loss.
