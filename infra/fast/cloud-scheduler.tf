############################################################
# Cloud Scheduler — routine-reminder cron
#
# Fires POST /fast/api/cron/routine-scheduler every 5 minutes. The
# endpoint is idempotent per template-period, so over-firing is safe;
# the 5-minute cadence keeps the worst-case "I set the template for
# 13:00 WIB" → "the bot actually posts" gap under 5 minutes, which is
# what the operator-side brief on 2026-05-19 asked for after the
# always-warm audit moved Cloud Run min_instance_count from 1 → 0
# (cold starts hide latency but don't suppress scheduled invocations
# the way an unscheduled endpoint would — which is the bug this
# resource fixes).
#
# Auth is the shared `CRON_SECRET` bearer token (already wired into
# the Cloud Run env via cloud-run.tf:117). Cloud Scheduler sends it
# in the Authorization header so the existing constant-time compare
# at apps/fast/app/api/cron/routine-scheduler/route.ts:27 lights up.
# A later window may lift this to OIDC; the current bearer model is
# in-line with `infra/cloud-scheduler.tf`'s OTP-cleanup job in the
# portal-api stack, only with a different auth shape (OIDC there).
############################################################

# ── Scheduler API enable. Idempotent: tofu apply on a project that
#    already has it on is a no-op. We declare it here so a fresh
#    project bootstrap can `apply` from zero without a manual step.
resource "google_project_service" "cloud_scheduler" {
  project            = var.project_id
  service            = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}

# ── The job itself. `* * * * *` UTC = every minute. Tightened from
#    the initial */5 after a 2026-05-19 report of a 16:40 WIB template
#    failing to post by 16:42: with a 5-minute cadence, if the cron
#    tick just before 16:40 fired at 16:39:55 and computed
#    `now < dueAt`, the next firing window opens at 16:44:55 — a
#    ~5-minute dead-zone after the due moment. Dropping to every
#    minute caps the worst-case "due time → bot posts" latency at
#    ~60 seconds. Cost is negligible (Cloud Scheduler's first three
#    jobs in a project are free; beyond that it's $0.10 per million
#    invocations, and 1440 invocations/day is well inside the noise).
#
#    Asia/Jakarta has no DST, so a UTC cadence runs at the same WIB
#    wall-clock cadence forever; and the application-level time math
#    in apps/fast/lib/routine-scheduler.ts projects `now` into each
#    template's IANA tz before comparing against `deadlineTime`, so
#    the scheduler's own time_zone is purely about WHEN it fires —
#    not about HOW it interprets template due-times.
resource "google_cloud_scheduler_job" "routine_scheduler" {
  project          = var.project_id
  name             = "coms-fast-routine-scheduler"
  region           = var.region
  description      = "Fires /fast/api/cron/routine-scheduler every minute so routine task templates spawn their channel-card Tasks within ~60s of their scheduled deadline."
  schedule         = "* * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "180s"

  retry_config {
    retry_count = 2
    # Wait at least 30s between retries so a transient DB blip doesn't
    # produce a tight retry burst against the same /fast/api/* route.
    min_backoff_duration = "30s"
    max_backoff_duration = "180s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.coms_fast_web.uri}/fast/api/cron/routine-scheduler"

    headers = {
      "Authorization" = "Bearer ${var.cron_secret}"
      "Content-Type"  = "application/json"
    }
  }

  depends_on = [
    google_project_service.cloud_scheduler,
    google_cloud_run_v2_service.coms_fast_web,
  ]
}
