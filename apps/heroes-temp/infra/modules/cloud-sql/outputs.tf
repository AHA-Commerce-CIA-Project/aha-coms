output "connection_name" {
  description = "Cloud SQL instance connection name (PROJECT:REGION:INSTANCE)"
  value       = google_sql_database_instance.main.connection_name
}

output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "db_url_production_secret_id" {
  description = "Secret Manager secret ID for the production DATABASE_URL"
  value       = google_secret_manager_secret.db_url_production.secret_id
}

output "db_url_staging_secret_id" {
  description = "Secret Manager secret ID for the staging DATABASE_URL"
  value       = google_secret_manager_secret.db_url_staging.secret_id
}

output "db_user_secret_id" {
  description = "Secret Manager secret ID for DB username"
  value       = google_secret_manager_secret.db_user.secret_id
}

output "db_password_secret_id" {
  description = "Secret Manager secret ID for DB password"
  value       = google_secret_manager_secret.db_password.secret_id
}
