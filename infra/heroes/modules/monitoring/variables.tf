variable "project_id" {
  type = string
}

variable "cloud_run_service_names" {
  description = "Cloud Run service names for alert conditions — heroes runs as two services (api + web), the 5xx alert fires if either exceeds the threshold."
  type        = list(string)
}

variable "cloud_run_url" {
  description = "Public HTTPS URL of the canary Cloud Run service for uptime checks. Heroes-api owns /heroes/api/health; heroes-web does not expose a health endpoint."
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
