# Rev 2 — Spec 05: Stale-Serve Alerting Escalation

> Priority: **5 (cleanup of Rev 1 carryover; small, Heroes-only)**
> Scope: Heroes only
> Prerequisites: Rev 1 Spec 04 §1 shipped (it is)

---

## Overview

Rev 1 Spec 04 §1 specified a stale-while-revalidate pattern for Heroes' portal introspect cache **plus** an alerting escalation when stale-serves cross a rate threshold. The cache is shipped (`packages/web/src/lib/server/portal-introspect.ts:113-120`). The alerting is not.

Today, when the portal is unreachable for minutes, Heroes:

- Serves stale cache (good — users keep working)
- Emits `console.warn` per stale-serve (insufficient — invisible unless logs are tailed)

If the portal stays down past `STALE_TTL_MS` (5 minutes), every cached session expires from the stale window and users start hard-failing. By that point we want a page; today we get nothing.

This spec adds the escalation Rev 1 originally called for, plus a Cloud Monitoring alert policy.

---

## Behavioral Goal

Three log severities, mapped to operational meaning:

| Condition | Severity | What it means |
|-----------|----------|---------------|
| Portal reachable | none | Normal operation |
| Stale cache served, < 3 occurrences in 2-min window | `WARNING` | Brief blip, probably already over |
| Stale cache served, ≥ 3 occurrences in 2-min window | `ERROR` | Sustained outage; page on-call |
| Hard-fail (no cache, portal down) | `ERROR` immediately | User explicitly locked out |

The 3-in-2-min threshold trades sensitivity for noise: a 10-second blip won't page; a multi-minute outage will.

---

## Implementation

`packages/web/src/lib/server/portal-introspect.ts`:

```typescript
// At module scope: a small ring buffer of recent stale-serve timestamps.
const STALE_SERVE_WINDOW_MS = 120_000        // 2 minutes
const STALE_SERVE_ESCALATE_THRESHOLD = 3
const recentStaleServes: number[] = []

function recordStaleServe(): { severity: 'WARNING' | 'ERROR'; count: number } {
  const now = Date.now()
  // Drop entries older than the window
  while (recentStaleServes.length > 0 && recentStaleServes[0] < now - STALE_SERVE_WINDOW_MS) {
    recentStaleServes.shift()
  }
  recentStaleServes.push(now)
  return {
    severity: recentStaleServes.length >= STALE_SERVE_ESCALATE_THRESHOLD ? 'ERROR' : 'WARNING',
    count: recentStaleServes.length,
  }
}

// In the stale-serve branch:
const stale = cache.get(sessionId)
if (stale && stale.staleUntil > Date.now()) {
  const { severity, count } = recordStaleServe()
  console.log(JSON.stringify({
    severity,
    message: 'portal_introspect_stale_serve',
    sessionId,
    lastStatus,
    staleAgeMs: Date.now() - (stale.staleUntil - STALE_TTL_MS),
    countInWindow: count,
    windowMs: STALE_SERVE_WINDOW_MS,
  }))
  return stale.result
}

// In the hard-fail branch (no cache, retries exhausted):
console.log(JSON.stringify({
  severity: 'ERROR',
  message: 'portal_introspect_unavailable',
  sessionId,
  lastStatus,
}))
throw new PortalIntrospectUnavailableError(...)
```

### Why structured JSON

Cloud Logging on Cloud Run automatically parses JSON-formatted stdout into structured log entries when the `severity` field is present at the top level. The `message` field becomes the searchable summary, and the `severity` field drives Cloud Monitoring alert policies. Plain `console.warn`/`console.error` get severity from the stream (stderr → ERROR), which is too coarse — `console.error` happens for plenty of routine bookkeeping.

### Why an in-process ring buffer (not a counter service)

Heroes runs at most a handful of Cloud Run instances. A 3-occurrence threshold is per-instance — if the outage is widespread enough to cause stale-serves on multiple instances, all of them will escalate at roughly the same time. A central counter (Redis, Cloud Memorystore) would be more accurate but adds infra and isn't worth it for a 3-in-2-min trigger.

