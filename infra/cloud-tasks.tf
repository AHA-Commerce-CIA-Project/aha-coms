############################################################
# Cloud Tasks queue for webhook delivery. Cloud Tasks owns the
# retry schedule. On the final retry the delivery handler at
# /api/internal/webhook-delivery disables the endpoint inline
# before returning 502. See docs/architecture/rev1/spec-05.
############################################################

# ── Service account that Cloud Tasks uses to call the service. This SA is the
#    OIDC `email` claim seen by the internal route. The Cloud Run runtime SA
#    (default compute) is what enqueues tasks.
resource "google_service_account" "cloud_tasks_invoker" {
  account_id   = "coms-portal-tasks-invoker"
  display_name = "COMS Portal Cloud Tasks Invoker"
  description  = "OIDC subject for Cloud Tasks → service callbacks"
}

# Allow the invoker SA to call the Cloud Run service.
resource "google_cloud_run_v2_service_iam_member" "tasks_invoker_run" {
  name     = google_cloud_run_v2_service.coms_portal_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_tasks_invoker.email}"
}

# ── Webhook delivery queue ────────────────────────────────────────────
resource "google_cloud_tasks_queue" "webhook_delivery" {
  name     = "coms-portal-webhook-delivery"
  location = var.region

  retry_config {
    max_attempts  = 3
    min_backoff   = "30s"
    max_backoff   = "300s"
    max_doublings = 2
  }

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 5
  }
}

# Cloud Run runtime enqueuer + invoker-SA serviceAccountUser bindings live in
# infra/iam-portal-runtime.tf, scoped to the dedicated portal_runtime SA.

# Also grant the invoker SA the cloudtasks.enqueuer role on the queue, so the
# same SA can be used end-to-end if/when we move enqueueing onto it.
resource "google_cloud_tasks_queue_iam_member" "invoker_enqueuer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.webhook_delivery.location
  name     = google_cloud_tasks_queue.webhook_delivery.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.cloud_tasks_invoker.email}"
}
