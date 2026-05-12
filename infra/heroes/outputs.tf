output "cloud_run_url_api" {
  description = "Public URL of the coms-heroes-api Cloud Run service"
  value       = google_cloud_run_v2_service.coms_heroes_api.uri
}

output "cloud_run_url_web" {
  description = "Public URL of the coms-heroes-web Cloud Run service"
  value       = google_cloud_run_v2_service.coms_heroes_web.uri
}

output "artifact_registry_hostname" {
  description = "Docker push hostname for Artifact Registry"
  value       = "${var.region}-docker.pkg.dev"
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name for Auth Proxy"
  value       = module.cloud_sql.connection_name
}

output "cloud_run_service_account_api" {
  description = "Service account email used by coms-heroes-api"
  value       = google_service_account.heroes_api_runtime.email
}

output "cloud_run_service_account_web" {
  description = "Service account email used by coms-heroes-web"
  value       = google_service_account.heroes_web_runtime.email
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
