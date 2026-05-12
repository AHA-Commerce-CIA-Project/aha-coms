variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "labels" {
  description = "Standard label set applied to the AR repo for cost attribution. Defaults to {} so omitting the input doesn't break older callers."
  type        = map(string)
  default     = {}
}
