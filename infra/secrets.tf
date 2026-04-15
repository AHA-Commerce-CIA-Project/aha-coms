# ── DATABASE_URL (auto-wired) ─────────────────────────────────────
resource "google_secret_manager_secret" "database_url" {
  secret_id = "coms-portal-database-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${google_sql_user.coms_portal.name}:${random_password.db_password.result}@/coms_portal?host=/cloudsql/${data.google_sql_database_instance.existing.connection_name}"
}

# ── GIP_API_KEY (manually populated) ──────────────────────────────
resource "google_secret_manager_secret" "gip_api_key" {
  secret_id = "coms-portal-gip-api-key"

  replication {
    auto {}
  }
}

# No secret_version for gip_api_key — populate manually:
#   echo -n "YOUR_API_KEY" | gcloud secrets versions add coms-portal-gip-api-key --data-file=-
