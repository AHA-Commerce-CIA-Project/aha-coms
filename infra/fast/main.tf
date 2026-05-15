module "artifact_registry" {
  source     = "./modules/artifact-registry"
  project_id = var.project_id
  region     = var.region
  labels     = local.fast_labels
}

# Cloud Run lives in cloud-run.tf — mirrors heroes' shape (declared inline,
# no module wrapper) so the single service file reads top-to-bottom.

module "monitoring" {
  source                  = "./modules/monitoring"
  project_id              = var.project_id
  cloud_run_service_name  = google_cloud_run_v2_service.coms_fast_web.name
  cloud_sql_instance_name = google_sql_database_instance.fast.name
  alert_email             = var.alert_email
  labels                  = local.fast_labels
}

module "github_wif" {
  source                          = "./modules/github-wif"
  project_id                      = var.project_id
  github_org                      = var.github_org
  github_repo                     = var.github_repo
  cloud_run_service_account_email = google_service_account.fast_web_runtime.email
}
