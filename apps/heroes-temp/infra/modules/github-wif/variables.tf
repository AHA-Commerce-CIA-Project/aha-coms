variable "project_id" {
  type = string
}

variable "github_org" {
  description = "GitHub organization or user that owns the repository"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (without org prefix)"
  type        = string
}

variable "cloud_run_service_account_email" {
  description = "Cloud Run runtime SA email — deployer needs iam.serviceAccountUser on this"
  type        = string
}
