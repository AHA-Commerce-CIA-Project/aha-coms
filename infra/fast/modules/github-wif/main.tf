# ── Workload Identity Federation for GitHub Actions ───────────────────────────
# Allows GitHub Actions in `AHA-Commerce-CIA-Project/aha-coms` (the monorepo
# holding portal + heroes + fast) to authenticate to GCP without long-lived keys. Per the
# per-app principle, fast carries its own pool + deployer SA — separate
# from portal's `coms-portal-github-actions` + heroes' `coms-heroes-deployer-sa`.
# The deployer SA is separate from the Cloud Run runtime SA (least privilege).
# T81 ships `deploy-fast.yml` against this pool.

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "coms-fast-wif-pool"
  display_name              = "GitHub Actions"
  description               = "OIDC identity pool for GitHub Actions CI/CD against the fast corridor"
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

  attribute_condition = "assertion.repository == '${var.github_org}/${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── Deployer Service Account ──────────────────────────────────────────────────

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "coms-fast-deployer-sa"
  display_name = "CI/CD Deployer SA — coms-fast"
}

resource "google_service_account_iam_member" "wif_deployer_binding" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# ── Deployer IAM Grants ──────────────────────────────────────────────────────

resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Read secrets during deploy (DATABASE_URL for prisma db push over the proxy).
resource "google_project_iam_member" "deployer_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Impersonate the Cloud Run runtime SA on deploy (--service-account flag).
resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.cloud_run_service_account_email}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_mint_token_as_runtime" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.cloud_run_service_account_email}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
