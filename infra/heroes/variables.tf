variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "fbi-dev-484410"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-southeast2"
}

variable "db_user" {
  description = "Cloud SQL master user name"
  type        = string
  default     = "app"
}

variable "db_tier" {
  description = "Cloud SQL instance machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "github_org" {
  description = "GitHub organization or user that owns the repository"
  type        = string
  default     = "mrdoorba"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "coms-aha-heroes"
}

variable "alert_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
}

variable "sheet_id_points" {
  description = "Google Spreadsheet ID for points and redeem tabs"
  type        = string
  default     = ""
}

variable "sheet_id_employees" {
  description = "Google Spreadsheet ID for employee list tab"
  type        = string
  default     = ""
}

variable "app_image" {
  description = "Full Docker image URI for Cloud Run (overridden per deploy)"
  type        = string
  # Placeholder to bootstrap Cloud Run before the first real image is pushed.
  # After the first successful deploy.yml run, this value is irrelevant —
  # the workflow always overrides it with the SHA-tagged image.
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "portal_service_account_email" {
  description = "SA email the portal Cloud Run runs as — used to verify inbound webhook Bearer tokens (Rev 2 §03)."
  type        = string
  # Defaults to the SA in this project. deploy.yml sources the same value from
  # the GitHub repo variable PORTAL_SERVICE_ACCOUNT_EMAIL so a Cloud Run env
  # update doesn't get reset on each deploy. Override here if portal moves
  # projects.
  default = "coms-portal-run-sa@fbi-dev-484410.iam.gserviceaccount.com"
}
