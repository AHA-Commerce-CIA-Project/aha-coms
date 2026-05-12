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
  description = "GitHub repository name. The monorepo `coms-portal` holds both portal and heroes; heroes deploys originate from here per T17."
  type        = string
  default     = "coms-portal"
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
  description = "Bootstrap Docker image URI for Cloud Run — overridden by Cloud Build at first deploy."
  type        = string
  # Placeholder to bootstrap Cloud Run before the first real image is pushed.
  # After the first successful Cloud Build run (apps/heroes-{api,web}/cloudbuild.yaml),
  # this value is irrelevant — `gcloud run deploy --image=...` overrides it
  # with the SHA-tagged image, and lifecycle.ignore_changes keeps Tofu from
  # fighting subsequent deploys.
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "portal_service_account_email" {
  description = "SA email the portal Cloud Run runs as — used to verify inbound webhook Bearer tokens (Rev 2 §03)."
  type        = string
  # Defaults to the SA in this project. The cloudbuild deploy command sources
  # the same value so a Cloud Run env update doesn't get reset on each deploy.
  # Override here if portal moves projects.
  default = "coms-portal-run-sa@fbi-dev-484410.iam.gserviceaccount.com"
}

variable "portal_base_url" {
  description = "Public base URL of portal-api — used by heroes for server-to-server calls and exposed to the client as PUBLIC_PORTAL_ORIGIN."
  type        = string
  # Same project; portal-api is the contract-aligned name from T16. Override
  # via terraform.tfvars when portal lives at a custom domain.
  default = "https://coms-portal-api-45tyczfska-et.a.run.app"
}

variable "heroes_public_origin" {
  description = "Public origin heroes-web is served at — exposed to the client as PUBLIC_APP_ORIGIN. Used for absolute URL construction in OAuth callbacks etc."
  type        = string
  default     = "https://coms-heroes-web-45tyczfska-et.a.run.app"
}

variable "heroes_api_public_url" {
  description = "Public URL of heroes-api — used as the expected 'aud' claim when verifying portal-issued ID tokens on inbound webhooks (Rev 2 §03)."
  type        = string
  default     = "https://coms-heroes-api-45tyczfska-et.a.run.app"
}
