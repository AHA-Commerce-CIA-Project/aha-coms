<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# cloud-sql

## Purpose
Provisions a PostgreSQL 18 Cloud SQL instance with two databases (production and staging), an auto-generated 32-character password, automated backups with PITR, query insights, and Secret Manager secrets for connection strings. Designed for safe multi-environment use from a single instance.

## Key Files
| File | Description |
|------|-------------|
| `main.tf` | 140 lines. Creates: `random_password` (32 chars); Postgres 18 `db-f1-micro` ENTERPRISE tier; public IP with Cloud SQL Auth Proxy-only access (no direct IP); daily backups at 18:00 UTC with PITR enabled, 7 backups retained; query insights enabled; `max_connections=40`; two databases (`production`, `staging`); 4 Secret Manager secrets: DB URLs for both databases, DB user, DB password; `deletion_protection=true` |
| `variables.tf` | Input variables: `project_id`, `region`, `db_user`, `db_tier` |
| `outputs.tf` | Exposes `instance_connection_name`, secret IDs for DB URLs |

## Subdirectories (if any)
_None_

## For AI Agents

### Working In This Directory
- `deletion_protection=true` is set on the Cloud SQL instance — you must set it to `false` via `tofu apply` before destroying, then restore it. Never leave it as `false` in committed code.
- `max_connections=40` matches the `db-f1-micro` tier's RAM limits. If upgrading the tier, increase this value proportionally.
- The instance uses Auth Proxy-only access — no public IP connections. Applications must connect via the Cloud SQL Auth Proxy (sidecar in Cloud Run or `cloud-sql-proxy` binary for local dev).
- Both `production` and `staging` databases exist on the same instance. They share the same user and password — isolation is at the database level only.
- Secret Manager secrets for DB URLs follow the pattern `DATABASE_URL_<ENV>`. These are referenced by Cloud Run and the deploy workflow.

### Common Patterns
- Local development connects via: `cloud-sql-proxy --port 5432 {instance_connection_name}`
- DB migrations run in CI via the Cloud SQL Auth Proxy before each Cloud Run deploy (see `.github/workflows/deploy.yml`).
- PITR retention is 7 days — point-in-time recovery is available within that window via GCP console.

## Dependencies

### Internal
- `instance_connection_name` output consumed by `cloud-run/` for the Cloud SQL socket mount
- Secret Manager secret IDs consumed by `cloud-run/` IAM bindings

### External
- GCP APIs: Cloud SQL Admin, Secret Manager, IAM
- `hashicorp/google ~>7.0`, `hashicorp/random ~>3.0` providers

<!-- MANUAL: Never change deletion_protection to false in committed code. Set manually before destroy operations only. -->
