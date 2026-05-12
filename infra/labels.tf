############################################################
# Standard label set for cost attribution + audit
#
# Per `tasks/plan.md` Standing principle 4 — every Tofu-managed resource
# in this state that supports labels carries `portal_labels` (the shared set)
# and per-service resources also carry the matching `*_labels` variant
# with `service = "portal-{api,web}"` merged in.
#
# Resources GCP doesn't support labels on (service accounts, WIF pools/providers,
# IAM bindings, Cloud Tasks queues, Cloud Scheduler jobs) carry attribution via
# the `coms-portal-*` naming convention from principle 2.
#
# Cloud SQL instance is a data source here (lives outside this state, shared
# with heroes) — label it via `gcloud sql instances patch` if cost attribution
# at the instance level is needed.
############################################################

locals {
  portal_labels = {
    app         = "portal"
    environment = "prod"
    managed-by  = "opentofu"
  }

  portal_labels_api = merge(local.portal_labels, {
    service = "portal-api"
  })

  portal_labels_web = merge(local.portal_labels, {
    service = "portal-web"
  })
}
