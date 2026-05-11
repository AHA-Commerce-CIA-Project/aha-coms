variable "project_id" {
  type = string
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name for alert conditions"
  type        = string
}

variable "cloud_run_url" {
  description = "Public HTTPS URL of the Cloud Run service for uptime checks"
  type        = string
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL instance name for alert conditions"
  type        = string
}

variable "alert_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
}
