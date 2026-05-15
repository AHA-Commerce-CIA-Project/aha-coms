project_id                = "fbi-dev-484410"
region                    = "asia-southeast2"
cloud_sql_instance        = "coms-aha-heroes-db"
domain                    = "coms.ahacommerce.net"
github_repo               = "AHA-Commerce-CIA-Project/aha-coms"
gip_project_id            = "fbi-dev-484410"
gip_auth_domain           = "fbi-dev-484410.firebaseapp.com"
coms_domain               = "coms.ahacommerce.net"
session_cookie_max_age    = "1209600"
sheets_personal_email_id  = "1RS798qnTYwk8usogqjBaeYUTKQJMsONm4p1Cik92HYM"
sheets_personal_email_tab = "HEROES - Fulltime Staff"

# Stable runtime values lifted into tfvars during FU-21's drift-cleanup pass
# 2026-05-14. The README previously named these three (service_url +
# bootstrap_admin_*) as "deliberately not in tfvars" + "supplied at the CLI"
# on the model that the Cloud Run service URL was only known post-first-deploy.
# That model is outdated: T80's first apply landed long ago, the URL is now
# stable, and every apply that DIDN'T pass these values has either drifted
# the live env vars (FU-20's portal-api SERVICE_URL placeholder leak) or
# destroyed an active resource (the portal_runtime_brevo_api_key count=0
# destroy when mail_transport defaulted back to stdout). Lifted into tfvars
# now so every apply converges against the live runtime shape; the README's
# "pass at the CLI" section is rewritten accordingly.
service_url           = "https://coms-portal-api-45tyczfska-et.a.run.app"
mail_transport        = "brevo"
brevo_from            = "handers.the@ahacommerce.net"
bootstrap_admin_email = "handers.the@ahacommerce.net"
bootstrap_admin_name  = "Mr. Door"
