-- Backfill app_user_config for all active identity_users using Heroes manifest defaults.
-- Idempotent: ON CONFLICT DO NOTHING skips rows that already exist.
INSERT INTO app_user_config (id, portal_sub, app_id, config, schema_version, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  m.app_id,
  m.config_schema_defaults,
  m.schema_version,
  now()
FROM identity_users u
CROSS JOIN (
  SELECT
    app_id,
    schema_version,
    -- Compute default values by extracting the "default" key from each configSchema field.
    -- This produces a JSON object like: {"role":"member","leaderboard_eligible":true,"starting_points":0}
    (
      SELECT jsonb_object_agg(key, value->'default')
      FROM jsonb_each(config_schema)
    ) AS config_schema_defaults
  FROM app_manifests
) m
WHERE u.status = 'active'
ON CONFLICT (portal_sub, app_id) DO NOTHING;
