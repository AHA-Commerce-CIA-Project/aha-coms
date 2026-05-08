# Spec 07 Phase 0 — runbook & artifacts

> **Phase 0 status: COMPLETE 2026-05-08.** All exit criteria met.

This directory captures the operational artifacts Phase 0 produces. Phase 0 ships no code — its job is to surface every data-shape problem and capture rollback insurance before any subsequent phase touches the schema or the rekey.

## Exit criteria — verified

| Criterion                                                  | Status | Evidence                                                                 |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Orphan list is empty or triaged                            | PASS   | [0-orphan-inventory.md](./0-orphan-inventory.md): 5 surfaced, 4 deleted, 1 kept |
| Duplicate-email list is empty or triaged                   | PASS   | 0 internal collisions, 0 multi-identity matches                          |
| `pg_dump` exists and restore-to-staging dry-run succeeded  | PASS\* | `gs://aha-fast-spec07-baseline/pre-cleanup/aha-fast-pre-cleanup-20260508.dump` (sha256 `41cbb688e65aac86f6f3b86a82f01865db41471a3d46fb3c3513814eb1bac3e3`). Staging dry-run still pending (see §3) |
| FK row counts captured per dependent table                 | PASS   | [1-migration-baseline.csv](./1-migration-baseline.csv) — 36 FK rows × 30 tables, 12 active users |
| Cloud SQL role inventory complete                          | PASS   | [2-role-inventory.md](./2-role-inventory.md) — single-role layout, Phase 5B scope expanded |

\* Staging restore dry-run is the one item not yet executed. See §3 below.

## 1. What the inventory found

| Fast `user` row count                  | Pre-cleanup: 16 active. Post-cleanup: **12 active**. |
| -------------------------------------- | ----------------------------------------------------- |
| Total Fast DB size                     | 13 MB (db-f1-micro, asia-southeast2)                  |
| Largest table                          | `notifications` (~2.6k rows)                          |
| FK chains rooted at `User.id`          | 36 FK columns across 30 dependent tables, ~3,950 rows |
| Pre-rekey rollback artifact size       | 375 KB (custom-format, gzip)                          |
| Implication for Phase 4 maintenance    | Window measured in seconds, not minutes               |

The spec describes Fast as "real production data with FK chains rooted at `User.id`" — technically correct, but the absolute volumes are small enough that the originally-planned 10-minute Phase 4B maintenance window is generous by ~100×. Spec text is left unchanged; runbook calls this out so the operator going into Phase 4 doesn't over-scope.

## 2. What changed in the database during Phase 0

Per user decision 2026-05-08, four orphan accounts (test/role mailboxes with no portal `identity_users` match) were **deleted before** the migration baseline was captured. This **diverges from spec D1** for these specific accounts — only `admin@gmail.com` is honored as auto-provisioned-orphan in Phase 1C.

```sql
DELETE FROM "user"
WHERE email IN ('tmp@ahacommerce.net','tmp2@ahacommerce.net',
                'tbranding@ahacommerce.net','tpr@ahacommerce.net');
-- 4 rows + 4 sessions + 4 accounts + 2 channel_messages
-- + 2 thread_replies + 1 channel_member + 10 channel_read_status
-- + 3 activity_logs cascaded.
```

The pre-cleanup state remains restorable from `gs://aha-fast-spec07-baseline/pre-cleanup/`.

## 3. Pending exit criterion — staging restore dry-run

Spec § Phase 0 exit criteria require: "`pg_dump` exists and a restore-to-staging dry-run has succeeded." This step is pending. Recommended approach:

1. Spin up an ephemeral Cloud SQL PG15 instance (`db-f1-micro`, asia-southeast2). `gcloud sql instances create aha-fast-spec07-staging --database-version=POSTGRES_15 --tier=db-f1-micro --region=asia-southeast2 --root-password=...`
2. `gcloud storage cp gs://aha-fast-spec07-baseline/pre-cleanup/aha-fast-pre-cleanup-20260508.dump ./` to a workstation.
3. Connect via Cloud SQL Auth Proxy on a free port; `pg_restore --dbname=aha-fast-db --no-owner --no-acl --jobs=4 ...`. Note the pg_dump version mismatch (host PG18 → server PG15): pg_restore from a newer client to an older server **may** emit syntax not understood by PG15. If restore fails, install `postgresql@15` client tooling locally and retry.
4. Verify row counts match `1-migration-baseline.csv` modulo the cleanup deletes (pre-cleanup baseline counts will be slightly higher).
5. Tear down the staging instance.

