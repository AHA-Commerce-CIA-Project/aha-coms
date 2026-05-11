output "uploads_bucket_name" {
  description = "Name of the uploads GCS bucket"
  value       = google_storage_bucket.uploads.name
}

output "exports_bucket_name" {
  description = "Name of the exports GCS bucket"
  value       = google_storage_bucket.exports.name
}
