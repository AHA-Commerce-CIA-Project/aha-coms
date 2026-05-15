############################################################
# Cloud SQL — aha-fast-db-instance-cd5db712
#
# The instance was provisioned in 2026-03 by the legacy
# `alifm17/aha-fast` repo's Terraform. infra/fast/ originally
# only held a read-only `data` lookup against it (variables.tf
# referenced the legacy state directly). The 2026-05-15
# post-incident audit on the auth-cache + widgets corridor
# surfaced that the legacy state was no longer applied (FU-27
# retired aha-fast-app and its adjacencies), so any operational
# change to the DB instance was forced out-of-band via
# `gcloud sql instances patch`, leaving no PR-reviewable trail.
#
# This file imports the existing live resource into infra/fast/
# state so future changes (tier bumps, flag additions, backup
# tweaks) read as standard `tofu plan` diffs. Every attribute
# below is captured verbatim from
# `gcloud sql instances describe aha-fast-db-instance-cd5db712`
# at the time of import; the import is correct iff the next
# `tofu plan` reports 0 to add, 0 to change, 0 to destroy.
#
# What this codification does NOT manage:
#   - The default `postgres` database (auto-created by Cloud SQL,
#     not destroyable, kept out of state).
#   - The `postgres` and `aha-fast-admin` SQL users — their
#     passwords live in Secret Manager (`aha-fast-db-url` carries
#     the connection string with the password). Pulling them into
#     state would require either declaring the password inline
#     (a regression) or wiring Secret Manager lookups + lifecycle
#     ignore_changes, which is a separate decision. For now, user
#     CRUD continues via `gcloud sql users`.
############################################################

resource "google_sql_database_instance" "fast" {
  project          = var.project_id
  name             = var.fast_db_instance_name
  region           = var.region
  database_version = "POSTGRES_15"

  # Terraform-side guard. Set true to refuse `terraform destroy`
  # against this resource — the Cloud SQL API's own deletion-
  # protection flag is `settings.deletion_protection_enabled`
  # below and is separately false on the live instance, matching
  # the pre-import state.
  deletion_protection = true

  settings {
    tier              = "db-f1-micro"
    edition           = "ENTERPRISE"
    activation_policy = "ALWAYS"
    availability_type = "ZONAL"
    pricing_plan      = "PER_USE"

    disk_type             = "PD_SSD"
    disk_size             = 10
    disk_autoresize       = true
    disk_autoresize_limit = 0

    deletion_protection_enabled = false
    connector_enforcement       = "NOT_REQUIRED"

    backup_configuration {
      enabled                        = true
      start_time                     = "14:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"

      # Inherited from the legacy aha-fast provisioning — the
      # 0.0.0.0/0 entry is wide open and a known follow-up worth
      # filing once the operator can confirm which laptop/runner
      # ranges still need direct IP access (the GHA workflow
      # already uses cloud-sql-proxy + WIF, so this allow-all is
      # likely vestigial). Recorded verbatim to keep the import
      # plan clean; do not tighten without a separate commit.
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0"
      }
    }

    location_preference {
      zone = "${var.region}-a"
    }
  }
}

# The application database — referenced in the
# `aha-fast-db-url` Secret Manager DSN. Charset + collation are
# Cloud SQL defaults; captured here so a future apply against a
# rebuilt instance produces the same shape.
resource "google_sql_database" "aha_fast_db" {
  project   = var.project_id
  instance  = google_sql_database_instance.fast.name
  name      = "aha-fast-db"
  charset   = "UTF8"
  collation = "en_US.UTF8"
}
