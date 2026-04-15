# Reference existing Cloud SQL instance (not managed by OpenTofu)
data "google_sql_database_instance" "existing" {
  name    = var.cloud_sql_instance
  project = var.project_id
}

# New database on the existing instance
resource "google_sql_database" "coms_portal" {
  name     = "coms_portal"
  instance = data.google_sql_database_instance.existing.name
}

# Generate a random password for the dedicated user
resource "random_password" "db_password" {
  length  = 32
  special = false
}

# Dedicated Postgres user for COMS Portal
resource "google_sql_user" "coms_portal" {
  name     = "coms_portal_app"
  instance = data.google_sql_database_instance.existing.name
  password = random_password.db_password.result
}
