output "provider_name" {
  description = "Full resource name of the WIF provider — set as WIF_PROVIDER GitHub secret"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account_email" {
  description = "Deployer SA email — set as WIF_SERVICE_ACCOUNT GitHub secret"
  value       = google_service_account.deployer.email
}
