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
