# Fast E2E smoke checklist (T87 → CP21)

The end-to-end verification walk that closes Phase 10 / CP21 / Spec 05.
Mirrors heroes' T47 shape adapted for fast's React/Next.js surface,
brownfield context, and the post-CP18-closure webhook + taxonomy
state. Estimated time: **30–45 minutes** if no findings surface;
longer when an admin write path or the OAuth round-trip needs
investigation.

> Authored 2026-05-14 as T87's code-side artefact. The operator runs
> this checklist live against `https://aha-coms.web.app/fast/`
> after the CP14→CP20 runbook has crossed. Each section ends with
> the **record-and-flip** clause naming what to write into
> `tasks/todo.md` under T87's entry.

## What this checklist proves

Eight surfaces in one sitting, each tied to a contract clause:

| # | Surface | Contract anchor |
|---|---|---|
| 1 | Sign-in via portal | §1 Authentication and session |
| 2 | Chrome render (desktop + mobile) | §3 Chrome and account widget |
| 3 | Cross-app navigation | §3 + §5 Routing and base path |
| 4 | Admin operations (load + write) | §7 ORM and data layer |
| 5 | Public surfaces (`/request`, `/track`) | §1 escape hatches |
| 6 | OAuth round-trip (Google Calendar) | §5 base-path handling |
| 7 | Portal webhook delivery | §11 Portal webhooks |
| 8 | PWA install verification | §9 PWA and service worker |

After all eight pass, **CP21 crosses** (the formal Spec 05 seal).
T88's perf measurement is a separate operator window (live timing
against a pre-migration baseline).

## Prerequisites

- All prior checkpoints crossed: CP13–CP20 verifiable from
  `tasks/todo.md` (CP14, CP15, CP17, CP18, CP19, CP20 all `[x]`).
- The CP14→CP20 runbook walked end-to-end (see
  [`runbook-cp14-cp20-window.md`](runbook-cp14-cp20-window.md)).
- Fresh incognito window (or browser profile without `__session`).
- An `@ahacommerce.net` Google account with fast access granted
  (`app_registry`-level: fast is in the user's `apps` claim).
- Phone with Chrome (Android) + a desktop with Chrome or Brave for
  the PWA install check.
- `gcloud` configured against `fbi-dev-484410` for the optional
  webhook smoketest (sub-section 7b).

## Step 1 — Sign in via portal (§1)

Open `https://aha-coms.web.app/fast/dashboard` in the incognito
window.

Expected:

1. Browser issues `GET /fast/dashboard`, receives `307` →
   `https://aha-coms.web.app/portal?app=fast&redirect_to=%2Ffast%2Fdashboard`.
2. Portal sign-in page renders. Sign in with Google.
3. Portal sets `__session` (HttpOnly, Secure, SameSite=Lax,
   Path=/, host-only on `aha-coms.web.app`).
4. Browser honours `redirect_to`, lands at
   `https://aha-coms.web.app/fast/dashboard`.

**Verify in DevTools → Application → Cookies:**

- One cookie named `__session` on `aha-coms.web.app`.
- No `coms_session`, no `better-auth.session`, no app-local cookies.
- `HostOnly = true`, `Path = /`.

**Findings to expect.** None typically; the auth corridor was
sealed in CP15. If sign-in loops, see the runbook's recovery
table for `__session` scope troubleshooting.

**Record:** PASS / FAIL under T87 step 1.

## Step 2 — Chrome render (§3)

Still in the authenticated session.

**Desktop (≥md breakpoint, viewport width ≥768px).** Expected
layout:

```
[ ServiceBar (36px high, top:0)            ]  ← @coms-portal/ui-react
[ Fast TopNav (64px high, top:36px)        ]  ← apps/fast/components/layout/TopNav.tsx
[ Fast Sidebar (collapsed 64px, top:100px) ]  ← apps/fast/components/layout/Sidebar.tsx
[ Page content (offset by sidebar width)   ]
```

ServiceBar carries:
- Three tabs: **COMS** / **AHA Heroes** / **AHA Fast** (AHA Fast
  marked "Here" / active).
- Left slot: brand `F` mark (gradient + letter), label "AHA Fast".
- Right slot: AccountWidget avatar with the operator's initials.

Fast TopNav carries (post-FU-from-finding-4 strip):
- Notification bell.
- (No theme toggle — ServiceBar's covers cross-app concerns;
  fast's TopNav lost that surface in commit `61a58be`.)
- (No profile menu in TopNav — AccountWidget owns it.)

**Mobile (<md, viewport width <768px).** Expected:

- ServiceBar hidden (`hidden md:flex`).
- Fast's TopNav serves as the only top bar.
- Fast's BottomNav sits at the bottom.

**Test the AccountWidget popover** (desktop):

1. Click the avatar in ServiceBar's right slot.
2. Popover should render with: name + email + portalRole badge →
   "Manage account" link (→ portal `/profile`) → app launcher
   showing all three apps with "Here" on AHA Fast → "Sign out".

**Findings to expect.** Two-avatar visual artifact if TopNav's
in-app profile menu wasn't fully stripped (see commit `61a58be`).
If you see one, file as a T75 cosmetic finding, not a CP21
blocker.

**Record:** PASS / FAIL under T87 step 2 with screenshots if the
layout differs from above.

## Step 3 — Cross-app navigation (§3, §5)

Click each ServiceBar tab in sequence:

1. **AHA Fast → COMS** (portal).
   - URL flips to `https://aha-coms.web.app/portal/...`.
   - Portal's chrome renders; no re-auth prompt.
   - DevTools shows `__session` cookie still attached.
2. **COMS → AHA Heroes**.
   - URL flips to `https://aha-coms.web.app/heroes/...`.
   - Heroes' chrome (SvelteKit-rendered) renders.
   - No re-auth.
3. **AHA Heroes → AHA Fast** (back to start).
   - Back at `/fast/...` with the AccountWidget showing the
     operator.

**Test sign-out:**

1. Open AccountWidget → click "Sign out".
2. Browser hits portal's `/api/auth/sign-out`.
3. `__session` cookie clears.
4. Browser redirects to the post-logout destination
   (`https://aha-coms.web.app/`).

**Verify:** Try `https://aha-coms.web.app/fast/dashboard` again.
Expected: bounces through portal sign-in again (cookie cleared).

**Findings to expect.** None typically; CP17's authenticated walk
already exercised this in the CP14→CP20 window.

**Record:** PASS / FAIL under T87 step 3.

## Step 4 — Admin operations (§7)

Sign back in. Navigate to fast's admin surfaces (operator must have
admin role on fast — `User.role = 'admin'` post-Spec-07
app-config or via the `set-admin.ts` script).

**Load-path verification** — every admin-equivalent page renders
without 500-ing. Fast's admin surfaces live flat (no `/admin/*`
namespace today; the underlying architectural question of whether
fast should grow one mirroring heroes' `/heroes/admin/*` is logged
as an open follow-up under T87). Walk through these in order:

