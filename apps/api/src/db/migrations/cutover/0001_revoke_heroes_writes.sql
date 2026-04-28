-- Rev 3 Spec 03: Heroes service-account write lockdown.
-- This migration is GATED — applied at cutover Deploy C, not by `db:migrate`.
-- See cutover/README.md for the runbook.

REVOKE INSERT, UPDATE, DELETE ON "identity_users"  FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON "user_aliases"    FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON "app_user_config" FROM heroes_app_role;
REVOKE INSERT, UPDATE, DELETE ON "app_manifests"   FROM heroes_app_role;
