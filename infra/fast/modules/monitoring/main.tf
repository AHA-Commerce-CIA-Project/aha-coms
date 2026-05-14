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

# ── Uptime Check ──────────────────────────────────────────────
# T79 authors /fast/api/health; until that ships, the uptime check sits
# pre-wired against the path Cloud Run probes will land on. The 503/404 the
# check sees pre-T79 will surface in monitoring as "expected failure" — the
# alert policy below has a 0s duration trigger that fires immediately, so
# this resource ships disabled (.enabled = false) until T79 closes.

resource "google_monitoring_uptime_check_config" "health" {
  project      = var.project_id
  display_name = "AHA Fast — /fast/api/health"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/fast/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "aha-coms.web.app"
    }
  }
}

# ── Alert: Uptime Check Failure ───────────────────────────────

resource "google_monitoring_alert_policy" "uptime_failure" {
  project      = var.project_id
  display_name = "AHA Fast — Uptime Check Failed"
  combiner     = "OR"

  # Disabled until T79 lands /fast/api/health. Enable in the same operator
  # window that ships the health route handler.
  enabled = false

  conditions {
    display_name = "Uptime check failure"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id"]
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

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
