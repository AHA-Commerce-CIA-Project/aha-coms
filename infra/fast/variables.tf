variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "fbi-dev-484410"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-southeast2"
}

variable "github_org" {
  description = "GitHub organization or user that owns the repository"
  type        = string
  default     = "AHA-Commerce-CIA-Project"
}

variable "github_repo" {
  description = "GitHub repository name. The monorepo `aha-coms` holds portal + heroes + fast; fast deploys originate from here via deploy-fast.yml."
  type        = string
  default     = "aha-coms"
}

variable "alert_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
}

variable "app_image" {
  description = "Bootstrap Docker image URI for Cloud Run — overridden by GitHub Actions at first deploy."
  type        = string
  # Placeholder to bootstrap Cloud Run before the first real image is pushed.
  # After the first successful deploy-fast.yml run, this value is irrelevant —
  # `gcloud run deploy --image=...` overrides it with the SHA-tagged image,
  # and lifecycle.ignore_changes keeps Tofu from fighting subsequent deploys.
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

# ── Cloud SQL (aha-fast-db-instance) ──────────────────────────────────────────
#
# Per standing principle 1, fast carries its own Cloud SQL instance —
# `aha-fast-db-instance-cd5db712` was provisioned pre-merge by aha-fast's
# legacy terraform and accidentally aligns with the per-app principle.
# Renaming Cloud SQL in place is not supported (recreate + DMS migration);
# the naming wart stays as recorded in plan.md.
#
# As of 2026-05-15 the instance + the `aha-fast-db` application database
# are codified in `cloud-sql.tf` and held in this state. The SQL users
# (`postgres`, `aha-fast-admin`) remain unmanaged because their passwords
# are externally rotated through Secret Manager; pulling them in would
# require declaring the password inline or wiring lifecycle ignore_changes,
# which is a separate decision recorded as a future follow-up.

variable "fast_db_instance_name" {
  description = "Name of the Cloud SQL instance fast connects to — used as the `name` attribute on `google_sql_database_instance.fast` in cloud-sql.tf and as the lookup key for legacy references elsewhere. Renaming requires instance recreation + DMS migration; the naming wart from the pre-merge `alifm17/aha-fast` provisioning carries forward."
  type        = string
  default     = "aha-fast-db-instance-cd5db712"
}

# ── Public origin + portal coordinates ─────────────────────────────────────────
#
# Post-Phase-4 (T65), fast mounts at `/fast/` of the shared Firebase Hosting
# origin. Every absolute URL below reflects that base path.

variable "fast_public_origin" {
  description = "Public origin fast is served at — exposed as NEXT_PUBLIC_APP_URL. Used for absolute URL construction (OAuth callbacks, Slack notification links, etc.). Fast's basePath supplies the `/fast` segment at request time; this carries only the origin."
  type        = string
  default     = "https://aha-coms.web.app"
}

variable "portal_origin" {
  description = "Public origin of the unified COMS suite on Firebase Hosting — fast uses this as PORTAL_ORIGIN for `/api/userinfo` lookups via the loadFastAuthUser helper. Same origin as fast since both live behind the single Firebase Hosting site."
  type        = string
  default     = "https://aha-coms.web.app"
}

variable "portal_service_account_email" {
  description = "SA email the portal Cloud Run runs as — used to verify inbound webhook Bearer tokens (Rev 2 §03) once T77 lands fast's webhook consumer."
  type        = string
  default     = "coms-portal-run-sa@fbi-dev-484410.iam.gserviceaccount.com"
}

# ── Secret IDs in Secret Manager ───────────────────────────────────────────────
#
# These are the secret resource IDs that the Cloud Run service projects into
# its container env via secret_key_ref. The actual secret values live in
# Secret Manager and are managed outside this Tofu state — the operator
# created the three load-bearing ones (db_url, google_client_secret,
# apps_script_secret) under aha-fast's legacy provisioning or via the
# Op-2 creation pass.
#
# Audit findings on the deliberately-excluded secrets (recorded so the
# next implementer doesn't re-add them by reflex):
#   • aha-fast-resend-api-key — Resend retired by FU-18 (2026-05-14).
#     The dependency, the import, the client constructor, the per-
#     function fallback paths, and the env-var template are all gone;
#     Apps Script is the sole delivery path. The Secret Manager entry
#     itself was never created in this Tofu state. No env var is owed
#     to the Cloud Run revision.
#   • aha-fast-slack-webhook-url — the /api/slack/notify route exists
#     and reads SLACK_WEBHOOK_URL but a grep across the fast tree
#     returns zero callers; FU-17 tracks the wire-or-delete decision.
#   • aha-fast-cron-secret — CRON_SECRET moved to a plaintext-via-tfvars
#     pattern below; the blast radius is small (idempotent scheduler,
#     no PII, no money flow) and the operational simplicity of an
#     apply-time variable outweighs the Secret Manager ceremony for
#     this single value.
#   • aha-fast-webhook-hmac — T77 (fast's portal webhook consumer)
#     hasn't authored yet; reintroducing the reference there keeps the
#     IaC honest about what's actually wired today.

variable "secret_id_db_url" {
  description = "Secret Manager secret ID holding fast's DATABASE_URL DSN. Default points at the existing aha-fast-db-url; FU-15 will rotate the DSN's embedded password in a separate operator window."
  type        = string
  default     = "aha-fast-db-url"
}

variable "secret_id_google_client_secret" {
  description = "Secret Manager secret ID holding the Google OAuth 2.0 client secret."
  type        = string
  default     = "aha-fast-google-client-secret"
}

variable "secret_id_apps_script_secret" {
  description = "Secret Manager secret ID holding the shared HMAC for the Apps Script email gateway. FU-18 (2026-05-14) retired the hardcoded fallback in `apps/fast/lib/email.ts:9` and rewrote the source mirror at `apps/fast/scripts/google-apps-script-email.js` to read SHARED_SECRET from Apps Script's PropertiesService. Secret state during the FU-19 (b) handoff window: v1 holds the original literal and Cloud Run is pinned to `version = \"1\"` in `cloud-run.tf` (so cold-starts stay deterministic regardless of `:latest`); v2 holds a freshly-generated candidate value but is `disabled` because the deployed Apps Script side still validates v1. The engineer closing the rotation re-enables v2 (or adds v3 with their own value), pastes the script content into the Apps Script web editor, sets the SHARED_SECRET property to the matching value, deploys a new Apps Script version, then flips Cloud Run's version pin in `cloud-run.tf` back to `\"latest\"` (or to the specific number they used) and applies."
  type        = string
  default     = "aha-fast-apps-script-secret"
}

# ── Plaintext-via-tfvars secret ────────────────────────────────────────────────
#
# CRON_SECRET is the bearer token /fast/api/cron/routine-scheduler verifies on
# inbound calls (constant-time compare; returns 503 if unset). Blast radius is
# small — the routine scheduler is idempotent per period, so a leaked secret
# only buys an attacker the ability to fire `runScheduler` manually within an
# already-scheduled window. Cloud Scheduler (or any cron) is the only intended
# consumer.
#
# Stored as a Tofu variable rather than a Secret Manager secret because
# (a) the marginal value Secret Manager provides (per-secret IAM, audit log)
# doesn't justify its operational cost for this risk profile, and
# (b) the value at apply time can be passed via terraform.tfvars (gitignored)
# or `-var`, so it never enters git history. `sensitive = true` keeps it out
# of plan output.

variable "cron_secret" {
  description = "Shared bearer token for /fast/api/cron/routine-scheduler. Operator sets this in terraform.tfvars (or via -var); a future window may lift to Cloud Scheduler OIDC if the threat model changes."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.cron_secret) >= 16
    error_message = "cron_secret must be at least 16 characters — short values defeat the constant-time compare's resistance to timing attacks."
  }
}

