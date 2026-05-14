variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "labels" {
  description = "Standard label set applied to the AR repo for cost attribution."
  type        = map(string)
  default     = {}
}
