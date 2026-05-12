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

variable "cloud_run_service_account_emails" {
  description = "Cloud Run runtime SA emails — deployer needs iam.serviceAccountUser + iam.serviceAccountTokenCreator on each. Pass [api_sa, web_sa] for the heroes corridor's two services."
  type        = list(string)
}
