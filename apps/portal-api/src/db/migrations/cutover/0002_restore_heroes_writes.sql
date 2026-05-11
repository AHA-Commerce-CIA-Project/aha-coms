-- Rev 3 Spec 07/08: rollback companion to 0001_revoke_heroes_writes.sql.
-- This migration is GATED — applied manually as a rollback if Spec 08 cutover fails post-Deploy C.
-- See cutover/README.md for the runbook.

GRANT INSERT, UPDATE, DELETE ON "identity_users"  TO heroes_app_role;
GRANT INSERT, UPDATE, DELETE ON "user_aliases"    TO heroes_app_role;
GRANT INSERT, UPDATE, DELETE ON "app_user_config" TO heroes_app_role;
GRANT INSERT, UPDATE, DELETE ON "app_manifests"   TO heroes_app_role;
