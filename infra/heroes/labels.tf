############################################################
# Standard label set for cost attribution + audit
#
# Per `tasks/plan.md` Standing principle 4 — every Tofu-managed resource
# in this state that supports labels carries `heroes_labels` (the shared set)
# and per-service Cloud Run resources also carry the matching `*_labels`
# variant with `service = "heroes-{api,web}"` merged in.
#
# Resources GCP doesn't support labels on (service accounts, WIF pools/providers,
# IAM bindings) carry attribution via the `coms-heroes-*` naming convention
# from principle 2.
#
# Cloud SQL instance is created by the cloud-sql module here, so it can be
# labelled — done via the `labels` variable on that module.
############################################################

locals {
  heroes_labels = {
    app         = "heroes"
    environment = "prod"
    managed-by  = "opentofu"
  }

  heroes_labels_api = merge(local.heroes_labels, {
    service = "heroes-api"
  })

  heroes_labels_web = merge(local.heroes_labels, {
    service = "heroes-web"
  })
}
