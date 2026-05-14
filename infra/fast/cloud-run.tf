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

# ── External lookups ──────────────────────────────────────────

data "google_sql_database_instance" "fast" {
  project = var.project_id
  name    = var.fast_db_instance_name
}

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

    # Admin recipient for new-request notifications. The variable name
    # carries Resend history but the runtime semantics aren't Resend-specific
    # — apps/fast/lib/email.ts:11 reads it as NOTIFICATION_EMAIL and uses it
    # as the admin recipient for BOTH Apps Script and Resend send paths.
    # Survives FU-18's Resend retirement; only the env-var rename is owed.
    RESEND_NOTIFICATION_EMAIL = var.resend_notification_email

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
    DATABASE_URL         = var.secret_id_db_url
    GOOGLE_CLIENT_SECRET = var.secret_id_google_client_secret
    APPS_SCRIPT_SECRET   = var.secret_id_apps_script_secret
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

    # Always-warm + sticky shape. Matches the deliberate triplet the legacy
    # `aha-fast-app` ran with (minScale=1 + cpu-throttling=false +
    # sessionAffinity=true) — the engineer who tuned that config knew the
    # app well enough to override Cloud Run's serverless defaults, and
    # the migration's job is to move the app, not silently retune it.
    #
    # Why each setting matters for fast specifically:
    #   • min_instance_count = 1 — Next.js 15 + Prisma cold-start is 3–5s
    #     (React 19 + lightningcss + sharp + Prisma engine init); for a
    #     low-traffic admin app, scale-to-zero means most user hits eat
    #     a cold start. Cost: ~$25–40/month for the always-warm vCPU
    #     (legacy was already paying this).
    #   • cpu_idle = false — pairs with min=1. Background async work
    #     (Prisma connection pool maintenance, in-flight Promise
    #     resolution between requests) survives the gap between requests
    #     instead of getting paused.
    #   • session_affinity = true — the legacy's affinity-on flag is the
    #     give-away that something in fast carries server-side state per
    #     instance. Could be SSE for chat/inbox, in-memory caches, or
    #     stateful comment-reply paths. Affinity-on routes consecutive
    #     requests from the same client to the same instance so that
    #     state holds.
    #
    # A future window may audit fast for stateful server-side code and
    # decide which of these can relax. Until then: match production.
    scaling {
      min_instance_count = 1
      max_instance_count = 3
    }

    session_affinity = true

    # Mirrors aha-fast-app's containerConcurrency=80; Next.js handles its own
    # request fanout per instance.
    max_instance_request_concurrency = 80

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [data.google_sql_database_instance.fast.connection_name]
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
        # cpu_idle = false — CPU always allocated, matches legacy's
        # `cpu-throttling: false`. See scaling-block comment above.
        cpu_idle = false
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
              secret  = env.value
              version = "latest"
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
