<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# modules

## Purpose
Container for all Terraform child modules used by the root `infra/` configuration. Each module encapsulates a single GCP concern and exposes outputs consumed by sibling modules or the root orchestrator.

## Key Files
| File | Description |
|------|-------------|
| _(none at this level)_ | No `.tf` files live here directly — all logic is inside subdirectories |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `artifact-registry/` | Docker image registry with automated cleanup policies |
| `cloud-run/` | Core compute: Cloud Run v2 service, runtime SA, secrets, IAM bindings |
| `cloud-sql/` | PostgreSQL 18 instance, dual databases, auto-generated password, Secret Manager |
| `storage/` | Two GCS buckets — exports (lifecycle) and uploads (CORS-enabled) |
| `github-wif/` | Workload Identity Federation for keyless GitHub Actions auth |
| `monitoring/` | Uptime checks, alert policies, log retention |

## For AI Agents

### Working In This Directory
- Never add `.tf` files directly to `modules/` — all Terraform resources belong inside a named subdirectory.
- When creating a new module, create the subdirectory and add at minimum `main.tf`, `variables.tf`, and `outputs.tf`.
- Wire new modules into `infra/main.tf` by adding a `module` block and threading its outputs through `infra/outputs.tf` if callers need them.

### Common Patterns
- Every module receives `project_id` and `region` as input variables — always declare these in `variables.tf`.
- IAM follows least-privilege: deployer SA (used by CI/CD, defined in `github-wif/`) has write access to registries and Cloud Run; the runtime SA (defined in `cloud-run/`) has only the permissions needed at request time.
- Module outputs are the only cross-module communication channel — do not reach into sibling module internals.
- Resource naming convention: `coms-aha-heroes-<resource-type>` (e.g., `coms-aha-heroes-run-sa`, `coms-aha-heroes-repo`).

## Dependencies

### Internal
- All modules are instantiated by `infra/main.tf`
- `cloud-run/` depends on outputs from `cloud-sql/` (connection name) and `storage/` (bucket names)
- `monitoring/` depends on the Cloud Run service URL from `cloud-run/`

### External
- GCP APIs must be enabled: Cloud Run, Cloud SQL, Artifact Registry, Secret Manager, GCS, IAM, Monitoring

<!-- MANUAL: Keep this subdirectory list in sync when adding or removing modules. -->
