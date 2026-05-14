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
  default     = "mrdoorba"
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

# ── Cloud SQL (existing aha-fast-db-instance) ─────────────────────────────────
#
# Per standing principle 1, fast carries its own Cloud SQL instance —
# `aha-fast-db-instance-cd5db712` was provisioned pre-merge by aha-fast's
# legacy terraform and accidentally aligns with the per-app principle.
# Renaming Cloud SQL in place is not supported (recreate + DMS migration);
# the naming wart stays as recorded in plan.md.
#
# infra/fast/ does NOT manage the DB instance itself — it references it via
# `data.google_sql_database_instance` for the connection name. The instance,
# its database, and its user remain under aha-fast's legacy terraform state
# until a future window imports them here.

variable "fast_db_instance_name" {
  description = "Name of the existing Cloud SQL instance fast connects to. References the legacy aha-fast-* instance provisioned pre-merge; not managed by this state."
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
# either created them under aha-fast's legacy provisioning or rotates them
# in a separate window (FU-15 in tasks/todo.md tracks the rotation chain).
#
# Defaults point at the existing `aha-fast-*` secrets. Override via tfvars
# if a fresh `coms-fast-*` naming sweep retires them.

variable "secret_id_db_url" {
  description = "Secret Manager secret ID holding fast's DATABASE_URL DSN. Default points at the existing aha-fast-db-url; FU-15 will rotate the DSN's embedded password in a separate operator window."
  type        = string
  default     = "aha-fast-db-url"
}

variable "secret_id_google_client_secret" {
  description = "Secret Manager secret ID holding the Google OAuth 2.0 client secret. Operator creates this secret with the live value before the first apply."
  type        = string
  default     = "aha-fast-google-client-secret"
}

variable "secret_id_resend_api_key" {
  description = "Secret Manager secret ID holding the Resend transactional email API key."
  type        = string
  default     = "aha-fast-resend-api-key"
}

variable "secret_id_apps_script_secret" {
  description = "Secret Manager secret ID holding the shared HMAC for the Apps Script email gateway."
  type        = string
  default     = "aha-fast-apps-script-secret"
}

variable "secret_id_slack_webhook_url" {
  description = "Secret Manager secret ID holding the Slack incoming-webhook URL for task escalations."
  type        = string
  default     = "aha-fast-slack-webhook-url"
}

variable "secret_id_cron_secret" {
  description = "Secret Manager secret ID holding the shared secret for /fast/api/cron endpoints."
  type        = string
  default     = "aha-fast-cron-secret"
}

variable "secret_id_webhook_hmac" {
  description = "Secret Manager secret ID holding the inbound webhook HMAC for portal-issued webhook verification. T77 will consume this once fast's webhook consumer lands."
  type        = string
  default     = "aha-fast-webhook-hmac"
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

variable "resend_notification_email" {
  description = "Reply-To / notification address for outgoing Resend mail."
  type        = string
  default     = "ops@ahacommerce.net"
}

variable "gcs_bucket_name" {
  description = "GCS bucket holding fast's uploads. The bucket itself is provisioned under aha-fast's legacy terraform — not managed by this state."
  type        = string
  default     = "aha-fast-uploads-prod"
}
