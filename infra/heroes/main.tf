module "artifact_registry" {
  source     = "./modules/artifact-registry"
  project_id = var.project_id
  region     = var.region
  labels     = local.heroes_labels
}

module "storage" {
  source     = "./modules/storage"
  project_id = var.project_id
  labels     = local.heroes_labels
}

module "cloud_sql" {
  source     = "./modules/cloud-sql"
  project_id = var.project_id
  region     = var.region
  db_user    = var.db_user
  tier       = var.db_tier
  labels     = local.heroes_labels
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
  labels             = local.heroes_labels
}

module "github_wif" {
  source      = "./modules/github-wif"
  project_id  = var.project_id
  github_org  = var.github_org
  github_repo = var.github_repo
  # T17 returned heroes' deploys to GitHub Actions (the public repo gets free
  # unlimited Actions minutes; Cloud Build with E2_HIGHCPU_8 has no free tier).
  # The deployer SA needs act-as on both runtime SAs so the per-service deploy
  # workflows can each pass `--service-account` for their own service.
  cloud_run_service_account_emails = [
    google_service_account.heroes_api_runtime.email,
    google_service_account.heroes_web_runtime.email,
  ]
}
