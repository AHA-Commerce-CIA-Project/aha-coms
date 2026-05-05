# ── Rev 2 §01 — Broker signing-keys IAM ──────────────────────────────
#
# The portal Cloud Run service generates, stores, and reads ES256 private
# keys from Secret Manager (one secret per kid, named
# `portal-broker-signing-key-<kid>`). Three operations are needed at
# runtime:
#
#   1. CREATE secret + first version    (bootstrap, rotation)
#   2. ADD secret version               (rotation — though current rotation
#                                        creates a new secret per kid, kept
#                                        for emergency in-place re-version)
#   3. ACCESS latest version            (every loadActiveSigningKey() —
#                                        cached for 5 min in-process)
#   4. DISABLE old version              (cleanup after retirement)
#
# Why `secretmanager.admin` rather than the tighter `secretAccessor`:
#   - `secretAccessor` covers (3) only. Operations (1), (2), (4) require
#     `secretmanager.secrets.create` / `versions.add` / `versions.disable`,
#     which are bundled in `secretmanager.admin`.
#   - IAM conditions can pin the binding to resources matching
#     `name.startsWith("projects/.../secrets/portal-broker-signing-key-")`
#     for ACCESS/ADD/DISABLE (resource is the secret), but NOT for CREATE
#     (the resource at create-time is the project, not the secret), so a
#     condition-only scope is impossible without losing the create path.
#   - The runtime SA is already the trust boundary for portal-owned
#     secrets (database_url, gip_api_key, introspect, broker_signing).
#     Granting admin scoped to the broker-signing-key prefix via the
#     condition below is consistent with that boundary.
#
# The condition narrows ACCESS/ADD/DISABLE to portal-broker-signing-key-*
# while leaving CREATE unconstrained at the project level. CREATE attempts
# for any other secret would still succeed under this binding — that is
# the practical ceiling of IAM-conditioned admin on Secret Manager.
# A tighter custom role can replace this in a follow-up if/when audit
# requires it; out of scope for T1.

resource "google_project_iam_member" "portal_broker_signing_keys_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.portal_runtime.email}"

  condition {
    title       = "Only portal-broker-signing-key-* secrets"
    description = "Limits ACCESS / ADD / DISABLE to portal broker signing-key secrets. CREATE is at project scope and cannot be filtered by name (see iam-signing-keys.tf header)."
    expression  = <<-EOT
      resource.type != "secretmanager.googleapis.com/Secret"
      || resource.name.startsWith("projects/${var.project_id}/secrets/portal-broker-signing-key-")
      || resource.name.startsWith("projects/${data.google_project.current.number}/secrets/portal-broker-signing-key-")
    EOT
  }
}
