variable "project_id" {
  type = string
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name for 5xx alert conditions — fast runs as a single service so this is a string, not a list (heroes' module takes a list because heroes is two services)."
  type        = string
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL instance name for the CPU alert condition."
  type        = string
}

variable "alert_email" {
  description = "Email address for monitoring alert notifications."
  type        = string
}

variable "labels" {
  description = "GCP resource labels applied as `user_labels` on alert policies and notification channels. The caller passes `local.fast_labels` to satisfy standing principle 4 — every label-able fast resource in this state carries the shared label set."
  type        = map(string)
}
