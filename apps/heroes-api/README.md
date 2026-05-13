# heroes-api

Elysia + Bun service. The heroes backend — gamification state (points,
rank, leaderboard), admin endpoints, sheet-sync ingestion, and the
consumer side of portal-emitted webhooks. Mounted at `/heroes/api/*`
on the shared COMS origin.

## Running locally

```bash
bun run dev:heroes-api
```

Watches `src/index.ts` and restarts on change. Reads from
`apps/heroes-api/.env` (which heroes-web symlinks against — see
`scripts/dev-heroes-web.sh` for why the env-loading order matters).

## Architecture in one paragraph

Elysia router wrapped in `new Elysia({ prefix: '/heroes' })`
(`src/index.ts`) — every route lands at `/heroes/api/*` to match
Firebase Hosting's preserve-path rewrite. The auth middleware
(`src/middleware/auth.ts`) calls `loadHeroesAuthUser` from
`@coms-portal/heroes-shared/auth` to derive the request's
`AuthUser` from the portal `__session` cookie; the same function
also drives heroes-web's SSR auth. The DB layer is Drizzle against
postgres, schema in `packages/heroes-shared/src/db/schema/`. The
heroes-api package also exports `./services/*` and `./repositories/*`
subpaths so heroes-web's `+page.server.ts` files can import services
directly (T47 Finding 1 — same-origin `event.fetch` to the API is
the wrong shape; direct service import is the canonical pattern).

## The auth flow

See [`apps/heroes-web/README.md`](../heroes-web/README.md) for the
full narrative. Short version: heroes-api never mints sessions, never
holds credentials, and has no session table. Every authenticated
request flows through `loadHeroesAuthUser` →
`GET https://aha-coms.web.app/api/userinfo` (with the `__session`
cookie attached) → `heroes_profiles` upsert + read. One auth-path
table touch per request after Phase 5 (T44–T46) retired the
`user_config_cache` JOIN.

## Migrations

```bash
bun run --filter @coms-portal/heroes-api db:generate   # author migration
bun run --filter @coms-portal/heroes-api db:migrate    # apply against DB
bun run --filter @coms-portal/heroes-api db:studio     # drizzle studio
```

`deploy-heroes-api.yml` runs `db:migrate` automatically before
building the image, via cloud-sql-proxy + the prod URL secret
`coms-aha-heroes-db-url-production` (FU-5 wired this; mirrors
portal-api's FU-3 shape, different secret name + DSN host rewrite).
Destructive migrations (`DROP COLUMN`, `DROP TABLE` — T46's
`DROP TABLE user_config_cache` is the canonical exception) need
deploy-first / migrate-after ordering instead; the workflow comment
names the constraint at the source so a future implementer authoring
a destructive change pauses.

Schema lives in `packages/heroes-shared/src/db/schema/`. The
historical `session`, `account`, `verification`, and `user_config_cache`
tables were retired by migrations `0016_drop_legacy_auth_tables.sql`
and `0018_drop_user_config_cache.sql` respectively.

## Where the surfaces live

- **Routes:** `src/routes/` — REST endpoints under `/heroes/api/v1/*`.
- **Webhook consumer:** `src/routes/webhooks/portal.ts` — handlers
  under `services/portal-events/` for `user.provisioned`,
  `user.updated`, `employment.updated`, `user.offboarded`,
  `app_config.updated`, `alias.*`, `taxonomy.*`.
- **Services:** `src/services/` — business logic (`sheet-sync`,
  `challenges`, `appeals`, etc.). Exported via the `./services/*`
  subpath in `package.json` for heroes-web's direct imports.
- **Repositories:** `src/repositories/` — DB access helpers. Exported
  via `./repositories/*`.
- **Auth middleware:** `src/middleware/auth.ts` — wraps every
  authenticated route with the `loadHeroesAuthUser` derivation.
- **Health checks:** `/heroes/api/health` + `/heroes/api/healthz` —
  the paths the Cloud Run startup probe and the uptime check hit
  directly (no Firebase rewrite). The infra wiring lives in
  `infra/heroes/cloud-run.tf` and `infra/heroes/modules/monitoring/`.

## Tests

The heroes-api test suite (81 tests at last count) runs via:

```bash
bun run --filter @coms-portal/heroes-api test
```

No equivalent of portal-api's bare-`bun test` footgun exists here yet —
heroes-api's `mock.module` usage is comparatively narrow and tests run
clean in either invocation. If that ever changes, mirror portal-api's
xargs-per-file pattern (`apps/portal-api/package.json:test`) and the
bunfig.toml documentation pass that closed [FU-7](../../tasks/todo.md).

## Pointers

- [`apps/heroes-web/README.md`](../heroes-web/README.md) — the
  user-facing app this API serves; carries the auth flow narrative
  and the integration-contract cross-reference table
- [`docs/integration-contract.md`](../../docs/integration-contract.md) —
  the binding rulebook
- [`docs/spec/02-heroes-cleanup.md`](../../docs/spec/02-heroes-cleanup.md) —
  the cleanup spec heroes executed against
