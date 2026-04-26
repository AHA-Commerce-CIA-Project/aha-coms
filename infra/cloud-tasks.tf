############################################################
# Cloud Tasks queue + dead-letter Pub/Sub topic for webhook
# delivery. Cloud Tasks owns the retry schedule; the DLQ
# subscription pushes to /api/internal/webhook-dlq when a
# task exhausts max_attempts.
############################################################

# ── Service account that Cloud Tasks (and Pub/Sub push) use to call the
#    service. This SA is the OIDC `email` claim seen by the internal routes.
#    The Cloud Run runtime SA (default compute) is what enqueues tasks.
resource "google_service_account" "cloud_tasks_invoker" {
  account_id   = "coms-portal-tasks-invoker"
  display_name = "COMS Portal Cloud Tasks Invoker"
  description  = "OIDC subject for Cloud Tasks → service and DLQ → service callbacks"
}

# Allow the invoker SA to call the Cloud Run service.
resource "google_cloud_run_v2_service_iam_member" "tasks_invoker_run" {
  name     = google_cloud_run_v2_service.coms_portal.name
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

# Cloud Run runtime SA (default compute SA) needs to enqueue tasks on this
# queue. data.google_project.current is already declared in cloud-run.tf.
locals {
  cloud_run_runtime_sa = "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_cloud_tasks_queue_iam_member" "runtime_enqueuer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.webhook_delivery.location
  name     = google_cloud_tasks_queue.webhook_delivery.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${local.cloud_run_runtime_sa}"
}

# Cloud Tasks needs to be able to mint OIDC tokens for the invoker SA when it
# dispatches a task. The runtime SA must have iam.serviceAccountUser on the
# invoker SA so it can specify it in the task's oidcToken.
resource "google_service_account_iam_member" "runtime_can_use_invoker_sa" {
  service_account_id = google_service_account.cloud_tasks_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${local.cloud_run_runtime_sa}"
}

# Also grant the invoker SA the cloudtasks.enqueuer role on the queue, so the
# same SA can be used end-to-end if/when we move enqueueing onto it.
resource "google_cloud_tasks_queue_iam_member" "invoker_enqueuer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.webhook_delivery.location
  name     = google_cloud_tasks_queue.webhook_delivery.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.cloud_tasks_invoker.email}"
}

# ── Dead-letter Pub/Sub topic ─────────────────────────────────────────
resource "google_pubsub_topic" "webhook_dlq" {
  name = "coms-portal-webhook-dlq"
}

# Cloud Run runtime SA publishes to the DLQ topic. The webhook-delivery
# handler calls Pub/Sub directly on the final retry (Cloud Tasks does not have
# a native dead-letter forwarder), so the SA running the container is the one
# that needs `roles/pubsub.publisher`. The previous binding to the *invoker*
# SA was wrong: that SA's role is to authenticate inbound calls FROM Pub/Sub
# back into our service, not outbound publishes.
resource "google_pubsub_topic_iam_member" "runtime_publisher" {
  topic  = google_pubsub_topic.webhook_dlq.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${local.cloud_run_runtime_sa}"
}

# Push subscription that delivers DLQ messages to the service's internal
# endpoint. Pub/Sub attaches the OIDC token from `oidc_token`; the route
# verifies the audience matches SERVICE_URL and the email matches the invoker SA.
resource "google_pubsub_subscription" "webhook_dlq_push" {
  name  = "coms-portal-webhook-dlq-push"
  topic = google_pubsub_topic.webhook_dlq.name

  ack_deadline_seconds       = 30
  message_retention_duration = "604800s" # 7 days

  retry_policy {
    minimum_backoff = "30s"
    maximum_backoff = "600s"
  }

  push_config {
    push_endpoint = "${var.service_url}/api/internal/webhook-dlq"

    oidc_token {
      service_account_email = google_service_account.cloud_tasks_invoker.email
      audience              = var.service_url
    }
  }

  depends_on = [
    google_cloud_run_v2_service.coms_portal,
  ]
}

# Pub/Sub itself needs roles/iam.serviceAccountTokenCreator on the invoker SA
# in order to mint OIDC tokens. The service agent for Pub/Sub is granted this
# automatically by Google when you configure oidc_token, but we make it
# explicit so the binding survives a project recreation.
data "google_project" "pubsub" {
  project_id = var.project_id
}

resource "google_service_account_iam_member" "pubsub_token_creator" {
  service_account_id = google_service_account.cloud_tasks_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.pubsub.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}
