<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-05-07 -->

# artifact-registry

## Purpose
Provisions a Docker container image registry (`coms-aha-heroes-repo`) in Google Artifact Registry with an automated cleanup policy: retain only the 5 most recent image versions; everything else is deleted regardless of age.

## Key Files
| File | Description |
|------|-------------|
| `main.tf` | Creates `google_artifact_registry_repository` (DOCKER format) with two cleanup policies: KEEP the 5 most recent versions, DELETE everything else (`tag_state = "ANY"` — KEEP takes precedence) |
| `variables.tf` | Input variables: `project_id`, `region` |
| `outputs.tf` | Exposes the repository hostname for use by `cloud-run/` and CI/CD |

## Subdirectories (if any)
_None_

## For AI Agents

### Working In This Directory
- The repository name `coms-aha-heroes-repo` is referenced by the CI/CD pipeline in `.github/workflows/deploy.yml` — do not rename it without updating that workflow.
- Cleanup policies are defined inline in `main.tf`. Adjust the `keep_count` or `older_than` values if retention requirements change, but always verify the policy logic in GCP console after apply.
- This module has no dependency on other modules — it can be applied independently.

### Common Patterns
- Registry URL format: `{region}-docker.pkg.dev/{project_id}/coms-aha-heroes-repo/{image}:{tag}`
- Image push permissions are granted to the deployer SA defined in `github-wif/`, not here.

## Dependencies

### Internal
- Output (registry hostname) consumed by `infra/main.tf` and passed to `cloud-run/` and CI/CD outputs

### External
- GCP Artifact Registry API must be enabled on the project
- `hashicorp/google ~>7.0` provider

<!-- MANUAL: Update cleanup policy thresholds here if storage costs become a concern. -->
