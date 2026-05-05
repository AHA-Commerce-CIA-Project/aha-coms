variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  description = "Full Docker image URI to deploy"
  type        = string
}

variable "db_connection_name" {
  description = "Cloud SQL connection name (PROJECT:REGION:INSTANCE)"
  type        = string
}

variable "db_url_secret_id" {
  description = "Secret Manager secret ID containing the production DATABASE_URL"
  type        = string
}

variable "db_url_staging_secret_id" {
  description = "Secret Manager secret ID containing the staging DATABASE_URL"
  type        = string
}

variable "uploads_bucket_name" {
  description = "GCS bucket name for file uploads"
  type        = string
}

variable "exports_bucket_name" {
  description = "GCS bucket name for report exports"
  type        = string
}

variable "sheet_sync_sa_key_secret_id" {
  description = "Secret Manager secret ID for the Google Sheets sync SA key"
  type        = string
  default     = ""
}

variable "portal_service_account_email" {
  description = "Email of the SA the portal Cloud Run runs as. Used to verify Authorization: Bearer Google ID tokens on inbound portal webhooks (Rev 2 §03)."
  type        = string
}

variable "sheet_sync_config" {
  description = "Google Sheets sync configuration (Sheet IDs and tab names)"
  type = object({
    sheet_id_points    = string
    sheet_id_employees = string
    tab_employees      = string
    tab_bintang        = string
    tab_penalti        = string
    tab_poin_aha       = string
    tab_redeem         = string
    sync_interval_ms   = string
  })
  default = {
    sheet_id_points    = ""
    sheet_id_employees = ""
    tab_employees      = "HEROES - Fulltime Staff"
    tab_bintang        = "Poin Bintang"
    tab_penalti        = "Poin Penalti"
    tab_poin_aha       = "Poin AHA"
    tab_redeem         = "Redeem Poin AHA"
    sync_interval_ms   = "600000"
  }
}
