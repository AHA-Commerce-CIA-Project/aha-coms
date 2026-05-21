resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "coms-heroes-repo"
  format        = "DOCKER"
  description   = "Docker images for coms-heroes-{api,web}"
  labels        = var.labels

  # Note: google_artifact_registry_repository takes its contents with it on
  # destroy — GCP deletes the repo and all images in one operation, no
  # force flag needed (unlike GCS). The repo rename from coms-aha-heroes-repo
  # to coms-heroes-repo therefore destroys + recreates cleanly.

  # Dry-run false: policies are actively enforced
  cleanup_policy_dry_run = false

  # KEEP: the 3 most recently pushed image versions
  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  # DELETE: every other version. tag_state = "ANY" matches all versions;
  # the KEEP rule above takes precedence and protects the latest 3.
  # (older_than = "0s" looks equivalent but GCP drops it on read-back, causing
  # perpetual drift — use tag_state instead.)
  cleanup_policies {
    id     = "delete-everything-else"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }
}
