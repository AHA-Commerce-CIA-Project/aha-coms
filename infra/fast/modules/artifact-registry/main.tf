resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "coms-fast-registry"
  format        = "DOCKER"
  description   = "Docker images for coms-fast-web"
  labels        = var.labels

  # Mirrors infra/heroes/modules/artifact-registry — cleanup policy keeps the
  # 5 most recent image versions and deletes everything else, so the registry
  # doesn't accumulate old SHAs indefinitely.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-everything-else"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }
}
