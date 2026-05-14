output "cloud_run_url" {
  description = "Public URL of the coms-fast-web Cloud Run service"
  value       = google_cloud_run_v2_service.coms_fast_web.uri
}

output "artifact_registry_hostname" {
  description = "Docker push hostname for Artifact Registry"
  value       = "${var.region}-docker.pkg.dev"
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name (aha-fast-db-instance-*) for Auth Proxy + Cloud Run socket mount"
  value       = data.google_sql_database_instance.fast.connection_name
}

output "cloud_run_service_account" {
  description = "Service account email used by coms-fast-web"
  value       = google_service_account.fast_web_runtime.email
}

output "wif_provider" {
  description = "WIF provider resource name — set as WIF_PROVIDER_FAST GitHub repo variable"
  value       = module.github_wif.provider_name
}

output "wif_service_account" {
  description = "Deployer SA email — set as WIF_SA_FAST GitHub repo variable"
  value       = module.github_wif.deployer_service_account_email
}
