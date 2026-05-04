# Cutover Migrations — Rev 3 Spec 03

This directory contains gated migrations that are **NOT** applied by `bun run db:migrate`.

The standard Drizzle migrator reads only `meta/_journal.json` and applies `.sql` files listed there.
Files in this `cutover/` directory have no journal entry, so `db:migrate` will never touch them.
This is by design: they are applied manually at specific cutover deploy steps.

---

## 0001_revoke_heroes_writes.sql — Deploy C
## 0002_restore_heroes_writes.sql — Rollback companion (Spec 07/08)

If Deploy C lands and Heroes regresses (e.g. an unexpected legacy code path tries to INSERT into
`identity_users`/`user_aliases`/`app_user_config`/`app_manifests`), apply
`0002_restore_heroes_writes.sql` to restore write privileges on the four tables. Identical SQL to
the rollback section below, just lifted into a checked-in file so the cutover team can run it
without copy/paste:

```bash
psql "host=127.0.0.1 port=5432 dbname=coms_portal user=postgres" \
  -f apps/api/src/db/migrations/cutover/0002_restore_heroes_writes.sql
```

Has no `meta/_journal.json` entry — `db:migrate` will never apply it. Re-running is idempotent
(GRANT is a no-op when privileges are already present).

---

## 0001_revoke_heroes_writes.sql — Deploy C (original entry)

### What it does

Revokes INSERT, UPDATE, DELETE on `identity_users`, `user_aliases`, `app_user_config`, and
`app_manifests` from `heroes_app_role`. After this runs, Heroes' service account becomes
read-only on those tables; the portal is the sole writer.

### When to apply

**Deploy C** of the Rev 3 Spec 03 cutover sequence — after:
1. The portal has re-provisioned all active users via wipe-and-reprovision (so `user_aliases`
   is fully seeded from portal-side data).
2. Heroes has confirmed it reads identity via `resolve-batch` and no longer writes directly.
3. Staging smoke test (see Verify step below) has passed.

### How to apply

Run as the `postgres` superuser (or an account that can REVOKE from roles) against the Cloud SQL
instance via the Cloud SQL Auth Proxy:

```bash
# Start the auth proxy (replace PROJECT/REGION/INSTANCE as needed)
cloud_sql_proxy -instances=PROJECT:REGION:INSTANCE=tcp:5432 &

# Apply in a single transaction
psql "host=127.0.0.1 port=5432 dbname=coms_portal user=postgres" <<'SQL'
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON "identity_users"  FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON "user_aliases"    FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON "app_user_config" FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON "app_manifests"   FROM heroes_app_role;
COMMIT;
SQL
```

### How to verify

After applying, confirm Heroes' service-account role cannot write to any of the four tables:

```bash
psql "host=127.0.0.1 port=5432 dbname=coms_portal user=postgres" <<'SQL'
SET ROLE heroes_app_role;
-- Each of these must fail with: ERROR: permission denied for table ...
INSERT INTO identity_users (email, name) VALUES ('test@example.com', 'Test') RETURNING id;
SQL
```

You can also check the privilege table:

```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'heroes_app_role'
  AND table_name IN ('identity_users', 'user_aliases', 'app_user_config', 'app_manifests');
-- Should return zero rows for INSERT/UPDATE/DELETE after REVOKE.
```

### How to roll back

If Heroes is still writing and the REVOKE caused breakage, restore privileges immediately:

```bash
psql "host=127.0.0.1 port=5432 dbname=coms_portal user=postgres" <<'SQL'
BEGIN;
GRANT INSERT, UPDATE, DELETE ON "identity_users"  TO heroes_app_role;
GRANT INSERT, UPDATE, DELETE ON "user_aliases"    TO heroes_app_role;
GRANT INSERT, UPDATE, DELETE ON "app_user_config" TO heroes_app_role;
GRANT INSERT, UPDATE, DELETE ON "app_manifests"   TO heroes_app_role;
COMMIT;
SQL
```

Then re-schedule cutover Deploy C after resolving the Heroes-side dependency.
