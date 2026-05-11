output "service_url" {
  description = "Public HTTPS URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "service_account_email" {
  description = "Service account attached to the Cloud Run service"
  value       = google_service_account.cloud_run.email
}
