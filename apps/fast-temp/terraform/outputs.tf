output "database_connection_url" {
  description = "The Prisma connection string for your database"
  value       = "postgresql://${google_sql_user.db_user.name}:${random_password.db_password.result}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}?schema=public"
  sensitive   = true
}

output "database_password" {
  description = "The generated database password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "better_auth_secret" {
  description = "The generated secret for Better Auth"
  value       = random_password.auth_secret.result
  sensitive   = true
}

output "cloud_run_url" {
  description = "The URL of the deployed Cloud Run application"
  value       = google_cloud_run_v2_service.app.uri
}

output "storage_bucket_name" {
  description = "The name of the GCS bucket for uploads"
  value       = google_storage_bucket.uploads.name
}

output "artifact_registry_repo_name" {
  description = "The name of the Artifact Registry repository"
  value       = google_artifact_registry_repository.repo.name
}
