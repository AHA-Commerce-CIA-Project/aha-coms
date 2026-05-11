<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# monitoring

## Purpose
Observability infrastructure: 30-day log retention on the `_Default` log bucket, email notification channel, uptime check for the health endpoint, and three alert policies covering availability, error rates, and database CPU.

## Key Files
| File | Description |
|------|-------------|
| `main.tf` | 133 lines. Creates: 30-day retention policy on `_Default` log bucket; email notification channel; uptime check on `/api/health` every 5 minutes with SSL validation; alert policy — uptime check failure; alert policy — Cloud Run 5xx error rate >5% sustained for 5 minutes; alert policy — Cloud SQL CPU utilization >80% sustained for 10 minutes; all alerts auto-close after 30 minutes of no data |
| `variables.tf` | Input variables: `project_id`, `service_url`, `alert_email`, `cloud_sql_instance_id` |

## Subdirectories (if any)
_None_

## For AI Agents

### Working In This Directory
- The uptime check hits `/api/health` — this is distinct from the Cloud Run health probe which uses `/api/healthz`. Ensure both routes exist and return 200 in the application.
- Alert thresholds (5% 5xx, 80% CPU) are starting points. Tune them after observing baseline traffic patterns in production.
- The auto-close duration of 30 minutes prevents stale alert incidents from accumulating. Extend it if on-call response times are longer.
- Email notification goes to `alert_email` set in `terraform.tfvars`. Update that file (not this module) to change the recipient.
- Log retention at 30 days is the minimum for most compliance requirements. Increase if audit requirements demand longer retention — note that extended retention incurs GCP logging costs.

### Common Patterns
- Alert policies use MQL (Monitoring Query Language) conditions — changes require familiarity with GCP Cloud Monitoring MQL syntax.
- The notification channel ID is referenced by all three alert policies — it is created once and shared.

## Dependencies

### Internal
- Receives `service_url` from `cloud-run/` output for the uptime check target
- Receives `cloud_sql_instance_id` from `cloud-sql/` output for the CPU alert filter

### External
- GCP APIs: Cloud Monitoring, Cloud Logging
- `hashicorp/google ~>7.0` provider

<!-- MANUAL: Tune alert thresholds after observing production baseline metrics. -->
