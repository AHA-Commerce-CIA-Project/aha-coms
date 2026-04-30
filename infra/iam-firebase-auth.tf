# ── Firebase Auth Admin IAM ─────────────────────────────────────────
#
# The `coms-portal-workspace-sync` SA is the credential used by the API's
# Firebase Admin SDK (createSessionCookie, setCustomUserClaims). Without
# `roles/firebaseauth.admin` on the project, those calls return 403 — and
# Identity Toolkit reports it as a misleading "Consumer suspended" error
# because the SDK pins the quota project to the Firebase project itself.
#
# The SA is provisioned out-of-band (not managed by this Terraform); we
# only bind the role here.

resource "google_project_iam_member" "workspace_sync_firebase_auth_admin" {
  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:coms-portal-workspace-sync@${var.project_id}.iam.gserviceaccount.com"
}
