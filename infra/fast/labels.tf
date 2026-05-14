############################################################
# Standard label set for cost attribution + audit
#
# Per `tasks/plan.md` Standing principle 4 — every Tofu-managed resource
# in this state that supports labels carries `fast_labels` (the shared set)
# and the per-service Cloud Run resource also carries the `fast_labels_web`
# variant with `service = "fast-web"` merged in.
#
# Fast runs as a single Cloud Run service (unified per ADR 0011 Open Question
# §3 Option A — Next.js serves API routes and pages from one runtime), so
# there is only one service-suffixed label set; if a later split introduces a
# separate fast-api or fast-worker, mirror heroes' two-label shape here.
#
# Resources GCP doesn't support labels on (service accounts, WIF pools/providers,
# IAM bindings) carry attribution via the `coms-fast-*` naming convention
# from principle 2.
############################################################

locals {
  fast_labels = {
    app         = "fast"
    environment = "prod"
    managed-by  = "opentofu"
  }

  fast_labels_web = merge(local.fast_labels, {
    service = "fast-web"
  })
}
