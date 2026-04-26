resource "google_cloud_run_v2_service" "coms_portal" {
  name     = "coms-portal-app"
  location = var.region

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    max_instance_request_concurrency = 80

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.coms_portal.repository_id}/coms-portal:latest"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # ── Plain env vars ──────────────────────────────────────────
      env {
        name  = "GIP_PROJECT_ID"
        value = var.gip_project_id
      }
      env {
        name  = "GIP_AUTH_DOMAIN"
        value = var.gip_auth_domain
      }
      env {
        name  = "COMS_DOMAIN"
        value = var.coms_domain
      }
      env {
        name  = "SESSION_COOKIE_MAX_AGE"
        value = var.session_cookie_max_age
      }
      env {
        name  = "SHEETS_PERSONAL_EMAIL_ID"
        value = var.sheets_personal_email_id
      }
      env {
        name  = "SHEETS_PERSONAL_EMAIL_TAB"
        value = var.sheets_personal_email_tab
      }

      # ── Cloud Tasks (webhook delivery) ──────────────────────────
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
        name  = "WEBHOOK_DLQ_TOPIC"
        value = google_pubsub_topic.webhook_dlq.name
      }
      env {
        name  = "SERVICE_URL"
        value = var.service_url
      }

      # ── Secrets ─────────────────────────────────────────────────
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
        name = "PORTAL_INTROSPECT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.portal_introspect_secret.secret_id
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

    # Cloud SQL Auth Proxy sidecar
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [data.google_sql_database_instance.existing.connection_name]
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.portal_introspect_secret,
    google_secret_manager_secret_version.portal_broker_signing_secret,
  ]
}

# Allow unauthenticated access (public portal, auth handled by app)
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.coms_portal.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Grant default compute SA access to secrets
data "google_project" "current" {}

resource "google_secret_manager_secret_iam_member" "compute_sa_database_url" {
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_secret_manager_secret_iam_member" "compute_sa_gip_api_key" {
  secret_id = google_secret_manager_secret.gip_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_secret_manager_secret_iam_member" "compute_sa_portal_introspect_secret" {
  secret_id = google_secret_manager_secret.portal_introspect_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_secret_manager_secret_iam_member" "compute_sa_portal_broker_signing_secret" {
  secret_id = google_secret_manager_secret.portal_broker_signing_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}
