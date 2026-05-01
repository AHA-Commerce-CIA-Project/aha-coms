variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "cloud_sql_instance" {
  description = "Existing Cloud SQL instance name (not connection string)"
  type        = string
}

variable "domain" {
  description = "Public domain for the COMS Portal"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository in owner/repo format"
  type        = string
}

variable "gip_project_id" {
  description = "Google Identity Platform project ID"
  type        = string
}

variable "gip_auth_domain" {
  description = "Firebase auth domain"
  type        = string
}

variable "coms_domain" {
  description = "COMS Portal public domain"
  type        = string
}

variable "session_cookie_max_age" {
  description = "Session cookie max age in seconds"
  type        = string
  default     = "1209600"
}

variable "sheets_personal_email_id" {
  description = "Google Sheet ID for personal email roster"
  type        = string
}

variable "sheets_personal_email_tab" {
  description = "Sheet tab name for personal email data"
  type        = string
}

variable "service_url" {
  description = <<-EOT
    Public base URL of the deployed Cloud Run service (no trailing slash).
    Used as the Cloud Tasks → service callback URL and as the OIDC audience
    on the DLQ Pub/Sub push subscription. The Cloud Run URL is only known
    after the first apply, so this is supplied as a tfvar after the initial
    deploy (or via a custom domain mapping that's stable from the start).
  EOT
  type        = string
}

variable "bootstrap_admin_email" {
  description = "Workspace email for the bootstrap admin identity row (spec-06). Passed to the seed-admin post-migrate script via Cloud Run env."
  type        = string
}

variable "bootstrap_admin_name" {
  description = "Display name for the bootstrap admin identity row (spec-06)."
  type        = string
}

variable "mail_transport" {
  type        = string
  description = "Outbound mail transport. 'stdout' for dev (logs only — forbidden in prod), 'brevo' for production. PR B1 lands as 'stdout'; PR B2 wires Brevo and the deploy var flips to 'brevo' once the API-key secret is populated via gcloud."
  default     = "stdout"
  validation {
    condition     = contains(["stdout", "brevo"], var.mail_transport)
    error_message = "mail_transport must be 'stdout' or 'brevo'. The 'memory' value is test-only."
  }
}

variable "brevo_from" {
  type        = string
  description = "Verified Brevo sender address used as the FROM on outbound mail. Dev posture (no DNS for ahacommerce.net per Q3-DNS): the operator's Brevo single-sender. Production: noreply@ahacommerce.net once DNS is wired. Empty string allowed when mail_transport='stdout' (Phase 1 of PR B2)."
  default     = ""
}
