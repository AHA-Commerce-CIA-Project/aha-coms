resource "google_artifact_registry_repository" "coms_portal" {
  location      = var.region
  repository_id = "coms-portal-registry"
  format        = "DOCKER"
  description   = "Docker images for COMS Portal"
  labels        = local.portal_labels

  cleanup_policies {
    id     = "keep-last-3"
    action = "KEEP"

    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"

    # GCP normalizes `older_than = "0s"` away (it's a no-op time condition);
    # declaring tag_state = "ANY" keeps config aligned with API response.
    condition {
      tag_state = "ANY"
    }
  }

  cleanup_policy_dry_run = false
}
