output "cloud_run_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.coms_portal.uri
}

output "lb_ip" {
  description = "Load balancer IP — point DNS here"
  value       = google_compute_global_address.coms_portal.address
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
