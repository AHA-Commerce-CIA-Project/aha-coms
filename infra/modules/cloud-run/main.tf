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

resource "google_secret_manager_secret" "auth" {
  for_each  = local.auth_secrets
  project   = var.project_id
  secret_id = each.key
  replication {
    auto {}
  }
}

# Placeholder versions — Cloud Run requires at least one version to exist.
# Overwrite with real values via:
#   echo -n "real-value" | gcloud secrets versions add SECRET_ID --data-file=-
resource "google_secret_manager_secret_version" "auth_placeholder" {
  for_each    = local.auth_secrets
  secret      = google_secret_manager_secret.auth[each.key].id
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_data]
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

  # Image is managed by the GitHub Actions deploy workflow, not OpenTofu.
  # Without this, tofu apply resets the image to the placeholder default.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
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
          SHEET_SYNC_INTERVAL_MS    = var.sheet_sync_config.sync_interval_ms
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
    google_secret_manager_secret_version.auth_placeholder,
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
