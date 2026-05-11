# ── Workload Identity Federation for GitHub Actions ───────────────────────────
# Allows GitHub Actions to authenticate to GCP without long-lived keys.
# The deployer SA is separate from the Cloud Run runtime SA (least privilege).

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "coms-aha-heroes-wif-pool"
  display_name              = "GitHub Actions"
  description               = "OIDC identity pool for GitHub Actions CI/CD"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Only allow tokens from this specific repository
  attribute_condition = "assertion.repository == '${var.github_org}/${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── Deployer Service Account ──────────────────────────────────────────────────

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "coms-aha-heroes-deployer-sa"
  display_name = "CI/CD Deployer SA — coms-aha-heroes"
}

# Allow GitHub Actions (via WIF pool) to impersonate the deployer SA
resource "google_service_account_iam_member" "wif_deployer_binding" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# ── Deployer IAM Grants ──────────────────────────────────────────────────────

# Deploy Cloud Run services
resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Push Docker images to Artifact Registry
resource "google_project_iam_member" "deployer_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Connect to Cloud SQL via Auth Proxy for migrations
resource "google_project_iam_member" "deployer_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Read secrets during deploy (DB credentials for migrations)
resource "google_project_iam_member" "deployer_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Impersonate the Cloud Run runtime SA when deploying (--service-account flag)
resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.cloud_run_service_account_email}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# Mint OIDC ID tokens on behalf of the runtime SA. Used by the
# register-manifest CD step (Rev 4 Spec 02 §HB) — google-github-actions/auth
# impersonates the runtime SA via this binding so the OIDC token's `email`
# claim matches the serviceAccountEmail the portal has registered for
# slug='heroes'. Without this, `bun x coms-portal-cli register-manifest`
# exits 1 with an auth failure before the request leaves the runner.
resource "google_service_account_iam_member" "deployer_mint_token_as_runtime" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.cloud_run_service_account_email}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# ── CI Drift Guard read scopes (Rev 4 Spec 02 §F13) ──────────────────────────
# `tofu plan` in ci.yml's infra-plan job needs to refresh every managed
# resource — IAM policies, monitoring, Cloud Run, Secret Manager, etc. —
# which the deployer SA's mutate-scoped roles above don't cover read-side
# (run.admin lets you UpdateService but not ReadIamPolicy on unrelated
# bindings, etc.). roles/viewer is the standard project-wide read role.
# It expands the SA's blast radius from "deploy Cloud Run + impersonate
# runtime SA" to "read everything in the project"; deemed acceptable
# given the SA already holds run.admin + secretmanager.secretAccessor +
# cloudsql.client. Narrow to per-product viewer roles if that ever shifts.
resource "google_project_iam_member" "deployer_viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Read state from the GCS-backed OpenTofu backend. The bucket is the literal
# from `infra/backend.tf` — the backend block doesn't accept variables
# (OpenTofu/Terraform limitation: backend config must be static), so the
# name lives in two places by necessity. objectViewer is sufficient because
# the infra-plan job uses `tofu plan -lock=false`; no lock-file write means
# no objectAdmin needed.
resource "google_storage_bucket_iam_member" "deployer_tfstate_reader" {
  bucket = "coms-aha-heroes-tfstate"
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.deployer.email}"
}
