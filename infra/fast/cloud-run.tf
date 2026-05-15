############################################################
# COMS Fast — single Cloud Run service
#
# Per Spec 05 Open Question §3 Option A, fast serves API routes and pages
# from one Next.js runtime — there is no `coms-fast-api`. The single
# `coms-fast-web` Cloud Run service handles `/fast/*` traffic forwarded by
# Firebase Hosting (firebase.json rewrites added in T69).
#
# Runtime SA `coms-fast-web-sa` is fast-only. Cloud SQL access flows through
# the /cloudsql socket mount against `aha-fast-db-instance-cd5db712` — the
# instance is provisioned outside this state (legacy aha-fast terraform);
# we reference it via data source.
#
# Image tag is owned by GitHub Actions (.github/workflows/deploy-fast.yml
# pushes :<git-sha>). Tofu pins :latest at create time and ignores
# subsequent image changes so it does not fight the deploy pipeline —
# same shape heroes uses.
############################################################

# ── Runtime service account ───────────────────────────────────

resource "google_service_account" "fast_web_runtime" {
  project      = var.project_id
  account_id   = "coms-fast-web-sa"
  display_name = "COMS Fast Web Run SA"
  description  = "Runtime identity for the coms-fast-web Cloud Run service. Holds Cloud SQL + Secret Manager + GCS grants."
}

# ── Cloud SQL access ──────────────────────────────────────────

resource "google_project_iam_member" "fast_web_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.fast_web_runtime.email}"
}

# ── Secret Manager access ─────────────────────────────────────
#
# The runtime SA reads three secrets at container start: DATABASE_URL +
# Google OAuth client secret + Apps Script HMAC. The audit recorded in
# variables.tf names what's deliberately excluded (Resend retiring,
# Slack uncalled, cron moved to plaintext-via-tfvars, webhook HMAC
# dormant until T77).

locals {
  fast_runtime_secret_ids = toset([
    var.secret_id_db_url,
    var.secret_id_google_client_secret,
    var.secret_id_apps_script_secret,
  ])
}

resource "google_secret_manager_secret_iam_member" "fast_web_secret_access" {
  for_each = local.fast_runtime_secret_ids

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.fast_web_runtime.email}"
}

# ── GCS access (uploads bucket) ───────────────────────────────
# Fast writes user-uploaded avatars + attachments to the uploads bucket.
# The bucket itself is managed outside this state (aha-fast legacy
# terraform); we grant the runtime SA objectUser on it by name.

resource "google_storage_bucket_iam_member" "fast_web_uploads" {
  bucket = var.gcs_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.fast_web_runtime.email}"
}

