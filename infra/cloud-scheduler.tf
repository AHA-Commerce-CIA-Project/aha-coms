############################################################
# Cloud Scheduler + OTP cleanup
#
# Daily scheduler that invokes /api/internal/cleanup/otp to prune
# expired OTP codes (>7 days) and request-log rows (>24 hours).
# Uses a dedicated service account authenticated via OIDC.
############################################################

# ── Service account that Cloud Scheduler uses to call the service. This SA is the
#    OIDC `email` claim seen by the internal route.
resource "google_service_account" "otp_cleanup_scheduler" {
  account_id   = "coms-portal-otp-cleanup"
  display_name = "COMS Portal — OTP cleanup scheduler"
  description  = "OIDC subject for Cloud Scheduler → OTP cleanup endpoint"
  project      = var.project_id
}

# ── OTP cleanup scheduler ────────────────────────────────────────────
# Fires daily at 3:17 AM UTC (off-:00 to spread fleet load).
resource "google_cloud_scheduler_job" "otp_cleanup" {
  name             = "coms-portal-otp-cleanup"
  region           = var.region
  description      = "Daily OTP cleanup — prunes expired otp_codes and otp_request_log rows"
  schedule         = "17 3 * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "180s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.coms_portal.uri}/api/internal/cleanup/otp"

    oidc_token {
      service_account_email = google_service_account.otp_cleanup_scheduler.email
      audience              = google_cloud_run_v2_service.coms_portal.uri
    }
  }
}

# The OTP cleanup SA needs invoker permission on Cloud Run.
resource "google_cloud_run_v2_service_iam_member" "otp_cleanup_invoker" {
  project  = google_cloud_run_v2_service.coms_portal.project
  location = google_cloud_run_v2_service.coms_portal.location
  name     = google_cloud_run_v2_service.coms_portal.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.otp_cleanup_scheduler.email}"
}
