output "service_account_email" {
  description = "Sheet Sync SA email — share target Google Sheets with this address"
  value       = google_service_account.sheet_sync.email
}

output "sa_key_secret_id" {
  description = "Secret Manager secret ID holding the Sheet Sync SA key JSON"
  value       = google_secret_manager_secret.sheet_sync_sa_key.secret_id
}
