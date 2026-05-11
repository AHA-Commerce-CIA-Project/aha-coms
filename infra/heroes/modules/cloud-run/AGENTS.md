<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# cloud-run

## Purpose
Core compute module. Provisions the Cloud Run v2 service runtime SA (`coms-aha-heroes-run-sa`), all IAM bindings required at runtime (Cloud SQL, Secret Manager, GCS, V4 signed URL token creator), four auth secrets in Secret Manager with placeholder values, and the Cloud Run v2 service itself with production-tuned settings.

## Key Files
| File | Description |
|------|-------------|
| `main.tf` | 227 lines. Creates: runtime SA `coms-aha-heroes-run-sa`; IAM bindings for Cloud SQL client, Secret Manager accessor, GCS object admin, and `serviceAccountTokenCreator` (for V4 signed URLs); 4 Secret Manager secrets with placeholder values and `lifecycle { ignore_changes = [secret_data] }`; Cloud Run v2 service with 1 CPU / 512Mi, `cpu_idle=true`, max 2 instances, concurrency 50, health probe at `/api/healthz`, Cloud SQL Unix socket mount, public invoker `allUsers` |
| `variables.tf` | Input variables for the module |
| `outputs.tf` | Exposes `service_url` and `service_account_email` |

## Subdirectories (if any)
_None_

## For AI Agents

### Working In This Directory
- **Critical sync requirement**: When adding new environment variables or secrets to Cloud Run, update **both** `deploy-staging` and `deploy-production` job steps in `.github/workflows/deploy.yml` AND this `main.tf`. The two must stay in sync — Cloud Run env vars set via `tofu apply` are overwritten on each deploy by the workflow's `gcloud run deploy` flags.
- Secret Manager secrets use placeholder values on first creation. Real values must be set manually via GCP console or `gcloud secrets versions add` — never commit real secret values to this file.
- The `lifecycle { ignore_changes = [secret_data] }` blocks prevent Terraform from overwriting manually-set secrets on subsequent applies.
- `cpu_idle=true` means the CPU is throttled between requests — avoid CPU-bound background work in request handlers.
- Max 2 instances with concurrency 50 = max 100 concurrent requests. Adjust if load testing reveals bottlenecks.

### Common Patterns
- Health check endpoint is `/api/healthz` — ensure this route remains functional and returns 200.
- Cloud SQL is connected via Unix socket (not TCP) using the Cloud SQL Auth Proxy sidecar pattern.
- Public invoker (`allUsers` with `roles/run.invoker`) means the service is unauthenticated at the Cloud Run level — app-level auth (NextAuth) handles access control.

## Dependencies

### Internal
- Receives `cloud_sql_connection_name` from `cloud-sql/` module output
- Receives bucket names from `storage/` module output
- Output `service_url` consumed by `monitoring/` for uptime checks

### External
- GCP APIs: Cloud Run v2, Secret Manager, Cloud SQL, IAM
- `hashicorp/google ~>7.0` provider

<!-- MANUAL: Keep env vars in sync with .github/workflows/deploy.yml whenever this file changes. -->
