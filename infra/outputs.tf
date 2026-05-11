output "cloud_run_url_portal_api" {
  description = "Cloud Run service URL — portal-api"
  value       = google_cloud_run_v2_service.coms_portal_api.uri
}

output "cloud_run_url_portal_web" {
  description = "Cloud Run service URL — portal-web"
  value       = google_cloud_run_v2_service.coms_portal_web.uri
}

output "wif_provider" {
  description = "WIF provider resource name — set as GitHub repo secret WIF_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "wif_service_account" {
  description = "WIF service account email — set as GitHub repo secret WIF_SERVICE_ACCOUNT"
  value       = google_service_account.github_actions.email
}

output "artifact_registry" {
  description = "Docker image registry path"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.coms_portal.repository_id}"
}

output "db_password" {
  description = "Database password for CI migration — set as GitHub secret DB_PASSWORD"
  value       = random_password.db_password.result
  sensitive   = true
}

output "portal_broker_signing_secret" {
  description = "HS256 shared secret for broker token_exchange JWS verification"
  value       = random_password.portal_broker_signing_secret.result
  sensitive   = true
}
