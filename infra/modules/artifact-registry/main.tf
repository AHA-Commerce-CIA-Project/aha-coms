resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "coms-aha-heroes-repo"
  format        = "DOCKER"
  description   = "Docker images for coms-aha-heroes"

  # Dry-run false: policies are actively enforced
  cleanup_policy_dry_run = false

  # KEEP: the 5 most recently pushed image versions
  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  # DELETE: every other version. older_than = "0s" matches all versions;
  # the KEEP rule above takes precedence and protects the latest 5.
  cleanup_policies {
    id     = "delete-everything-else"
    action = "DELETE"
    condition {
      older_than = "0s"
    }
  }
}
