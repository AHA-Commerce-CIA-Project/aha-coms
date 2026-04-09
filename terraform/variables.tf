variable "project_id" {
  description = "The ID of the GCP Project where resources will be created"
  type        = string
}

variable "region" {
  description = "The region to deploy resources to"
  type        = string
  default     = "asia-southeast2" # Jakarta
}

variable "prefix" {
  description = "The prefix to apply to all resource names"
  type        = string
  default     = "aha-fast-"
}
