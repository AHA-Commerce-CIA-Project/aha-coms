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
  # Bootstrap placeholder. Heroes cloudbuild pipelines push to
  # coms-heroes-repo (declared in modules/artifact-registry/) and
  # `gcloud run deploy --image=...:<sha>` overrides this at first deploy.
  # lifecycle.ignore_changes pins both image fields, so Tofu does not fight
  # the deploy after bootstrap. Per the per-app-resources principle in
  # tasks/plan.md, heroes images live in heroes' own AR repo — not in any
  # shared monorepo-wide registry.
  heroes_image_bootstrap = var.app_image

  # Shared plain env — both services need to know who portal is and where
  # they themselves live.
  #
  # PORTAL_BASE_URL: direct portal-api Cloud Run URL — heroes-api uses this
  #   for server-to-server `IdTokenClient` calls where the audience claim
  #   must match the Cloud Run service identity (taxonomy sync, alias
  #   resolution, etc.). Firebase Hosting would intervene with a hop and
  #   complicate the aud verification.
  # PORTAL_ORIGIN: unified COMS host — heroes-web uses this to build the
  #   browser-redirect URL for portal sign-in (`${origin}/?app=heroes&…`)
  #   and the broker-exchange call (`${origin}/api/auth/broker/exchange`,
  #   resolved by Firebase rewrite). Same origin as the user's browser, so
  #   cookies travel without a cross-origin dance.
  # PUBLIC_PORTAL_ORIGIN: client-side mirror exposed via SvelteKit's
  #   `$env/static/public` — heroes-web does not actually read it today, it
  #   stays in the env block as compatibility ballast.
  # PUBLIC_APP_ORIGIN: this service's own public origin — used by the
  #   (authed) layout to reconstruct an absolute deep-link before redirecting
  #   the unauth user to portal sign-in.
  heroes_shared_env = {
    NODE_ENV             = "production"
    PORTAL_BASE_URL      = var.portal_base_url
    PORTAL_ORIGIN        = var.coms_origin
    PORTAL_APP_SLUG      = "heroes"
    PUBLIC_PORTAL_ORIGIN = var.coms_origin
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
  labels   = local.heroes_labels_api

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
      # exactly what portal mints as 'aud' — and portal mints
      # `new URL(endpoint.url).origin` (see apps/portal-api/src/services/
      # webhook-dispatcher.ts:251). For heroes' single-origin endpoint URL
      # `https://aha-coms.web.app/heroes/api/webhooks/portal`, the origin is
      # `https://aha-coms.web.app` — the bare Firebase Hosting host, NOT the
      # `coms-heroes-api-*.run.app` Cloud Run URL the legacy registration once
      # used. Using the Cloud Run URL here breaks the audience match the
      # moment heroes' `app_webhook_endpoints.status` flips back to `active`
      # (it stayed `disabled` since 2026-05-12's Cloud Tasks retry failure,
      # which masked this crack until fast tripped the same shape on
      # 2026-05-14 and FU-24 was filed). Realigned to `var.heroes_public_origin`
      # alongside fast's CP18 closure so heroes' eventual re-enable does not
      # repeat the 401 dance.
      env {
        name  = "PORTAL_SERVICE_ACCOUNT_EMAIL"
        value = var.portal_service_account_email
      }

      env {
        name  = "SELF_PUBLIC_URL"
        value = var.heroes_public_origin
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

      # Sheet IDs are set unconditionally. Values come from terraform.tfvars
      # (committed; not secret per ops decision 2026-05-13). SHEET_TAB_* env
      # vars are intentionally not set here — the app's buildConfigFromEnv()
      # falls back to the canonical tab names, keeping a single source of
      # truth in apps/heroes-api/src/services/sheet-sync-scheduler.ts.
      #
      # FU-9 lesson (recorded in tasks/todo.md): the prior `dynamic "env"`
      # gating on `var.sheet_id_points != ""` collapsed silently when the
      # tfvars file didn't exist, dropping the env vars on every apply since
      # the variables landed. Gating IaC on the presence of a variable is a
      # silent-failure shape; prefer required values + tfvars.
      env {
        name  = "GOOGLE_SHEET_ID_POINTS"
        value = var.sheet_id_points
      }

      env {
        name  = "GOOGLE_SHEET_ID_EMPLOYEES"
        value = var.sheet_id_employees
      }

      startup_probe {
        http_get {
          path = "/heroes/api/healthz"
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 12
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/heroes/api/healthz"
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
  labels   = local.heroes_labels_web

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
