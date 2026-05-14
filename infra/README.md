# `infra/` — OpenTofu runbook

This is the laptop-CLI runbook for applying infrastructure changes against the
COMS portal's shared OpenTofu state. **Apply is deliberately not automated.**

Why not: the infra owns one shared GCP project, one Cloud SQL instance with
prod data, the IAM that gates production secrets, and the WIF pool that
authenticates every deploy SA. A bad code deploy rolls back by re-deploying
the previous SHA; a bad `tofu apply` that triggers Cloud SQL recreation,
secret deletion, or IAM rotation has no equivalent. Auto-apply is a footgun
for a project this size; the workflow_dispatch shape was judged ceremony
without material safety wins for a two-operator team. See FU-4 in
`tasks/todo.md` for the recorded position and the future upgrade path.

## Layout

```
infra/                  ← portal state (this directory)
  *.tf                  ← portal resources
  terraform.tfvars      ← portal var-file
infra/heroes/           ← heroes substate (separate state bucket)
  *.tf                  ← heroes resources
  (no .tfvars — required vars passed at the CLI)
```

The two states are **independent on purpose** (standing-principle 3: app-side
Tofu state stays self-contained). They share the GCS state-bucket project but
not the state file; you `cd` between them when working on each.

## Prerequisites

| Tool | How |
|---|---|
| `gcloud` | `gcloud auth login` then `gcloud config set project fbi-dev-484410` |
| `tofu` | `brew install opentofu` (CI pins `1.11.6` in `.github/workflows/infra-plan.yml` — keep your local version in step) |
| `cloud-sql-proxy` | `gcloud components install cloud-sql-proxy` or download from `https://cloud.google.com/sql/docs/postgres/sql-proxy` (only needed when applying alongside a DB migration) |
| GCP IAM | the human applying needs `roles/editor` or equivalent on `fbi-dev-484410`, plus `roles/storage.objectAdmin` on the state bucket |

State bucket: `gs://coms-portal-tofu-state/terraform/state/` (portal),
`gs://coms-aha-heroes-tfstate/tofu/state/` (heroes).

## Variables

`infra/terraform.tfvars` carries **every** stable value the apply needs —
project id, region, Cloud SQL instance name, Firebase config, sheets ids,
the deployed service URL, the bootstrap admin identity, and the mail-transport
shape. FU-21's drift-cleanup pass (2026-05-14) lifted five values that the
original README declared "deliberately not in tfvars" into the file, because
the prior pattern was the root cause of two production-bug-in-waiting drifts:
portal-api's SERVICE_URL env var flipping to `https://placeholder` on any
apply where the placeholder var was passed, and the brevo-secret IAM grant
being destroyed when `mail_transport` defaulted back to `"stdout"`. The
tfvars file is the single source of truth; no laptop `-var` flag is required
for any apply that doesn't touch Cloud Run wiring.

The only operator-passed var that remains for portal applies is when the
operator deliberately wants to override a tfvars value for a one-off (e.g.,
testing the `mail_transport = "stdout"` shape locally before a destructive
flip). In that case, pass the override at the CLI as a normal `-var`.

```bash
# Routine portal apply — tfvars covers everything.
tofu plan -var-file=terraform.tfvars
tofu apply -var-file=terraform.tfvars

# Override (rare): test the stdout transport without changing tfvars.
tofu plan -var-file=terraform.tfvars -var mail_transport=stdout
```

`infra/heroes/` carries a committed `terraform.tfvars` with the Google
Sheet IDs the sheet-sync service reads (per FU-9: sheet IDs are not
secret enough to warrant Secret Manager, but they are environment-
specific enough that an empty default silently dropped them on every
apply — Tofu validation now forces them to be set). The one remaining
operator-passed var is `alert_email`:

```bash
cd infra/heroes
tofu plan -var alert_email=ops@ahacommerce.net
```

If you ever clone the repo onto a fresh laptop, confirm `infra/heroes/
terraform.tfvars` exists before applying — `tofu plan` will fail loudly
on the variable validation, but the failure is louder if you read this
first.

## Normal apply

The discipline is read the plan, then apply. Never `-auto-approve` on a full
apply against shared state.

