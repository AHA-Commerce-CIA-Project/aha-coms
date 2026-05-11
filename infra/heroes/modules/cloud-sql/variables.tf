variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "db_user" {
  type = string
}

variable "tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}
