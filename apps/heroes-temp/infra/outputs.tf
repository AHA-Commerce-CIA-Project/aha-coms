output "cloud_run_url" {
  description = "Public URL of the Cloud Run service"
  value       = module.cloud_run.service_url
}

output "artifact_registry_hostname" {
  description = "Docker push hostname for Artifact Registry"
  value       = "${var.region}-docker.pkg.dev"
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name for Auth Proxy"
  value       = module.cloud_sql.connection_name
}

output "cloud_run_service_account" {
  description = "Service account email used by Cloud Run"
  value       = module.cloud_run.service_account_email
}

output "wif_provider" {
  description = "WIF provider resource name — set as WIF_PROVIDER GitHub secret"
  value       = module.github_wif.provider_name
}

output "wif_service_account" {
  description = "Deployer SA email — set as WIF_SERVICE_ACCOUNT GitHub secret"
  value       = module.github_wif.deployer_service_account_email
}

output "sheet_sync_service_account_email" {
  description = "Share your Google Sheet with this email to enable sync"
  value       = module.sheet_sync.service_account_email
}