```bash
cd infra
tofu init -upgrade               # only on first run or after provider bumps
tofu plan -var-file=terraform.tfvars \
  -var service_url=https://placeholder \
  -var bootstrap_admin_email=placeholder@example.com \
  -var bootstrap_admin_name=placeholder

# read the plan output. Confirm:
#   - resource counts match what you expect
#   - "destroy" lines are intentional
#   - no resource you didn't touch shows drift you don't recognize
# if any of those fail the check, stop and investigate before applying

tofu apply -var-file=terraform.tfvars \
  -var service_url=https://placeholder \
  -var bootstrap_admin_email=placeholder@example.com \
  -var bootstrap_admin_name=placeholder
# interactive prompt — type `yes` after re-reading the plan summary
```

The interactive prompt is the safety net. The same plan output is shown twice
(once on `plan`, once before `apply`) precisely so you read it twice.

## Targeted apply

When you know exactly which resource is changing — single IAM binding,
single config tweak — `-target=` is the cleaner shape. The 2026-05-12
session for FU-2 is the canonical example:

```bash
tofu apply -var-file=terraform.tfvars \
  -var service_url=https://placeholder \
  -var bootstrap_admin_email=placeholder@example.com \
  -var bootstrap_admin_name=placeholder \
  -target=google_secret_manager_secret_iam_member.cloud_build_gip_api_key \
  -auto-approve
```

`-target=` narrows the plan to one resource graph slice; `-auto-approve` is
acceptable on a targeted apply because the plan is small enough to verify
by sight. Don't combine `-auto-approve` with an untargeted apply against
shared state — that's the footgun this runbook is here to prevent.

## Stale-lock recovery

OpenTofu acquires a lock on the GCS state when `plan` or `apply` starts. If
the process dies before releasing — laptop sleep, rejected tool call, `Ctrl-C`
during apply, runner kill — the lock is left in place and the next operator
sees:

```
Error: Error acquiring the state lock
Lock Info:
  ID:        1778571978311920
  Path:      gs://coms-portal-tofu-state/terraform/state/default.tflock
  Operation: OperationTypePlan
  Who:       mac@macs-MacBook-Air-4.local
  Version:   1.11.6
  Created:   2026-05-12 07:46:18 +0000 UTC
```

**Read the `Who` and `Created` fields before unlocking.** Confirm:

- The `Who` matches your session (your hostname, your laptop), AND
- The `Created` timestamp is older than any apply you'd remember running

If either check fails — different hostname, recent timestamp — **stop and
ask the other operator**. Force-unlocking an apply that's actually running
mid-flight corrupts state. The lock exists for a reason.

When you're certain it's yours and stale:

```bash
tofu force-unlock -force <LOCK_ID>
```

`-force` skips the interactive prompt; the explicit `<LOCK_ID>` is the
safety check (you typed the id, so you saw it).

## Heroes substate

Same workflow, different directory + state bucket:

```bash
cd infra/heroes
tofu init -upgrade
tofu plan -var alert_email=ops@ahacommerce.net
tofu apply -var alert_email=ops@ahacommerce.net
```

The heroes state is a separate file in a separate bucket (`coms-aha-heroes-tfstate`).
That separation is intentional (standing-principle 3 in `tasks/plan.md`): app
states stay self-contained so a bad heroes apply cannot reach portal resources
and vice versa.

## What NOT to do

- **Never** `-auto-approve` an untargeted apply against shared state. The
  interactive prompt is doing real work.
- **Never** `force-unlock` without verifying `Who` and `Created` match a
  session you remember. Corrupting state because the other operator's apply
  was actually in flight has no clean recovery.
- **Never** `terraform import` to "fix" drift without first understanding why
  the drift exists. Imports lie to the state file; reconciling later is
  worse than the original drift.
- **Never** edit the state file directly (`tofu state push`, `gsutil cp` to
  the bucket). The state file is the source of truth for what exists in GCP;
  editing it manually is how you end up with two resources pointing at the
  same GCP id.
- **Never** apply infra changes whose PR hasn't been reviewed via
  `infra-plan.yml`. The PR plan is the same plan you're about to apply, and
  having a second pair of eyes on it is the only review step this process
  has. If you're tempted to apply something the PR doesn't show, push the
  change to a PR first.

## Reopening FU-4 (the upgrade path)

This runbook exists because workflow_dispatch apply was judged ceremony for
a two-operator project. If any of:

- the team grows past three operators,
- an audit-driven post-mortem requires retroactive "who applied what when",
- operator-mistake rate exceeds one mishap per quarter, or
- the GCP footprint grows enough to change the blast-radius math,

reopen FU-4 in `tasks/todo.md` and implement the workflow_dispatch shape
preserved in that entry's "Future upgrade path" section. The implementation
is small (one workflow file, WIF binding adjustments); this README and the
position recorded in FU-4 are what keep the upgrade clean.
