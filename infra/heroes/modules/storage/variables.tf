variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "ASIA-SOUTHEAST2"
}

variable "labels" {
  description = "Standard label set applied to both storage buckets for cost attribution."
  type        = map(string)
  default     = {}
}
