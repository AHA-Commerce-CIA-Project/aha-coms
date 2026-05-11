-- Backfill: seed one user_aliases row per active identity_users
INSERT INTO "user_aliases" ("id", "identity_user_id", "alias", "is_primary", "source")
SELECT
  gen_random_uuid(),
  iu.id,
  iu.name,
  true,
  'auto_seed'
FROM "identity_users" iu
WHERE iu.status = 'active'
ON CONFLICT ("alias_normalized") DO NOTHING;
