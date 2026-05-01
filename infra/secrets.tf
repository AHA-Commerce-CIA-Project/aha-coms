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

# ── BREVO_API_KEY (manually populated; spec-06 PR B2) ────────────
resource "google_secret_manager_secret" "brevo_api_key" {
  secret_id = "coms-portal-brevo-api-key"

  replication {
    auto {}
  }
}

# No secret_version for brevo_api_key — populate manually:
#   echo -n "YOUR_BREVO_API_KEY" | gcloud secrets versions add coms-portal-brevo-api-key --data-file=-

# ── PORTAL_BROKER_SIGNING_SECRET (HS256 shared with relying-party apps) ──
resource "random_password" "portal_broker_signing_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "portal_broker_signing_secret" {
  secret_id = "portal-broker-signing-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "portal_broker_signing_secret" {
  secret      = google_secret_manager_secret.portal_broker_signing_secret.id
  secret_data = random_password.portal_broker_signing_secret.result
}
