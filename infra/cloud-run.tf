############################################################
# COMS Portal — two Cloud Run services
#
# Per integration contract §8 + ADR 0004 firebase.json, the portal is two
# services rather than one combined image:
#
#   coms-portal-api  — Elysia + Bun: identity, app catalog, webhooks
#   coms-portal-web  — SvelteKit SSR: the portal app shell
#
# Both share the runtime SA (coms-portal-run-sa) and the Cloud SQL proxy.
# portal-api owns Cloud Tasks dispatch, OTP cleanup, and the broker signing
# secret. portal-web carries the subset needed for SSR (GIP config,
# DATABASE_URL for in-process auth lookups, broker secret for cookie
# verification).
#
# Image tag is owned by Cloud Build (apps/portal-*/cloudbuild.yaml pushes
# :<git-sha>). Tofu pins :latest at create time and ignores subsequent
# image changes so it does not fight the deploy pipeline.
############################################################

locals {
  # Bootstrap placeholder image. Cloud Run validates the image exists at create
  # time, but on a fresh apply the registry holds nothing yet — so point at
  # GCP's public hello-world image. lifecycle.ignore_changes pins the image
  # field, so the GHA deploy workflows' first `gcloud run deploy --image=...`
  # overrides this with the real `coms-portal-{api,web}:<sha>` from
  # `coms-portal-registry` and Tofu does not fight it after.
  portal_image_bootstrap = "us-docker.pkg.dev/cloudrun/container/hello"
  portal_image_api       = local.portal_image_bootstrap
  portal_image_web       = local.portal_image_bootstrap

  # Shared plain env — same value, both services. portal-web's SSR needs
  # these because hooks.server.ts validates sessions in-process via
  # @coms-portal/portal-api/services/auth.
  portal_shared_env = {
    GIP_PROJECT_ID         = var.gip_project_id
    GIP_AUTH_DOMAIN        = var.gip_auth_domain
    COMS_DOMAIN            = var.coms_domain
    SESSION_COOKIE_MAX_AGE = var.session_cookie_max_age
  }
}

# ── portal-api ─────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "coms_portal_api" {
  name     = "coms-portal-api"
  location = var.region
  labels   = local.portal_labels_api

  # GHA workflows manage the live image; Tofu only bootstraps. deletion_protection=false
  # so a future destroy-then-create cycle (e.g. another rename or location change) doesn't
  # require manual gcloud intervention.
  deletion_protection = false

  template {
    service_account = google_service_account.portal_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    max_instance_request_concurrency = 80

    containers {
      image = local.portal_image_api

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = local.portal_shared_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "SHEETS_PERSONAL_EMAIL_ID"
        value = var.sheets_personal_email_id
      }
      env {
        name  = "SHEETS_PERSONAL_EMAIL_TAB"
        value = var.sheets_personal_email_tab
      }
      env {
        name  = "BOOTSTRAP_ADMIN_EMAIL"
        value = var.bootstrap_admin_email
      }
      env {
        name  = "BOOTSTRAP_ADMIN_NAME"
        value = var.bootstrap_admin_name
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "CLOUD_TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = google_cloud_tasks_queue.webhook_delivery.name
      }
      env {
        name  = "CLOUD_TASKS_SA_EMAIL"
        value = google_service_account.cloud_tasks_invoker.email
      }
      env {
        name  = "SERVICE_URL"
        value = var.service_url
      }
      env {
        name  = "PORTAL_PUBLIC_ORIGIN"
        value = var.service_url
      }

      env {
        name  = "OTP_CLEANUP_SCHEDULER_SA_EMAIL"
        value = google_service_account.otp_cleanup_scheduler.email
      }
      env {
        name  = "MAIL_TRANSPORT"
        value = var.mail_transport
      }
      env {
        name  = "BREVO_FROM"
        value = var.brevo_from
      }

      env {
        name  = "ENABLE_TAXONOMY_EVENTS"
        value = "true"
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "GIP_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gip_api_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "PORTAL_BROKER_SIGNING_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.portal_broker_signing_secret.secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = var.mail_transport == "brevo" ? [1] : []
        content {
          name = "BREVO_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.brevo_api_key.secret_id
              version = "latest"
            }
          }
        }
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [data.google_sql_database_instance.existing.connection_name]
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.portal_broker_signing_secret,
  ]

  lifecycle {
    ignore_changes = [
      scaling,
      template[0].containers[0].image,
    ]
  }
}

# ── portal-web ─────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "coms_portal_web" {
  name     = "coms-portal-web"
  location = var.region
  labels   = local.portal_labels_web

  deletion_protection = false

  template {
    service_account = google_service_account.portal_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    max_instance_request_concurrency = 80

    containers {
      image = local.portal_image_web

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # SvelteKit SSR's hooks.server.ts calls into portal-api's services/auth
      # in-process, which touches Cloud SQL. The /cloudsql socket and
      # DATABASE_URL mirror portal-api's wiring. Spec 02 Phase 2 (JWT
      # sessions) will narrow this once portal-web stops touching the DB.
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = local.portal_shared_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "GIP_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gip_api_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "PORTAL_BROKER_SIGNING_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.portal_broker_signing_secret.secret_id
            version = "latest"
          }
        }
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [data.google_sql_database_instance.existing.connection_name]
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.portal_broker_signing_secret,
  ]

  lifecycle {
    ignore_changes = [
      scaling,
      template[0].containers[0].image,
    ]
  }
}

# Public invoker — Firebase Hosting fronts both services (ADR 0004), so
# unauthenticated invoker access is the routing layer's responsibility.
resource "google_cloud_run_v2_service_iam_member" "public_api" {
  name     = google_cloud_run_v2_service.coms_portal_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "public_web" {
  name     = google_cloud_run_v2_service.coms_portal_web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# data.google_project.current is retained for any future cross-file consumer.
# Secret access lives on the dedicated portal_runtime SA — see
# infra/iam-portal-runtime.tf.
data "google_project" "current" {}
