############################################################
# COMS Heroes — two Cloud Run services
#
# Per integration contract §8 + ADR 0004 firebase.json, heroes is two
# services rather than one combined image:
#
#   coms-heroes-api  — Elysia + Bun: webhooks, uploads, sheet sync
#   coms-heroes-web  — SvelteKit SSR: the heroes app shell
#
# Each service runs as its own dedicated runtime SA so the IAM blast radius
# matches the workload (api signs URLs and writes to GCS; web only reads
# DATABASE_URL for SSR session lookups). Both share heroes' Cloud SQL proxy
# via the /cloudsql socket mount.
#
# Image tag is owned by Cloud Build (apps/heroes-*/cloudbuild.yaml pushes
# :<git-sha>). Tofu pins :latest at create time and ignores subsequent
# image changes so it does not fight the deploy pipeline.
############################################################

locals {
  # Bootstrap placeholder. The cloudbuild pipelines push to coms-portal-registry
  # (the monorepo-wide Artifact Registry repo declared by infra/registry.tf in
  # the portal Tofu state) and `gcloud run deploy --image=...:<sha>` overrides
  # this at first deploy. lifecycle.ignore_changes pins both image fields, so
  # Tofu does not fight the deploy after bootstrap. Heroes' own
  # coms-aha-heroes-repo (modules/artifact-registry/) is now orphaned by the
  # cloudbuild rewiring done in T16 — leaving it alone for now; cleanup in a
  # follow-up.
  heroes_image_bootstrap = var.app_image

  # Shared plain env — both services need to know who portal is and where
  # they themselves live. PORTAL_BASE_URL points at portal-api for
  # server-to-server calls; PUBLIC_PORTAL_ORIGIN is the same value exposed
  # to client-side code via SvelteKit's $env/static/public.
  heroes_shared_env = {
    NODE_ENV             = "production"
    PORTAL_BASE_URL      = var.portal_base_url
    PORTAL_APP_SLUG      = "heroes"
    PUBLIC_PORTAL_ORIGIN = var.portal_base_url
    PUBLIC_APP_ORIGIN    = var.heroes_public_origin
  }
}

# ── Runtime service accounts ───────────────────────────────────

resource "google_service_account" "heroes_api_runtime" {
  project      = var.project_id
  account_id   = "coms-heroes-api-sa"
  display_name = "COMS Heroes API Run SA"
  description  = "Runtime identity for the coms-heroes-api Cloud Run service. Holds storage + signed-URL + sheet-sync grants."
}

resource "google_service_account" "heroes_web_runtime" {
  project      = var.project_id
  account_id   = "coms-heroes-web-sa"
  display_name = "COMS Heroes Web Run SA"
  description  = "Runtime identity for the coms-heroes-web Cloud Run service. Limited to DB access for SSR session lookups."
}

# Enable IAM Credentials API once for the project (signed URLs need it).
resource "google_project_service" "iamcredentials" {
  project            = var.project_id
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

# ── Cloud SQL access (both SAs) ────────────────────────────────

resource "google_project_iam_member" "heroes_api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.heroes_api_runtime.email}"
}

resource "google_project_iam_member" "heroes_web_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.heroes_web_runtime.email}"
}

# ── DATABASE_URL secret access (both SAs, prod + staging) ──────

resource "google_secret_manager_secret_iam_member" "heroes_api_db_url_prod" {
  project   = var.project_id
  secret_id = module.cloud_sql.db_url_production_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.heroes_api_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "heroes_api_db_url_staging" {
  project   = var.project_id
  secret_id = module.cloud_sql.db_url_staging_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.heroes_api_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "heroes_web_db_url_prod" {
  project   = var.project_id
  secret_id = module.cloud_sql.db_url_production_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.heroes_web_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "heroes_web_db_url_staging" {
  project   = var.project_id
  secret_id = module.cloud_sql.db_url_staging_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.heroes_web_runtime.email}"
}

# ── Storage IAM (api SA only — uploads + exports) ──────────────

resource "google_storage_bucket_iam_member" "heroes_api_uploads" {
  bucket = module.storage.uploads_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.heroes_api_runtime.email}"
}

resource "google_storage_bucket_iam_member" "heroes_api_exports" {
  bucket = module.storage.exports_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.heroes_api_runtime.email}"
}

