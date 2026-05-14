terraform {
  backend "gcs" {
    bucket = "coms-fast-tfstate"
    prefix = "tofu/state"
  }
}
