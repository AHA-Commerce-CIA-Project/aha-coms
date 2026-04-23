UPDATE app_registry
SET app_roles = '[
  {"key": "admin", "label": "Administrator", "description": "Full access including settings"},
  {"key": "hr", "label": "HR", "description": "Can manage users and view reports"},
  {"key": "leader", "label": "Team Leader", "description": "Can submit points for team members"},
  {"key": "employee", "label": "Employee", "default": true, "description": "Standard user — can view points and rewards"}
]'::jsonb,
    updated_at = now()
WHERE slug = 'heroes'
  AND status != 'deprecated';
