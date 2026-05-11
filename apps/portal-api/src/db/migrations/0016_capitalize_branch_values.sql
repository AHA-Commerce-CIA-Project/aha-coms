UPDATE identity_users SET branch = initcap(branch) WHERE branch IS NOT NULL;
