# Notification channel + uptime check + alert policies for coms-fast-web.
#
# Fast runs as a single Cloud Run service, so the 5xx alert is a single
# google_monitoring_alert_policy (no for_each) — heroes' shape used for_each
# because heroes carries two services.

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "AHA Fast Alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# ── Uptime Check + Uptime-Failure Alert: REMOVED via FU-21 always-warm audit
# (2026-05-14). The 5-min probe at `/fast/api/health` (sealed by T79) was
# providing outage detection within ~10 min, redundant against fast-web's
# `min=1` always-warm shape (Path X kept). The probe was costing ~$0 directly
# but stayed as a noise generator on every plan and kept an alert resource
# whose `enabled = false` was a historical "until T79 lands" deferral that
# never flipped. Removing the probe + dependent uptime_failure alert. The
# 5xx alert below remains as the outage signal. Re-add the probe here if
# fast's user-facing SLO ever needs sub-30-min proactive detection.

# ── Alert: Cloud Run 5xx Error Rate ───────────────────────────

resource "google_monitoring_alert_policy" "cloud_run_5xx" {
  project      = var.project_id
  display_name = "AHA Fast — ${var.cloud_run_service_name} 5xx > 5%"
  combiner     = "OR"

  conditions {
    display_name = "5xx error rate > 5%"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${var.cloud_run_service_name}\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
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

# ── Alert: Cloud SQL CPU > 80% ────────────────────────────────
# Fast's DB instance is referenced as a data source from the parent state;
# we accept the instance name here and assemble the database_id filter.

resource "google_monitoring_alert_policy" "cloud_sql_cpu" {
  project      = var.project_id
  display_name = "AHA Fast — Cloud SQL CPU > 80%"
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