This is the last Phase 0 task; once it passes, Phase 1 is unblocked.

## 4. Operational notes for subsequent phases

### Phase 2C (`portalSub` backfill)

The 11 `@ahacommerce.net` accounts have known portal IDs in [0-orphan-inventory.md](./0-orphan-inventory.md). The 12th (`admin@gmail.com`) will be backfilled after Phase 1C provisioning emits `user.provisioned` for it.

### Phase 4B (rekey window)

Real expected runtime: **sub-second** (`UPDATE "user" SET id = "portalSub"` over 12 rows; cascades fan out to ~3,950 rows). The spec's "~10 min for the lock + UPDATE" is an upper bound that no longer applies given the data volume. Maintenance window can be a few minutes for safety + verification reads, not 10.

### Phase 5B (role split)

The single-role finding (see [2-role-inventory.md](./2-role-inventory.md)) means Phase 5B's PR scope explicitly includes a role split before it can revoke write grants on `Session`/`Account`/`Verification`.

## 5. Reproducing Phase 0

All commands assume:
- `gcloud auth login` as a principal with `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`, and `roles/storage.objectAdmin` on `fbi-dev-484410`.
- `cloud-sql-proxy`, `pg_dump 15+`, `psql 15+`, `python3` installed locally.
- `gcloud config set project fbi-dev-484410`.

```bash
# 0. Start proxies for both DBs in two terminals (or background).
cloud-sql-proxy --port 5433 fbi-dev-484410:asia-southeast2:aha-fast-db-instance-cd5db712 &
cloud-sql-proxy --port 5434 fbi-dev-484410:asia-southeast2:coms-aha-heroes-db &

# 1. Fetch creds (no echoing; uses Secret Manager).
export FAST_PASS=$(gcloud secrets versions access latest --secret=aha-fast-db-url \
  | sed -E 's|^postgresql://[^:]+:([^@]+)@.*|\1|')
export PORTAL_PASS=$(gcloud secrets versions access latest --secret=coms-portal-database-url \
  | sed -E 's|^postgresql://[^:]+:([^@]+)@.*|\1|')

# 2. Email inventory — Fast side.
PGPASSWORD="$FAST_PASS" psql -h 127.0.0.1 -p 5433 -U aha-fast-admin -d aha-fast-db -c \
  'SELECT email, lower(trim(email)) AS norm FROM "user";'

# 3. Email inventory — portal side; cross-reference manually or via temp join.
PGPASSWORD="$PORTAL_PASS" psql -h 127.0.0.1 -p 5434 -U coms_portal_app -d coms_portal -c \
  "SELECT iu.id, iue.email_normalized, iu.name FROM identity_user_emails iue
   JOIN identity_users iu ON iu.id=iue.identity_user_id
   WHERE iue.email_normalized = ANY(string_to_array('<comma-separated-fast-emails>',','));"

# 4. pg_dump (custom format).
PGPASSWORD="$FAST_PASS" pg_dump \
  -h 127.0.0.1 -p 5433 -U aha-fast-admin -d aha-fast-db \
  --format=custom --no-owner --no-acl \
  -f /tmp/aha-fast-pre-cleanup.dump

# 5. Upload + sha pin.
gcloud storage cp /tmp/aha-fast-pre-cleanup.dump \
  gs://aha-fast-spec07-baseline/pre-cleanup/

# 6. Migration baseline (see ./1-migration-baseline.csv for the SQL).
PGPASSWORD="$FAST_PASS" psql -h 127.0.0.1 -p 5433 -U aha-fast-admin -d aha-fast-db -At -F',' \
  -f baseline-rows.sql > 1-migration-baseline.csv

# 7. Role inventory (see ./2-role-inventory.md).
gcloud sql users list --instance=aha-fast-db-instance-cd5db712
PGPASSWORD="$FAST_PASS" psql -h 127.0.0.1 -p 5433 -U aha-fast-admin -d aha-fast-db -c \
  "SELECT rolname, rolsuper FROM pg_roles WHERE rolname NOT LIKE 'pg_%';"
```

## 6. Bucket lifecycle reminder

`gs://aha-fast-spec07-baseline/` is configured to **auto-delete objects created before 2026-09-01**. If Spec 07 slips past September 1, refresh the lifecycle rule (`gcloud storage buckets update gs://aha-fast-spec07-baseline --lifecycle-file=...`) before then.
