variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "cloud_run_sa_email" {
  description = "Cloud Run service account email that needs access to the SA key secret. Heroes wires this to the api SA — heroes-web never touches Sheets."
  type        = string
}

variable "labels" {
  description = "Standard label set applied to the sheet-sync key secret for cost attribution."
  type        = map(string)
  default     = {}
}
