module "artifact_registry" {
  source     = "./modules/artifact-registry"
  project_id = var.project_id
  region     = var.region
}

module "storage" {
  source     = "./modules/storage"
  project_id = var.project_id
}

module "cloud_sql" {
  source     = "./modules/cloud-sql"
  project_id = var.project_id
  region     = var.region
  db_user    = var.db_user
  tier       = var.db_tier
}

# Cloud Run services live in cloud-run.tf — mirrors the portal pattern at
# infra/cloud-run.tf (two services declared inline, no module wrapper, so
# api vs web differences read top-to-bottom in one file).

module "monitoring" {
  source     = "./modules/monitoring"
  project_id = var.project_id
  cloud_run_service_names = [
    google_cloud_run_v2_service.coms_heroes_api.name,
    google_cloud_run_v2_service.coms_heroes_web.name,
  ]
  # Uptime check targets the api — heroes-web does not expose /api/health.
  cloud_run_url           = google_cloud_run_v2_service.coms_heroes_api.uri
  cloud_sql_instance_name = module.cloud_sql.instance_name
  alert_email             = var.alert_email
}

module "sheet_sync" {
  source     = "./modules/sheet-sync"
  project_id = var.project_id
  # Only heroes-api consumes the sheet-sync key — heroes-web never touches Sheets.
  cloud_run_sa_email = google_service_account.heroes_api_runtime.email
}

module "github_wif" {
  source      = "./modules/github-wif"
  project_id  = var.project_id
  github_org  = var.github_org
  github_repo = var.github_repo
  # The deployer SA needs to act-as the api SA when running migrations from CI.
  # T16 retired heroes' own GitHub Actions in favour of the monorepo's WIF
  # (infra/wif.tf in the portal state). This module's deployer SA is now an
  # orphan; cleanup deferred to a follow-up.
  cloud_run_service_account_email = google_service_account.heroes_api_runtime.email
}
