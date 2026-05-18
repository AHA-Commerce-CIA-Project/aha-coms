# infra/heroes/terraform.tfvars
#
# Committed environment-specific values that aren't secret enough to warrant
# Secret Manager but are environment-specific enough that variables.tf
# defaults can't carry them. Sheet IDs identify the canonical spreadsheets
# the sheet-sync service reads — anyone with access to the sheets has these
# IDs in the browser URL, so committing them in IaC is no leakier than the
# Google Drive sharing model already is.
#
# Tab names are intentionally NOT set here. The app's buildConfigFromEnv()
# at apps/heroes-api/src/services/sheet-sync-scheduler.ts falls back to
# the canonical tab names already; setting them here would create a second
# source of truth that drifts. If a tab gets renamed in the spreadsheet,
# update the app defaults in one place.
#
# `alert_email` is the recipient on the GCP monitoring notification
# channel that fans out Cloud Run 5xx alerts. One ops inbox covers the
# suite — neither secret nor environment-specific — so it lives here
# now instead of behind a `-var alert_email=...` CLI flag.

sheet_id_points    = "1o_IdMKKO5BMbP_jhqPDcOie73KxSEt8AsT6XQ6dsWNU"
sheet_id_employees = "1RS798qnTYwk8usogqjBaeYUTKQJMsONm4p1Cik92HYM"
alert_email        = "handers.the@ahacommerce.net"