# ── Plaintext env defaults ─────────────────────────────────────────────────────
#
# Non-secret env values committed inline. The Google OAuth client ID + the
# Google API key are public-by-spec (visible in network panel on every OAuth
# round-trip; OAuth's security model rests on the client SECRET + redirect-URI
# allowlist, not on hiding the client ID). HR sheet ID + name are
# operational settings, not credentials.

variable "google_client_id" {
  description = "Google OAuth 2.0 client ID (public). Authorized redirect URIs are managed in Google Cloud Console — T67 registered the /fast/-prefixed URI."
  type        = string
  default     = "908739514002-liapabigk69rvtqve07rpsre8rc4vdvs.apps.googleusercontent.com"
}

variable "google_api_key" {
  description = "Google API key for browser-side Maps/Calendar/etc. calls. Public; HTTP-referrer-restricted in GCC."
  type        = string
  default     = ""
}

variable "hr_spreadsheet_id" {
  description = "Google Sheets ID for the HR employee roster fast pulls from on startup."
  type        = string
  default     = "12W1z58TleJnCBBhB6LCBPxkK8AgrH97bgHsDU6FyEH8"
}

variable "hr_sheet_name" {
  description = "Tab name within the HR spreadsheet."
  type        = string
  default     = "Sheet1"
}

variable "apps_script_email_url" {
  description = "Apps Script web-app deployment URL fast hits to send transactional email through the Workspace gateway. The /macros/s/<id>/exec form is not secret — knowing the URL doesn't bypass the HMAC check at the Apps Script side."
  type        = string
  default     = "https://script.google.com/macros/s/AKfycbyX2PKSytEoLt2bECwMq5qYi2pFUCua-8gbtQGD0xxgmhAjF1t9yciw26KqB2maJS2y/exec"
}

variable "admin_notification_email" {
  description = "Reply-To / admin-recipient address for outgoing transactional mail through the Apps Script gateway. Read by apps/fast/lib/email.ts as NOTIFICATION_EMAIL; the var name historically carried a `resend_` prefix that FU-18 dropped alongside the Resend retirement."
  type        = string
  default     = "alif.masyhur@ahacommerce.net"
}

variable "gcs_bucket_name" {
  description = "GCS bucket holding fast's uploads. The bucket itself is provisioned under aha-fast's legacy terraform (which used a `random_id` 4-byte hex suffix) — not managed by this state. T80 originally defaulted to `aha-fast-uploads-prod` on a guess; Op-4's apply surfaced the real name."
  type        = string
  default     = "aha-fast-uploads-6892fa68"
}
