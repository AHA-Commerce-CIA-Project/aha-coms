# Service account with read-only access to Google Sheets (shared explicitly per sheet)
resource "google_service_account" "sheet_sync" {
  project      = var.project_id
  account_id   = "coms-aha-heroes-sheet-reader"
  display_name = "Sheet Sync Reader (read-only access to Google Sheets)"
}

# Long-lived SA key — stored in Secret Manager, never exposed as a file
resource "google_service_account_key" "sheet_sync_key" {
  service_account_id = google_service_account.sheet_sync.name
}

# Secret to hold the SA key JSON
resource "google_secret_manager_secret" "sheet_sync_sa_key" {
  project   = var.project_id
  secret_id = "coms-aha-heroes-sheet-sync-sa-key"
  replication {
    auto {}
  }
}

# Store the decoded SA key JSON as the latest secret version
resource "google_secret_manager_secret_version" "sheet_sync_sa_key_latest" {
  secret      = google_secret_manager_secret.sheet_sync_sa_key.id
  secret_data = base64decode(google_service_account_key.sheet_sync_key.private_key)
}

# Grant Cloud Run SA permission to read the sheet-sync key secret at runtime
resource "google_secret_manager_secret_iam_member" "sheet_sync_secret_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.sheet_sync_sa_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_sa_email}"
}

