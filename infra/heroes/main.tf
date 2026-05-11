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

module "monitoring" {
  source                  = "./modules/monitoring"
  project_id              = var.project_id
  cloud_run_service_name  = "coms-aha-heroes-app"
  cloud_run_url           = module.cloud_run.service_url
  cloud_sql_instance_name = module.cloud_sql.instance_name
  alert_email             = var.alert_email
}

module "sheet_sync" {
  source             = "./modules/sheet-sync"
  project_id         = var.project_id
  cloud_run_sa_email = "coms-aha-heroes-run-sa@${var.project_id}.iam.gserviceaccount.com"
}

module "cloud_run" {
  source                       = "./modules/cloud-run"
  project_id                   = var.project_id
  region                       = var.region
  image                        = var.app_image
  db_connection_name           = module.cloud_sql.connection_name
  db_url_secret_id             = module.cloud_sql.db_url_production_secret_id
  db_url_staging_secret_id     = module.cloud_sql.db_url_staging_secret_id
  uploads_bucket_name          = module.storage.uploads_bucket_name
  exports_bucket_name          = module.storage.exports_bucket_name
  sheet_sync_sa_key_secret_id  = module.sheet_sync.sa_key_secret_id
  portal_service_account_email = var.portal_service_account_email
  sheet_sync_config = {
    sheet_id_points    = var.sheet_id_points
    sheet_id_employees = var.sheet_id_employees
    tab_employees      = "HEROES - Fulltime Staff"
    tab_bintang        = "Poin Bintang"
    tab_penalti        = "Poin Penalti"
    tab_poin_aha       = "Poin AHA"
    tab_redeem         = "Redeem Poin AHA"
  }

  depends_on = [module.cloud_sql, module.storage, module.sheet_sync]
}

module "github_wif" {
  source                          = "./modules/github-wif"
  project_id                      = var.project_id
  github_org                      = var.github_org
  github_repo                     = var.github_repo
  cloud_run_service_account_email = module.cloud_run.service_account_email
}
