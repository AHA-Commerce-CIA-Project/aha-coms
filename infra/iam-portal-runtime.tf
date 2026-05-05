############################################################
# Dedicated runtime identity for the COMS Portal Cloud Run
# service. Outbound webhooks to consumer apps (heroes, future)
# are signed with OIDC ID tokens minted from this SA's identity,
# so consumers can verify the `email` claim against a stable,
# portal-specific value rather than the project default compute
# SA. Reused by every future consumer app's verification config.
############################################################

resource "google_service_account" "portal_runtime" {
  account_id   = "coms-portal-run-sa"
  display_name = "COMS Portal Run SA"
  description  = "Runtime identity for the COMS Portal Cloud Run service. Signs OIDC ID tokens for outbound webhooks to consumer apps."
}

# ── Secret access (replaces compute SA bindings) ─────────────
resource "google_secret_manager_secret_iam_member" "portal_runtime_database_url" {
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.portal_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "portal_runtime_gip_api_key" {
  secret_id = google_secret_manager_secret.gip_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.portal_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "portal_runtime_broker_signing_secret" {
  secret_id = google_secret_manager_secret.portal_broker_signing_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.portal_runtime.email}"
}

# BREVO_API_KEY follows mail_transport — same conditional shape as cloud-run.tf.
resource "google_secret_manager_secret_iam_member" "portal_runtime_brevo_api_key" {
  count     = var.mail_transport == "brevo" ? 1 : 0
  secret_id = google_secret_manager_secret.brevo_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.portal_runtime.email}"
}

# ── Cloud Tasks (enqueue webhook deliveries + dispatch on behalf of invoker SA)
resource "google_cloud_tasks_queue_iam_member" "portal_runtime_enqueuer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.webhook_delivery.location
  name     = google_cloud_tasks_queue.webhook_delivery.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.portal_runtime.email}"
}

# Cloud Tasks needs to mint OIDC tokens for the invoker SA when dispatching.
# The runtime SA must hold serviceAccountUser on the invoker SA to specify it
# in the task's oidcToken.
resource "google_service_account_iam_member" "portal_runtime_can_use_invoker_sa" {
  service_account_id = google_service_account.cloud_tasks_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.portal_runtime.email}"
}

# ── Cloud SQL ────────────────────────────────────────────────
# The cloudsql sidecar (mounted via volumes in cloud-run.tf) needs to
# authenticate to Cloud SQL on behalf of the runtime SA. Without
# cloudsql.client every DB query fails with cloudsql.instances.get 403.
# The default compute SA carried this via project Editor; the dedicated
# SA needs it explicitly.
resource "google_project_iam_member" "portal_runtime_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.portal_runtime.email}"
}

# ── Cloud Tasks viewer ───────────────────────────────────────
# /api/health probes call cloudtasks.queues.get, which is in roles/cloudtasks.viewer
# but NOT in roles/cloudtasks.enqueuer. Without it the readiness probe stays
# 'failed' for the cloudTasks check forever.
resource "google_cloud_tasks_queue_iam_member" "portal_runtime_queue_viewer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.webhook_delivery.location
  name     = google_cloud_tasks_queue.webhook_delivery.name
  role     = "roles/cloudtasks.viewer"
  member   = "serviceAccount:${google_service_account.portal_runtime.email}"
}