1. `/fast/users` (fast's admin landing — the User Control Panel,
   leader-gated via `requireLeader: true`).
2. `/fast/users?tab=teams` (team settings via the Users page's
   tab query).
3. `/fast/users?tab=roles` (role assignment via the Users page's
   tab query).
4. `/fast/changelog` (changelog publishing).
5. `/fast/activity-log` (activity log).

For each: page renders with data, no console errors, no 5xx in
DevTools Network tab.

**Why this matters.** Heroes' T47 surfaced Finding 1: all five
admin pages 500'd on initial load because `+page.server.ts` files
were calling `event.fetch('${base}/api/v1/...')` post-single-
origin migration, which routed back to heroes-web's own router
(no such route → 404 HTML → JSON parse fail). The fix was direct
service imports. Fast's equivalent pattern: Server Components call
`lib/` functions directly, not their own `/fast/api/*` routes.
Verify no Server Component is making a `fetch('/fast/api/...')`
loopback call — if any 500s, audit the broken page's loader and
swap fetch loops for direct `lib/` imports.

**Write-path verification** (one canonical write to prove the
chain end-to-end):

1. Navigate to the team settings or user-management surface.
2. Make a small reversible change (e.g., toggle a user's role from
   member → leader, then back).
3. Verify the change persists on reload.

**Record:** PASS / FAIL per page under T87 step 4. Note any 500s
with the broken loader's path.

## Step 5 — Public surfaces (§1 escape hatches)

Open a **fresh incognito window** (no `__session`).

**Test `/request`** (anonymous task submission):

1. `https://aha-coms.web.app/fast/request`.
2. Page should render WITHOUT redirecting to portal sign-in
   (middleware allowlist covers `/request` per
   `apps/fast/middleware.ts:19`).
3. Submit a test task with a low-impact title + description.
4. Note the reference code shown after submission.

**Test `/track`** (anonymous tracking by reference code):

1. `https://aha-coms.web.app/fast/track`.
2. Renders without sign-in (allowlist).
3. Enter the reference code from `/request` above.
4. Status reflects the submitted task.

**Find the test task in admin** (back in the authenticated session
from step 1 — sign back in if needed):

1. Navigate to team inbox or task queue.
2. Verify the test task appears.
3. Optionally clean up by deleting or marking complete.

**Record:** PASS / FAIL under T87 step 5.

## Step 6 — OAuth round-trip (§5)

Verify the Google Calendar OAuth redirect URI works post-Phase-4
basePath migration.