# Generate V4 signed URLs — signBlob API requires this role on itself.
resource "google_service_account_iam_member" "heroes_api_token_creator" {
  service_account_id = google_service_account.heroes_api_runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.heroes_api_runtime.email}"
}

# ── coms-heroes-api ────────────────────────────────────────────

resource "google_cloud_run_v2_service" "coms_heroes_api" {
  project  = var.project_id
  name     = "coms-heroes-api"
  location = var.region

  deletion_protection = false

  template {
    service_account = google_service_account.heroes_api_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    # ~3.3x pool size — safe ceiling for db-f1-micro shared vCPU.
    max_instance_request_concurrency = 50

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [module.cloud_sql.connection_name]
      }
    }

    containers {
      image = local.heroes_image_bootstrap

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = local.heroes_shared_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "GCS_BUCKET"
        value = module.storage.uploads_bucket_name
      }

      # Rev 2 §03: portal webhook OIDC verification. PORTAL_SERVICE_ACCOUNT_EMAIL
      # is the SA the portal Cloud Run runs as. SELF_PUBLIC_URL must match
      # exactly what portal mints as 'aud' (computed from app_registry.url).
      env {
        name  = "PORTAL_SERVICE_ACCOUNT_EMAIL"
        value = var.portal_service_account_email
      }

      env {
        name  = "SELF_PUBLIC_URL"
        value = var.heroes_api_public_url
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = module.cloud_sql.db_url_production_secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = module.sheet_sync.sa_key_secret_id != "" ? [module.sheet_sync.sa_key_secret_id] : []
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
        for_each = var.sheet_id_points != "" ? {
          GOOGLE_SHEET_ID_POINTS    = var.sheet_id_points
          GOOGLE_SHEET_ID_EMPLOYEES = var.sheet_id_employees
          SHEET_TAB_EMPLOYEES       = "HEROES - Fulltime Staff"
          SHEET_TAB_BINTANG         = "Poin Bintang"
          SHEET_TAB_PENALTI         = "Poin Penalti"
          SHEET_TAB_POIN_AHA        = "Poin AHA"
          SHEET_TAB_REDEEM          = "Redeem Poin AHA"
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
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_iam_member.heroes_api_sql_client,
    google_secret_manager_secret_iam_member.heroes_api_db_url_prod,
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

# ── coms-heroes-web ────────────────────────────────────────────

resource "google_cloud_run_v2_service" "coms_heroes_web" {
  project  = var.project_id
  name     = "coms-heroes-web"
  location = var.region

  deletion_protection = false

  template {
    service_account = google_service_account.heroes_web_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    max_instance_request_concurrency = 80

    # Heroes-web's hooks.server.ts validates SSO sessions in-process via
    # packages/heroes-shared/src/db, which touches Cloud SQL. Spec 02 Phase 2
    # (JWT sessions) will narrow this once heroes-web stops touching the DB.
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [module.cloud_sql.connection_name]
      }
    }

    containers {
      image = local.heroes_image_bootstrap

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = local.heroes_shared_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = module.cloud_sql.db_url_production_secret_id
            version = "latest"
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_iam_member.heroes_web_sql_client,
    google_secret_manager_secret_iam_member.heroes_web_db_url_prod,
  ]

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# ── Public invokers ────────────────────────────────────────────
# Per ADR 0004, Firebase Hosting fronts both services. Until Phase 5 lands,
# the *.run.app URLs serve traffic directly. allUsers invoker mirrors what
# the retired single service had.

resource "google_cloud_run_v2_service_iam_member" "heroes_api_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.coms_heroes_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "heroes_web_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.coms_heroes_web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
