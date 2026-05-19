# Cron routes — operator guide

Fast runs on **Google Cloud Run + GCP Cloud Scheduler**, not Vercel. There is **no `vercel.json`** in this repo because there is no Vercel deploy — the cron config lives in Terraform.

## Where the cron config lives

`infra/fast/cloud-scheduler.tf` declares a `google_cloud_scheduler_job` named `coms-fast-routine-scheduler` that fires `POST /fast/api/cron/routine-scheduler` every minute (`* * * * *` UTC). The Cloud Run service URL + the `CRON_SECRET` bearer token are wired in from `infra/fast/cloud-run.tf`.

If you came here looking for the equivalent of:

```jsonc
// vercel.json — NOT how fast deploys
{
  "crons": [{ "path": "/api/cron/routines", "schedule": "* * * * *" }]
}
```

…the GCP-native equivalent is:

```hcl
# infra/fast/cloud-scheduler.tf
resource "google_cloud_scheduler_job" "routine_scheduler" {
  schedule  = "* * * * *"
  time_zone = "Etc/UTC"
  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.coms_fast_web.uri}/fast/api/cron/routine-scheduler"
    headers = {
      "Authorization" = "Bearer ${var.cron_secret}"
      "Content-Type"  = "application/json"
    }
  }
}
```

## To activate the cron in production

The Cloud Run deploy pipeline (`.github/workflows/deploy-fast.yml`) only deploys application code — it does **not** apply GCP infrastructure changes. To materialise the Cloud Scheduler job, an operator with `infra/fast/terraform.tfvars` and GCP credentials runs:

```bash
cd infra/fast
tofu apply
```

Once applied, you can verify the job is firing by tailing Cloud Run logs:

```bash
gcloud run services logs read coms-fast-web --region asia-southeast2 --limit 50 \
  | grep '\[routine-scheduler\]'
```

You should see one `run start` line + per-template status lines + one `run end summary=…` line every minute.

## What the cron endpoint does

`apps/fast/app/api/cron/routine-scheduler/route.ts`:

1. Verifies the `Authorization: Bearer <CRON_SECRET>` header via a constant-time compare. Returns 403 on mismatch, 503 if `CRON_SECRET` is unset.
2. Calls `runScheduler(new Date())` from `apps/fast/lib/routine-scheduler.ts`.
3. Catches any unexpected throw, logs `CRON ROUTINE FAILED:` with the full stack trace, and returns 500 so Cloud Scheduler retries per the resource's `retry_config`.

`runScheduler` (in `lib/routine-scheduler.ts`):

- Fetches every `RoutineTaskTemplate` where `isActive = true`.
- For each template, calls `spawnTaskIfDue(templateId, now, force=false)`.
- The per-template call is itself wrapped in try/catch so one template's failure can't abort the sweep.
- The spawn predicate is **headless**: it reads no `session` / `currentUser` / cookie. Auth audit verified 2026-05-19.

## Spawn predicate (rolling-window sweep)

```
spawn iff
    now >= dueAt for the current period in the template's tz
  AND no Task row exists with routineTemplateId = template
      AND createdAt >= periodStart
```

Period is:

| Frequency | periodStart |
|---|---|
| daily | 00:00 in the template's tz today |
| weekly | 00:00 Monday in the template's tz this ISO week |
| monthly | 00:00 on the 1st in the template's tz this month |

A delayed cron run (cold start, retry, exact `* * * * *` tick that landed at 17:09:55 instead of 17:10:00) still fires the template for the right period — `now >= dueAt` is the rolling-window check. The period-existing-task dedup keeps a second cron run after spawn from posting twice.

## Day-of-week mapping (the load-bearing bit for weekly templates)

- `RoutineTaskTemplate.deadlineDay` is `Int` in the schema. Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7 (ISO weekday).
- The schema does **not** store the day name as a string. There is no `"Tuesday"` vs `"tuesday"` vs `"Tue"` matching to worry about.
- `wallClockInTz` (in `lib/routine-scheduler.ts`) projects the current UTC instant into the template's IANA tz via `date-fns-tz`'s `toZonedTime`, then maps JS `getDay()` (0=Sun..6=Sat) to ISO weekday by remapping Sunday from 0 to 7. The Sunday case is the only one where the remap matters; pinned by a unit test in `lib/routine-scheduler.test.ts`.

## Manual "Test Run" vs cron

The manual Test Run button calls `spawnTaskIfDue(templateId, now, force=true)`. The `force` flag bypasses both the period-existing-task dedup AND the `now >= dueAt` check, so Test Run always spawns — that's why it works at any time of day. The cron path always uses `force=false`.

If Test Run works but cron doesn't, the most likely cause is **Cloud Scheduler hasn't been applied with `tofu apply`** — the endpoint exists, the code is correct, but nothing is calling the endpoint. Tail the Cloud Run logs (above) to confirm whether `[routine-scheduler] run start` lines are appearing.