1. Navigate to a fast surface that triggers Google Calendar OAuth
   (typically: meeting scheduling or routine-task setup that needs
   Calendar permission).
2. Initiate the OAuth flow.
3. Google's consent screen renders at `accounts.google.com`.
4. Approve.
5. Google redirects to
   `https://aha-coms.web.app/fast/api/auth/google/callback?code=...`.
6. Fast's callback handler processes the code, stores tokens, and
   redirects to the originating surface.

**Why this matters.** T67 registered the post-Phase-4 redirect URI
(`/fast/api/auth/google/callback`) in Google Cloud Console; if a
prior URI without the `/fast` segment was the only one registered,
Google rejects the redirect and the flow breaks.

**Record:** PASS / FAIL under T87 step 6. If the consent screen
errors with `redirect_uri_mismatch`, check Google Cloud Console's
OAuth credentials for the fast project + confirm the registered
URI matches the live callback path.

## Step 7 — Portal webhook delivery (§11)

The CP18 closure step already proved end-to-end webhook delivery
via the smoketest. T87 re-verifies the corridor is still live.

**7a — Confirm `app_webhook_endpoints.status = 'active'`.** Reuse
the portal proxy from the runbook's step 2:

```bash
cloud-sql-proxy --port 5434 \
  fbi-dev-484410:asia-southeast2:coms-aha-heroes-db &
PORTAL_DSN=$(gcloud secrets versions access latest \
  --secret=coms-portal-database-url --project=fbi-dev-484410)
DATABASE_URL=$(echo "$PORTAL_DSN" \
  | sed -E 's#@/([^?]+)\?host=/cloudsql/[^&]+#@127.0.0.1:5434/\1#')

psql "$DATABASE_URL" -c "
  SELECT ar.slug, awe.status, awe.last_failure_reason, awe.failure_count
  FROM app_webhook_endpoints awe
  JOIN app_registry ar ON ar.id = awe.app_id
  WHERE ar.slug = 'fast';
"
# Expect: status=active, failure_count=0 (or low + no recent failure).
```

**7b — Run the smoketest one more time.** Confirms portal can
still reach fast's verifier:

```bash
PORTAL_AUDIENCE="https://coms-portal-api-45tyczfska-et.a.run.app"
ID_TOKEN=$(gcloud auth print-identity-token \
  --audiences="$PORTAL_AUDIENCE" \
  --include-email \
  --impersonate-service-account=coms-fast-web-sa@fbi-dev-484410.iam.gserviceaccount.com)

curl -sS -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS: %{http_code}\n" \
  "https://aha-coms.web.app/api/v1/apps/fast/smoketest"
# Expect: {"ok":true,"endpoints":[{"status":200,"latencyMs":<N>}]}
```

**7c — Verify the dedup row and taxonomy_cache state:**

```bash
# Fast DB proxy (port 5435) — see runbook step 3 for the password
# extraction and PGPASSWORD pattern.
PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c \
  "SELECT COUNT(*) AS events_ever, MAX(received_at) AS most_recent
     FROM portal_webhook_events;"
# Expect: events_ever ≥ 1, most_recent within the last minute.

PGPASSWORD="$FAST_PASS" psql "$FAST_CONN" -c \
  "SELECT taxonomy_id, COUNT(*) AS entries
     FROM taxonomy_cache GROUP BY taxonomy_id;"
# Expect: one row for 'teams' with entries matching portal's
# org_taxonomies count (~13 entries at last seed).
```

**Findings to expect.** None if CP18 closure held. If the
smoketest 401s, recheck `SELF_PUBLIC_URL` on fast's live Cloud Run
env (FU-24 lesson — must be bare origin
`https://aha-coms.web.app`, no `/fast` suffix).

**Record:** PASS / FAIL under T87 step 7 with the smoketest's
returned `latencyMs`.

## Step 8 — PWA install (§9)

The CP20 closer in the runbook already walked this once. T87
re-verifies on a fresh device or browser profile.

**On an Android phone with Chrome** (or desktop Chrome with
DevTools mobile emulation):