# Enable IAM Credentials API once for the project — needed if fast ever
# mints V4 signed URLs against the uploads bucket (the Next.js API routes
# that proxy uploads do not today, but the option stays open).
resource "google_project_service" "iamcredentials" {
  project            = var.project_id
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

# ── Shared env block ──────────────────────────────────────────

locals {
  fast_image_bootstrap = var.app_image

  # Non-secret env projected into the Cloud Run container. Secrets are
  # mounted via env { value_source { secret_key_ref { ... } } } below.
  fast_plain_env = {
    NODE_ENV                  = "production"
    NEXT_PUBLIC_APP_URL       = var.fast_public_origin
    NEXT_PUBLIC_PORTAL_ORIGIN = var.portal_origin
    PORTAL_ORIGIN             = var.portal_origin
    PORTAL_APP_SLUG           = "fast"

    # OAuth client ID + redirect URI are public-by-spec.
    GOOGLE_CLIENT_ID    = var.google_client_id
    GOOGLE_REDIRECT_URI = "${var.fast_public_origin}/fast/api/auth/google/callback"
    GOOGLE_API_KEY      = var.google_api_key

    # HR sheet identity + Apps Script gateway URL — operational, not secret.
    HR_SPREADSHEET_ID     = var.hr_spreadsheet_id
    HR_SHEET_NAME         = var.hr_sheet_name
    APPS_SCRIPT_EMAIL_URL = var.apps_script_email_url
    GCS_BUCKET_NAME       = var.gcs_bucket_name

    # Admin recipient for new-request notifications. Apps Script is the
    # sole send path post-FU-18; apps/fast/lib/email.ts reads this env var
    # as NOTIFICATION_EMAIL and uses it as the recipient for all five
    # active senders.
    ADMIN_NOTIFICATION_EMAIL = var.admin_notification_email

    # Cron bearer token — see variables.tf "Plaintext-via-tfvars" note for
    # why this isn't in Secret Manager. The cloud-run revision config will
    # carry the value in plaintext (visible to anyone with roles/run.viewer
    # on the service); the operator-set tfvars value is the source of truth.
    CRON_SECRET = var.cron_secret

    # Self-identification for portal webhook OIDC audience verification.
    # The audience portal mints is `new URL(endpoint.url).origin` — for a
    # single-origin app like fast (endpoint URL is
    # `https://aha-coms.web.app/fast/api/webhooks/portal`), the origin is
    # `https://aha-coms.web.app`. SELF_PUBLIC_URL MUST match that origin
    # exactly, NOT the basePath-prefixed URL where fast actually serves —
    # appending the `/fast` segment here breaks the audience match and the
    # verifier 401s every inbound webhook. Sealed 2026-05-14 alongside
    # CP18 closure after the smoketest exposed the prior `/fast`-suffixed
    # value as a real audience-mismatch crack.
    PORTAL_SERVICE_ACCOUNT_EMAIL = var.portal_service_account_email
    SELF_PUBLIC_URL              = var.fast_public_origin
  }

  fast_runtime_secret_env = {
    DATABASE_URL         = { secret = var.secret_id_db_url, version = "latest" }
    GOOGLE_CLIENT_SECRET = { secret = var.secret_id_google_client_secret, version = "latest" }

    # APPS_SCRIPT_SECRET pinned to version 1 during the FU-19 (b) handoff
    # window. A candidate v2 holds a random new value; the Apps Script
    # web-app at APPS_SCRIPT_EMAIL_URL still validates v1's literal until
    # the engineer pastes `apps/fast/scripts/google-apps-script-email.js`
    # into the editor + sets the SHARED_SECRET script property + deploys
    # the new Apps Script version. Pin lifts back to `"latest"` (or to a
    # specific number ≥ 2) once the Apps Script side is rotated and the
    # next `tofu apply` rolls a Cloud Run revision picking up the new
    # value. See FU-18's caveat block in `tasks/todo.md`.
    APPS_SCRIPT_SECRET = { secret = var.secret_id_apps_script_secret, version = "1" }
  }
}

# ── coms-fast-web ─────────────────────────────────────────────

resource "google_cloud_run_v2_service" "coms_fast_web" {
  project  = var.project_id
  name     = "coms-fast-web"
  location = var.region
  labels   = local.fast_labels_web

  deletion_protection = false

  template {
    service_account = google_service_account.fast_web_runtime.email

    # Always-warm + idle-throttled + sticky shape. The legacy `aha-fast-app`
    # ran with `minScale=1 + cpu-throttling=false + sessionAffinity=true`;
    # T80's initial migration preserved that triplet conservatively under
    # the principle "the migration's job is to move the app, not silently
    # retune it." FU-21's always-warm audit (2026-05-14) revisited that
    # conservatism with an actual codebase audit and found Op-7's two
    # stated reasons for `cpu_idle = false` did not apply:
    #   1. "Prisma connection pool maintenance between requests" — the
    #      lib/db.ts singleton is `new PrismaClient(...)` with no
    #      module-load setInterval. The pool's idle-eviction timer is
    #      internal to Prisma and self-heals on the first query after
    #      a quiet window (a few hundred ms of cold-path latency, no
    #      structural break).
    #   2. "In-flight Promise resolution between requests" — fast's
    #      three SSE routes (api/chat/stream, api/notifications/stream,
    #      api/channels/stream) carry server-side state via
    #      `setInterval` inside the request handler, scoped to the
    #      open SSE connection. While an SSE client is connected the
    #      request is in-flight and Cloud Run keeps CPU allocated
    #      regardless of `cpu_idle`. There is no module-level
    #      background work that needs CPU between requests.
    # The session_affinity setting stays at `true` because the SSE
    # connections genuinely carry per-instance state — affinity-on
    # routes consecutive requests from the same client to the same
    # instance so the stream's controller + interval handle survive.
    # That concern is unrelated to cpu_idle.
    #
    # Why each setting matters for fast post-audit:
    #   • min_instance_count = 1 — Next.js 15 + Prisma cold-start is
    #     3–5s (React 19 + lightningcss + sharp + Prisma engine init);
    #     for a low-traffic admin app, scale-to-zero means most user
    #     hits eat a cold start. Cost: ~$2.50/mo for the always-warm
    #     instance's allocated memory (CPU is now idle-throttled).
    #   • cpu_idle = true — flipped from `false` by the FU-21 audit.
    #     CPU released between requests. First request after a quiet
    #     window pays ~50–200ms wakeup latency; subsequent requests
    #     during the warm window are instant. Savings vs. the original
    #     `false` choice: ~$47/mo.
    #   • session_affinity = true — preserved. SSE connections carry
    #     per-instance state, so consecutive requests must route to
    #     the same instance.
    #   • max_instance_count = 5 — raised from 3 by the 2026-05-15
    #     scale-out audit. Cloud Monitoring 7-day window showed CPU
    #     p95=39% / max=53% and memory p95=55% / max=58% (well under
    #     per-instance saturation) BUT active instance count
    #     p95=max=3 — autoscaling was hitting the ceiling regularly.
    #     The binding signal was concurrency at the service level, not
    #     CPU/RAM at the instance level, so the answer was scale-OUT,
    #     not scale-UP. Raised the cap to 5 for headroom without
    #     touching the 1 vCPU / 512 MiB per-instance shape. Steady-
    #     state cost unchanged (Cloud Run only bills running instances);
    #     spike-window cost grows ~pro-rata with how often we touch the
    #     new 4th–5th instances.
    scaling {
      min_instance_count = 1
      max_instance_count = 5
    }

    session_affinity = true

    # Mirrors aha-fast-app's containerConcurrency=80; Next.js handles its own
    # request fanout per instance.
    max_instance_request_concurrency = 80

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.fast.connection_name]
      }
    }

    containers {
      image = local.fast_image_bootstrap

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # cpu_idle = true — flipped from `false` by FU-21's always-warm
        # audit (2026-05-14) after auditing fast's codebase for the
        # background-async-work claim Op-7 cited. See scaling-block
        # comment above for the full rationale + savings.
        cpu_idle = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = local.fast_plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.fast_runtime_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      # Cloud Run probes hit the container directly on port 3000, with no
      # Firebase Hosting hop. The path MUST include the basePath prefix
      # because Next.js with `basePath: '/fast'` only matches routes at the
      # prefixed URL — a request to bare `/api/health` returns 404, the
      # probe fails, and the revision never serves traffic. Heroes-api
      # uses the same prefix-included shape (infra/heroes/cloud-run.tf
      # probes `/heroes/api/healthz` not `/api/healthz`).
      #
      # T79 authored `apps/fast/app/api/health/route.ts` returning 200 +
      # `{ status: 'ok', dbReachable: true }` on a trivial prisma
      # round-trip. The bootstrap hello-world image responds 200 to any
      # path, so the first apply's probe passes before the GHA deploy
      # swaps in a real revision.
      startup_probe {
        http_get {
          path = "/fast/api/health"
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 24
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/fast/api/health"
        }
        period_seconds    = 30
        failure_threshold = 5
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_iam_member.fast_web_sql_client,
    google_secret_manager_secret_iam_member.fast_web_secret_access,
    google_project_service.iamcredentials,
  ]

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# ── Public invoker ────────────────────────────────────────────
# Per ADR 0004, Firebase Hosting fronts every COMS service. allUsers invoker
# mirrors heroes' and portal's shape so Firebase's service-account-less
# rewrite path reaches the service.

resource "google_cloud_run_v2_service_iam_member" "fast_web_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.coms_fast_web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
