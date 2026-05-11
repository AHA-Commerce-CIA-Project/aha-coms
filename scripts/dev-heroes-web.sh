#!/usr/bin/env bash
# Source heroes' .env before invoking vite dev for heroes-web.
#
# Bun's `--filter` cwd-switch happens AFTER bun has loaded its own .env from
# the monorepo root, so apps/heroes-web/.env (a symlink to
# apps/heroes-api/.env) never reaches the vite-dev child process.
# packages/heroes-shared/src/db/index.ts reads `process.env.DATABASE_URL`
# directly during heroes-web's SSR, so without this wrapper the dev server
# crashes on first authed-route page load.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f apps/heroes-api/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . apps/heroes-api/.env
  set +a
fi

exec bun run --filter @coms-portal/heroes-web dev
