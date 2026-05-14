# Set the _Default log bucket retention to 30 days.
# GCP default is 30 days, but this makes it explicit and IaC-managed.
resource "google_logging_project_bucket_config" "default" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "_Default"
  retention_days = 30
}

# ── Notification Channel ──────────────────────────────────────────────────────

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "AHA Heroes Alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# ── Uptime Check + Uptime-Failure Alert: REMOVED via FU-21 always-warm audit
# (2026-05-14). The 5-min probe was keeping heroes-api always-warm (~$2.50/mo
# memory cost) and provided outage detection within ~10 min. Removing the
# probe drops heroes-api to true scale-to-zero; the 5xx alert below remains as
# the outage signal. Trade-off recorded: a service with zero traffic that's
# silently broken won't trigger 5xx (no requests means no 5xx ratio), so
# detection becomes reactive (operator/user-reported) rather than proactive.
# Acceptable for admin-grade. Re-add the probe + uptime_failure alert here
# if heroes' user-facing tolerance ever needs sub-30-min outage detection.

# ── Alert: Cloud Run 5xx Error Rate ──────────────────────────────────────────
# One policy per service so an api-only blip pages with the api service named
# in the alert subject (and likewise for web). A single combined policy would
# obscure which service is degraded.

resource "google_monitoring_alert_policy" "cloud_run_5xx" {
  for_each = toset(var.cloud_run_service_names)

  project      = var.project_id
  display_name = "AHA Heroes — ${each.value} 5xx > 5%"
  combiner     = "OR"

  conditions {
    display_name = "5xx error rate > 5%"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${each.value}\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

# ── Alert: Cloud SQL CPU > 80% ───────────────────────────────────────────────

resource "google_monitoring_alert_policy" "cloud_sql_cpu" {
  project      = var.project_id
  display_name = "AHA Heroes — Cloud SQL CPU > 80%"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilization > 80%"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND resource.labels.database_id = \"${var.project_id}:${var.cloud_sql_instance_name}\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "600s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

