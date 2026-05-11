terraform {
  backend "gcs" {
    bucket = "coms-aha-heroes-tfstate"
    prefix = "tofu/state"
  }
}
