terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable necessary APIs
resource "google_project_service" "services" {
  for_each = toset([
    "sqladmin.googleapis.com",      # For Cloud SQL
    "run.googleapis.com",           # For Cloud Run
    "artifactregistry.googleapis.com",# For Docker Images
    "storage-component.googleapis.com",# For GCS
    "secretmanager.googleapis.com", # For Secrets
    "cloudbuild.googleapis.com"     # For building images
  ])
  service            = each.key
  project            = var.project_id
  disable_on_destroy = false
}

# 1. Cloud SQL Micro Instance
resource "random_id" "db_name_suffix" {
  byte_length = 4
}

resource "google_sql_database_instance" "postgres" {
  name             = "${var.prefix}db-instance-${random_id.db_name_suffix.hex}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro" # As requested by user
    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0"
      }
    }
  }
  
  deletion_protection = false # Set to true for production

  depends_on = [google_project_service.services["sqladmin.googleapis.com"]]
}

resource "google_sql_database" "database" {
  name     = "${var.prefix}db"
  instance = google_sql_database_instance.postgres.name
}

resource "random_password" "db_password" {
  length  = 16
  special = true
}

resource "google_sql_user" "db_user" {
  name     = "${var.prefix}admin"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

# 2. Google Cloud Storage (GCS) for Uploads
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "uploads" {
  name          = "${var.prefix}uploads-${random_id.bucket_suffix.hex}"
  location      = var.region
  force_destroy = true
  
  uniform_bucket_level_access = true

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.services["storage-component.googleapis.com"]]
}

# Make bucket public so users can view images
resource "google_storage_bucket_iam_binding" "public_read" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectViewer"
  members = [
    "allUsers",
  ]
}

# 3. Artifact Registry for Docker Images
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "${var.prefix}repo"
  description   = "Docker repository for AHA Smart Tracker"
  format        = "DOCKER"

  depends_on = [google_project_service.services["artifactregistry.googleapis.com"]]
}

# 4. Secret Manager for Database URL and Auth Secret
resource "google_secret_manager_secret" "db_url" {
  secret_id = "${var.prefix}db-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "db_url_version" {
  secret      = google_secret_manager_secret.db_url.id
  secret_data = "postgresql://${google_sql_user.db_user.name}:${random_password.db_password.result}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}?schema=public"
}

resource "random_password" "auth_secret" {
  length  = 32
  special = true
}

resource "google_secret_manager_secret" "better_auth_secret" {
  secret_id = "${var.prefix}auth-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "better_auth_secret_version" {
  secret      = google_secret_manager_secret.better_auth_secret.id
  secret_data = random_password.auth_secret.result
}

# 5. Cloud Run Service (Initial Placeholder deployment)
# Note: Initial deploy uses a sample image. Real deployment will happen after we build the Next.js app.
resource "google_cloud_run_v2_service" "app" {
  name     = "${var.prefix}app"
  location = var.region

  template {
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello:latest"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://${google_sql_user.db_user.name}:${random_password.db_password.result}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}?schema=public"
      }
      env {
        name  = "BETTER_AUTH_SECRET"
        value = random_password.auth_secret.result
      }
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = "https://${var.prefix}app-${var.region}.a.run.app" # To be updated
      }
    }
  }

  depends_on = [google_project_service.services["run.googleapis.com"]]
}

# Allow unauthenticated access to Cloud Run
resource "google_cloud_run_service_iam_binding" "unauthenticated" {
  location = google_cloud_run_v2_service.app.location
  service  = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  members = [
    "allUsers"
  ]
}