The ring buffer is bounded (max ~3-30 entries depending on traffic), shared across requests via module scope, and resets on instance restart — which is fine because the alerting target is "outage detected within 2 minutes," not "exact count of stale serves across deployment."

---

## Cloud Monitoring Alert Policy

`infra/modules/monitoring/main.tf` (Heroes infra):

```hcl
resource "google_monitoring_alert_policy" "portal_introspect_stale_serve_escalated" {
  display_name = "Heroes — portal introspect stale-serve escalated"
  combiner     = "OR"

  conditions {
    display_name = "Stale serves crossed escalation threshold"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="coms-aha-heroes-app"
        severity="ERROR"
        jsonPayload.message="portal_introspect_stale_serve"
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"  # max one alert per 5 minutes
    }
  }

  notification_channels = [google_monitoring_notification_channel.alert_email.id]

  documentation {
    content = <<-EOT
      Heroes is serving cached introspect responses because the portal is unreachable.

      Sustained stale-serves indicate the portal is in an outage.

      Runbook:
      1. Check portal Cloud Run service health (status 5xx? scale-to-zero stuck cold?).
      2. Check Cloud SQL connectivity from portal.
      3. If portal is down, escalate to portal team. Heroes will keep serving stale up to 5 minutes per session, then start hard-failing.
    EOT
  }
}

resource "google_monitoring_alert_policy" "portal_introspect_unavailable" {
  display_name = "Heroes — portal introspect unavailable (hard-fail)"
  combiner     = "OR"

  conditions {
    display_name = "Hard-fail introspect (no cache available)"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="coms-aha-heroes-app"
        severity="ERROR"
        jsonPayload.message="portal_introspect_unavailable"
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.alert_email.id]
}
```

The Heroes monitoring module already has an `alert_email` notification channel (used for Cloud Run / Cloud SQL alerts) — wire to that. PagerDuty / Slack channels can be added later.

---

## What This Doesn't Do

- **Deep introspect failure mode classification.** A 503 from portal vs. a TCP timeout vs. DNS failure are all collapsed into "stale-serve." If we want finer alerts (e.g., "portal up but DB down"), that's a separate spec — and likely belongs on the portal side, not the receiver side.
- **Per-session alerting.** A single user with a unique outage can't trigger a page; the threshold is across all sessions. Acceptable — operationally we care about service-wide trends, not single-user anomalies.
- **Synthetic ping** of the portal from outside Cloud Run. Considered but rejected: the existing portal health probe (Rev 1 Spec 04 §2) already covers that on the portal side. Heroes alerting fires when *Heroes* sees the symptom from the user's perspective, which is the right signal for Heroes' on-call.

---

## Migration

Pure addition. No behavior change for the happy path. Deploy + test by:

1. Run Heroes locally pointed at a non-existent `PORTAL_ORIGIN`.
2. Hit an authed page 4 times within 2 minutes (with a populated stale cache).
3. Confirm log entries: 1× `WARNING`, 1× `WARNING`, 1× `ERROR`, 1× `ERROR`.
4. After deploy: deliberately stop the portal Cloud Run service for 3 minutes; confirm Heroes-side alert fires in Cloud Monitoring.

---

## Files Modified

### Heroes only

| File | Change |
|------|--------|
| `packages/web/src/lib/server/portal-introspect.ts` | Add `recordStaleServe()` ring buffer; replace `console.warn` with severity-tagged JSON logs |
| `infra/modules/monitoring/main.tf` | Add two alert policies (stale-serve escalated, hard-fail) |
| `infra/modules/monitoring/variables.tf` | (If needed) parameter for Cloud Run service name |

---

## Success Criteria

1. Stale-serve below threshold logs `severity: WARNING`.
2. Stale-serve at threshold logs `severity: ERROR`.
3. Hard-fail logs `severity: ERROR` immediately, regardless of count.
4. Cloud Monitoring fires the escalated stale-serve policy within ~3 minutes of a sustained portal outage.
5. Cloud Monitoring fires the hard-fail policy within ~1 minute of any user being locked out.
6. Notification channel reaches the Heroes on-call alias.
