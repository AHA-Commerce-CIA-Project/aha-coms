<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# github-wif

## Purpose
Provisions Workload Identity Federation (WIF) for keyless GitHub Actions authentication to GCP. Eliminates long-lived service account keys by allowing GitHub Actions workflows in `mrdoorba/coms-aha-heroes` to authenticate directly via OIDC tokens.

## Key Files
| File | Description |
|------|-------------|
| `main.tf` | 82 lines. Creates: WIF pool and OIDC provider locked to `mrdoorba/coms-aha-heroes` repository; deployer SA `coms-aha-heroes-deployer-sa` with roles: `run.admin`, `artifactregistry.writer`, `cloudsql.client`, `secretmanager.secretAccessor`, `iam.serviceAccountUser`; WIF principal binding that allows the GitHub Actions OIDC token to impersonate the deployer SA |
| `variables.tf` | Input variables: `project_id`, `github_org`, `github_repo` |
| `outputs.tf` | Exposes `provider_name` (WIF provider resource name) and `deployer_service_account_email` |

## Subdirectories (if any)
_None_

## For AI Agents

### Working In This Directory
- The WIF provider is locked to `mrdoorba/coms-aha-heroes` via the attribute condition. If the repository is renamed or transferred, update `variables.tf` values in `terraform.tfvars` and re-apply.
- The deployer SA has `secretmanager.secretAccessor` to read secrets during deployment (e.g., to pass DATABASE_URL to `gcloud run deploy`). It does **not** have permission to create or delete secrets — that is reserved for the root Terraform apply.
- `iam.serviceAccountUser` on the deployer SA allows it to act as the runtime SA when deploying Cloud Run — required by `gcloud run deploy --service-account`.
- No service account keys are ever created by this module. Authentication is entirely via short-lived OIDC tokens.

### Common Patterns
- CI/CD workflow authenticates using: `google-github-actions/auth` action with `workload_identity_provider` and `service_account` outputs from this module.
- The `provider_name` and `deployer_service_account_email` outputs are referenced in `.github/workflows/deploy.yml` as repository secrets or workflow inputs.

## Dependencies

### Internal
- `deployer_service_account_email` output consumed by `infra/outputs.tf` for reference in CI/CD setup
- Deployer SA needs `iam.serviceAccountUser` on the runtime SA created in `cloud-run/`

### External
- GCP APIs: IAM, IAM Credentials (for WIF)
- `hashicorp/google ~>7.0` provider

<!-- MANUAL: Update github_org/github_repo variables if the repository is renamed or transferred. -->
