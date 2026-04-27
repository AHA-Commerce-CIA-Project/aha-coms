# ── Service account for GitHub Actions ────────────────────────────
resource "google_service_account" "github_actions" {
  account_id   = "coms-portal-github-actions"
  display_name = "COMS Portal GitHub Actions"
}

# ── WIF pool ──────────────────────────────────────────────────────
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "coms-portal-wif-pool"
  display_name              = "COMS Portal GitHub Pool"
}

# ── WIF provider (GitHub OIDC) ────────────────────────────────────
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "coms-portal-wif-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── Allow GitHub Actions to impersonate the SA ────────────────────
resource "google_service_account_iam_member" "wif_binding" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# ── IAM roles for the SA ─────────────────────────────────────────
# This SA is used for both image deploys (deploy.yml) and infra apply
# (infra.yml). The roles below are scoped wide enough for `tofu apply` to
# manage every resource declared in this module — see the project IAM
# resources at the end of this file. For a multi-operator environment,
# split this into a deploy-only SA and a tofu-only SA.

resource "google_project_iam_member" "artifact_registry_admin" {
  project = var.project_id
  role    = "roles/artifactregistry.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "secret_manager_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "cloudsql_admin" {
  project = var.project_id
  role    = "roles/cloudsql.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "cloud_tasks_admin" {
  project = var.project_id
  role    = "roles/cloudtasks.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Required for tofu to create / modify the cloud_tasks_invoker SA and to
# attach IAM bindings to it.
resource "google_project_iam_member" "service_account_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountAdmin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Required for tofu to manage the project-level IAM bindings declared in
# this file (the same kind of resource managing itself).
resource "google_project_iam_member" "project_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Required for tofu to manage the WIF pool / provider declared above.
resource "google_project_iam_member" "wif_pool_admin" {
  project = var.project_id
  role    = "roles/iam.workloadIdentityPoolAdmin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Cloud Run service deploys need permission to act as the runtime SA, and the
# task-enqueue path needs to act as the cloud_tasks_invoker SA for OIDC token
# minting. Both consume iam.serviceAccountUser.
resource "google_project_iam_member" "sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# ── Tofu state bucket access ──────────────────────────────────────
# The GCS backend reads/writes the state object and uses GCS atomic write
# semantics for the lock. objectAdmin on the bucket covers all of that
# without granting bucket-level config permissions.
resource "google_storage_bucket_iam_member" "tofu_state" {
  bucket = "coms-portal-tofu-state"
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.github_actions.email}"
}
