# Spec 07 Phase 0 — Cloud SQL role inventory

**Captured:** 2026-05-08 against `fbi-dev-484410:asia-southeast2:aha-fast-db-instance-cd5db712` (PG 15.17).

## Resolves spec Q3

> Phase 5B revokes write grants on better-auth tables. Does the Fast app's runtime DB role have a separate user from migration-time grants?

**Answer: NO.** Only one app-facing role (`aha-fast-admin`) exists. It is both the runtime user (referenced by the `aha-fast-db-url` Secret Manager entry) and the owner of every public table.

## Cloud SQL `users list` output

```
aha-fast-admin    BUILT_IN
postgres          BUILT_IN
```

`postgres` is the GCP-internal superuser; `aha-fast-admin` is the only app-facing role.

## DB-level role facts

- `aha-fast-admin`: `rolcreaterole=t`, `rolcreatedb=t`, `rolcanlogin=t`, member of `cloudsqlsuperuser`. Effectively a superuser-equivalent app role.
- Owner of all 38 public-schema tables: `aha-fast-admin`.
- Direct INSERT/UPDATE/DELETE/TRUNCATE grants on `public.*`: `aha-fast-admin` only (38 tables).

All other roles (`cloudsqlagent`, `cloudsqliamgroup*`, `cloudsqlimportexport`, etc.) are GCP-managed and out of scope.

## Phase 5B scope expansion (per spec § Phase 0 step 5 conditional)

Because only one role exists, Phase 5B must include a role split before it can revoke write grants on `Session`/`Account`/`Verification`. Outline:

1. `CREATE ROLE aha_fast_runtime LOGIN PASSWORD <secret>;`
2. Grant `USAGE` on `public`, plus `SELECT, INSERT, UPDATE, DELETE` on every public table EXCEPT `Session`, `Account`, `Verification` (those get `SELECT` only post-Phase-5).
3. Issue a new Cloud SQL user via `gcloud sql users create`.
4. Update Cloud Run env: replace the runtime `aha-fast-db-url` secret with one referencing `aha_fast_runtime`. Keep `aha-fast-admin` for migrations.
5. Verify Cloud Run pod can boot with the new role before flipping over.
6. Revoke write grants on the three better-auth tables for `aha_fast_runtime` only — `aha-fast-admin` retains them so the Phase 6 cleanup migration can still drop the tables.

This is sequenced AS PART of Phase 5B's PR (not a Phase 0 deliverable). Phase 0 only had to discover the gap.
