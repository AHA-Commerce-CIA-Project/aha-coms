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

variable "labels" {
  description = "Standard label set applied to the SQL instance and DB-related secrets for cost attribution."
  type        = map(string)
  default     = {}
}