1. Visit `https://aha-coms.web.app/fast/`.
2. Chrome menu → "Add to home screen" → "Install" → tile label
   reads "Fast" (the manifest's `short_name`; the longer `name:
   'AHA Fast'` is what surfaces in the install dialog header).
3. Tile lands on home screen with the AHA brand mark icon
   (deep-navy circular gradient — `apps/fast/public/icon-{192,
   512}.png`, the existing fast-blue mark T84 kept rather than
   re-rendering).
4. Launch the tile.
5. App opens in standalone chrome (no browser address bar) with
   fast's splash on launch.

**Verify scope isolation.** If portal and heroes are also
installed:

- Each tile is distinct (separate icon, separate splash, separate
  in-launcher entry).
- Cross-app links inside fast's standalone PWA open in-PWA when
  inside the `/fast/` scope or bounce to the sibling PWA per
  Chrome's `scope_extensions` heuristics.

**Lighthouse PWA audit** (re-run if the desktop browser is handy):

```bash
# Pinned to lighthouse@11 — Lighthouse 12 (released 2024) retired
# the bundled `pwa` category. The individual audits still exist
# but are no longer aggregated into one score. T87 walk on
# 2026-05-14 confirmed the pin holds (Finding 10). Long-term
# alternative: migrate to Lighthouse 12 with `--only-audits=
# installable-manifest,service-worker,viewport,themed-omnibox,
# content-width,apple-touch-icon,maskable-icon,splash-screen,
# offline-start-url` once the per-audit invocation is preferred.
#
# Audit URL pick: /fast/track (public surface, no auth redirect).
# /fast/ auth-redirects to portal/login for unauthenticated
# Lighthouse runs, which would audit portal's PWA properties
# rather than fast's. /fast/track is the cleanest public proxy.
npx -y lighthouse@11 https://aha-coms.web.app/fast/track \
  --only-categories=pwa \
  --form-factor=mobile \
  --throttling-method=devtools \
  --output=html \
  --output-path=apps/fast/docs/t86-lighthouse.report.html
```

Expect every PWA check green. If any item flags, mend it before
sealing CP21 (typical fixes: missing `lang` on `<html>`, missing
description, icons not all sizes).

**Record:** PASS / FAIL under T87 step 8.

## Closer — sealing CP21

When all eight steps PASS, update `tasks/todo.md`:

- T87 `[ ] → [x]` with the recorded outcome — one paragraph
  noting all eight steps passed live against
  `aha-coms.web.app/fast/*`.
- CHECKPOINT 21 `[ ] → [x]`. **CP21 crosses.**

T88 (perf check) is a separate operator-window task running
Lighthouse + WebPageTest against a pre-migration baseline. T75
closer's three screenshots can be captured during step 2 if not
already done. T86 (Lighthouse + on-device install of all three
PWAs) overlaps with step 8 — if the operator captured all three
installs during step 8, T86 flips alongside CP21.

After CP21 closes, Spec 05 is complete. The monorepo holds two
production apps end-to-end on the contract; heroes and fast
together prove framework parity in code; the integration contract
has its second worked example.

## When things go sideways

| Symptom | Probable cause | Recovery |
|---|---|---|
| Step 1 sign-in loops back to portal | `__session` cookie scope missing `Path=/` | DevTools → Application → Cookies; check `Path` column on `__session`. If wrong, audit portal-web's cookie-set handler |
| Step 2 mobile pills/tabs crush the right cluster | After PR #6's header consolidation, cross-app pills and module tabs share one row with the right cluster (bell + theme + account); if the pills/tabs row wraps instead of horizontally scrolling, the bell/avatar can get crushed off-screen | Audit `components/layout/TopNav.tsx` — the cross-app `<nav aria-label="Switch app">` should be `shrink-0 whitespace-nowrap`, the module-tabs `<nav>` should carry `flex-1 min-w-0 overflow-x-auto`, the right cluster should be `pl-4 shrink-0` |
| Step 3 cross-app nav forces re-auth | `__session` not surviving Firebase Hosting forwarding | Check `firebase.json` rewrites; the cookie should flow across all three app paths |
| Step 4 admin page 500s | Server Component fetching its own `/api/*` route in a loopback | Heroes-T47-Finding-1 mirror; convert the loader to a direct `lib/` import |
| Step 5 `/request` redirects to portal | Allowlist missing `/request` in middleware | Audit `apps/fast/middleware.ts:19` PUBLIC_PATH_PREFIXES |
| Step 6 OAuth `redirect_uri_mismatch` | Google Cloud Console's registered URI missing `/fast` segment | Add `https://aha-coms.web.app/fast/api/auth/google/callback` to the OAuth client's authorized redirect URIs |
| Step 7b smoketest 401 with `missing_token` | ID token minted without `--include-email` | Re-mint with the flag |
| Step 7b smoketest 200 + endpoints[0].status=401 | `SELF_PUBLIC_URL` mismatch (FU-24) | `gcloud run services update coms-fast-web --update-env-vars=SELF_PUBLIC_URL=https://aha-coms.web.app` |
| Step 8 Chrome refuses install | Scope overlap with already-installed PWA (FU-10) | Capture `chrome://app-launcher` + the Application panel's scope details, file a Finding |

Most failures here are recoverable in-session. If a Finding cannot
be mended same-session, record it under T87's entry as a deferred
follow-up; CP21 stays `[ ]` until every blocking finding closes.
