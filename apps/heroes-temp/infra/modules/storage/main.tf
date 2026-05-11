# Exports bucket — auto-delete files after 90 days to control storage costs
resource "google_storage_bucket" "exports" {
  project                     = var.project_id
  name                        = "coms-aha-heroes-exports"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90 # days
    }
  }
}

# Uploads bucket — permanent storage, no lifecycle rule
resource "google_storage_bucket" "uploads" {
  project                     = var.project_id
  name                        = "coms-aha-heroes-uploads"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true

  cors {
    origin          = ["https://*.run.app"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}
