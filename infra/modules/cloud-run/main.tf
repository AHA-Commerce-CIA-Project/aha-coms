# Dedicated service account for the Cloud Run service
resource "google_service_account" "cloud_run" {
  project      = var.project_id
  account_id   = "coms-aha-heroes-run-sa"
  display_name = "Cloud Run SA — coms-aha-heroes"
}

# Allow Cloud Run SA to connect to Cloud SQL via Auth Proxy / connector
resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Allow Cloud Run SA to read the DATABASE_URL secret at runtime
resource "google_secret_manager_secret_iam_member" "cloud_run_db_url_access" {
  project   = var.project_id
  secret_id = var.db_url_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Allow Cloud Run SA to read the staging DATABASE_URL secret (used by staging revision)
resource "google_secret_manager_secret_iam_member" "cloud_run_db_url_staging_access" {
  project   = var.project_id
  secret_id = var.db_url_staging_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ── Auth Secrets (owned by this module — Cloud Run-specific) ──────────────────

locals {
  auth_secrets = {
    "coms-aha-heroes-auth-secret"          = "BETTER_AUTH_SECRET"
    "coms-aha-heroes-auth-url"             = "BETTER_AUTH_URL"
    "coms-aha-heroes-google-client-id"     = "GOOGLE_CLIENT_ID"
    "coms-aha-heroes-google-client-secret" = "GOOGLE_CLIENT_SECRET"
  }
}

# The four auth secrets are managed as containers only — TF does NOT manage
# the secret_versions. After a fresh `tofu apply` (e.g. disaster recovery /
# spinning up a new project), populate each with a real value before the
# first `gcloud run deploy`, otherwise Cloud Run rejects the deploy with
# "secret has no enabled versions":
#
#   for s in coms-aha-heroes-auth-secret coms-aha-heroes-auth-url \
#            coms-aha-heroes-google-client-id coms-aha-heroes-google-client-secret; do
#     echo -n "REAL_VALUE_HERE" | gcloud secrets versions add "$s" \
#       --project=fbi-dev-484410 --data-file=-
#   done
#
# A previous revision of this module bootstrapped a placeholder version 1
# under TF management. That pattern broke at first secret rotation: the
# operator overwrote v1 with a real v2 and destroyed v1 for hygiene, but
# `tofu plan` then proposed creating a new placeholder version (which would
# become `:latest` and break Cloud Run's `--set-secrets …:latest` references
# on the next deploy). The bootstrap is now an explicit, one-time runbook
# step — manage the container in code, manage the data out-of-band.
resource "google_secret_manager_secret" "auth" {
  for_each  = local.auth_secrets
  project   = var.project_id
  secret_id = each.key
  replication {
    auto {}
  }
}

# Cloud Run SA needs to read each auth secret
resource "google_secret_manager_secret_iam_member" "cloud_run_auth_access" {
  for_each  = local.auth_secrets
  project   = var.project_id
  secret_id = google_secret_manager_secret.auth[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ── Storage IAM ───────────────────────────────────────────────────────────────

# Read/write uploaded files (screenshots, evidence)
resource "google_storage_bucket_iam_member" "cloud_run_uploads" {
  bucket = var.uploads_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Read/write report exports
resource "google_storage_bucket_iam_member" "cloud_run_exports" {
  bucket = var.exports_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Generate V4 signed URLs — signBlob API requires this role on itself
resource "google_service_account_iam_member" "cloud_run_token_creator" {
  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Enable IAM Credentials API (required for signBlob / signed URLs)
resource "google_project_service" "iamcredentials" {
  project            = var.project_id
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

# ── Cloud Run Service ─────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  project  = var.project_id
  name     = "coms-aha-heroes-app"
  location = var.region

  deletion_protection = false

  # Runtime ownership boundary: deploy.yml's `gcloud run deploy --set-env-vars
  # / --set-secrets / --cpu-boost / --tag staging --no-traffic` is the source
  # of truth for env, startup_cpu_boost, and the traffic block at runtime.
  # The `image`, `template[0].containers[0].env`, the `resources.startup_cpu_boost`
  # attribute, and `traffic` are therefore ignored once the resource exists —
  # `tofu apply` can no longer strip the env vars deploy.yml sets, nor flip
  # away from the staging-tagged revision route.
  #
  # `client` / `client_version` are server-side annotations the Cloud Run API
  # sets to identify the last writer (gcloud, in our case). Without ignoring
  # them, every `tofu apply` proposes setting them back to null and every
  # `gcloud run deploy` writes them again — pointless drift cycle.
  #
  # The TF env blocks below remain as a *bootstrap* default so a fresh apply
  # in a recovery scenario produces a Cloud Run service that starts (the
  # secret-backed envs in particular are needed before deploy.yml ever runs).
  # After the first `gcloud run deploy`, those values are inert.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[0].env,
      template[0].containers[0].resources[0].startup_cpu_boost,
      traffic,
      client,
      client_version,
    ]
  }

  template {
    service_account = google_service_account.cloud_run.email

    # ~3.3x pool size — safe ceiling for db-f1-micro shared vCPU
    max_instance_request_concurrency = 50

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    # Mount Cloud SQL socket directory — avoids needing a VPC connector
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.db_connection_name]
      }
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.db_url_secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCS_BUCKET"
        value = var.uploads_bucket_name
      }

      # Rev 2 §03: portal webhook OIDC verification. PORTAL_SERVICE_ACCOUNT_EMAIL
      # is the SA the portal Cloud Run runs as; confirm with portal team if it
      # changes. SELF_PUBLIC_URL must match exactly what portal mints as 'aud'
      # (computed from app_registry.url). Sourced from var.portal_service_account_email
      # so the literal can't drift from deploy.yml's GitHub Actions variable.
      env {
        name  = "PORTAL_SERVICE_ACCOUNT_EMAIL"
        value = var.portal_service_account_email
      }

      env {
        name = "SELF_PUBLIC_URL"
        # TODO: replace with custom domain when live. Self-referencing
        # google_cloud_run_v2_service.app.uri here would create a cycle, so
        # the value comes from the Rev 2 handoff doc.
        value = "https://coms-aha-heroes-app-45tyczfska-et.a.run.app"
      }

      dynamic "env" {
        for_each = local.auth_secrets
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.auth[env.key].secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.sheet_sync_sa_key_secret_id != "" ? [var.sheet_sync_sa_key_secret_id] : []
        content {
          name = "GOOGLE_SHEETS_SA_KEY"
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.sheet_sync_config.sheet_id_points != "" ? {
          GOOGLE_SHEET_ID_POINTS    = var.sheet_sync_config.sheet_id_points
          GOOGLE_SHEET_ID_EMPLOYEES = var.sheet_sync_config.sheet_id_employees
          SHEET_TAB_EMPLOYEES       = var.sheet_sync_config.tab_employees
          SHEET_TAB_BINTANG         = var.sheet_sync_config.tab_bintang
          SHEET_TAB_PENALTI         = var.sheet_sync_config.tab_penalti
          SHEET_TAB_POIN_AHA        = var.sheet_sync_config.tab_poin_aha
          SHEET_TAB_REDEEM          = var.sheet_sync_config.tab_redeem
        } : {}
        content {
          name  = env.key
          value = env.value
        }
      }

      startup_probe {
        http_get {
          path = "/api/healthz"
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 12
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/api/healthz"
        }
        period_seconds    = 30
        failure_threshold = 5
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Release CPU when not handling requests (cost saving)
        cpu_idle = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_iam_member.cloud_run_sql_client,
    google_secret_manager_secret_iam_member.cloud_run_db_url_access,
    google_secret_manager_secret_iam_member.cloud_run_auth_access,
    google_project_service.iamcredentials,
  ]
}

# Allow unauthenticated public access
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
