variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "cloud_run_sa_email" {
  description = "Cloud Run service account email that needs access to the SA key secret"
  type        = string
}
