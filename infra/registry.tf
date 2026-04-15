resource "google_artifact_registry_repository" "coms_portal" {
  location      = var.region
  repository_id = "coms-portal-registry"
  format        = "DOCKER"
  description   = "Docker images for COMS Portal"

  cleanup_policies {
    id     = "keep-last-5"
    action = "KEEP"

    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"

    condition {
      older_than = "0s"
    }
  }

  cleanup_policy_dry_run = false
}
