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
