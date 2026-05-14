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
  description = "GitHub repository name. The monorepo `aha-coms` holds both portal and heroes; heroes deploys originate from here per T17. (Repo was renamed from `coms-portal` after T17 to match the local working dir name.)"
  type        = string
  default     = "aha-coms"
}

variable "alert_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
}

variable "sheet_id_points" {
  description = "Google Spreadsheet ID for points and redeem tabs. Required — set in terraform.tfvars. Not secret per FU-9 ops decision; identifying the canonical spreadsheet is no leakier than the Drive sharing model."
  type        = string

  validation {
    condition     = length(var.sheet_id_points) > 0
    error_message = "sheet_id_points must be set (see infra/heroes/terraform.tfvars). FU-9: empty defaults silently dropped the Cloud Run env vars on every apply."
  }
}

variable "sheet_id_employees" {
  description = "Google Spreadsheet ID for employee list tab. Required — set in terraform.tfvars."
  type        = string

  validation {
    condition     = length(var.sheet_id_employees) > 0
    error_message = "sheet_id_employees must be set (see infra/heroes/terraform.tfvars)."
  }
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
  description = "Public origin heroes-web is served at — exposed to the client as PUBLIC_APP_ORIGIN. Used for absolute URL construction (deep-link reconstruction in the (authed) layout, OAuth callbacks, etc.). After single-origin migration this is the COMS unified host without a path; heroes-web's SvelteKit base path supplies the `/heroes` segment at request time."
  type        = string
  default     = "https://aha-coms.web.app"
}

variable "coms_origin" {
  description = "Public origin of the unified COMS suite on Firebase Hosting — every app (portal-web, heroes-web, future tenants) is served behind this one host with path-based rewrites. Used by heroes-web's PORTAL_ORIGIN to build browser-redirect URLs (portal sign-in landing) and the server-to-server broker-exchange call (Firebase rewrites `/api/**` → coms-portal-api). The legacy direct Cloud Run URL stays in `portal_base_url` for the audience-aware ID-token paths."
  type        = string
  default     = "https://aha-coms.web.app"
}

# Variable `heroes_api_public_url` was removed alongside FU-24 on
# 2026-05-14. It had backed the `SELF_PUBLIC_URL` env on coms-heroes-api
# pointing at the Cloud Run URL, but the audience portal mints for
# inbound webhooks is `new URL(endpoint.url).origin` — for heroes'
# single-origin endpoint that is `https://aha-coms.web.app`, not the
# Cloud Run URL. `var.heroes_public_origin` carries the right value;
# the orphaned variable was deleted to prevent a future reader from
# reinstating the same mismatch.
