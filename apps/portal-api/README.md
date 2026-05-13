# portal-api

Elysia + Bun service. The portal API — auth, OIDC issuer, app registry,
admin endpoints, webhooks, taxonomies, aliases.

## Running locally

```bash
bun run --filter @coms-portal/portal-api dev
```

Watches `server.ts` and restarts on change. Reads from
`~/.aha-coms/portal-api.env` (or the env vars listed in `src/config.ts`).

## Tests — the one thing to read before running them

**Run tests with `bun run test`, not bare `bun test`.**

The canonical invocation is:

```bash
bun run --filter @coms-portal/portal-api test
# or, from monorepo root:
bun run test
```

Both delegate to this package's `test` script, which fans out via
`xargs -P 4` and runs each `.test.ts` file in its own bun process.
Result: 575 pass / 0 fail across 63 files. CI runs this exact path.

If you instead run `bun test` (no `run`), bun's runner loads every test
file into a single process. Bun's `mock.module()` is process-global —
the first file to import the real `src/index.ts` (see
`src/__tests__/route-compose.test.ts`) poisons the module cache for
every subsequent file's `mock.module(...)` call. Mocks silently no-op,
real auth/db modules load, and ~196 tests fail with 401s and 500s that
look like genuine regressions. They are not. Every one of them passes
in the isolated invocation.

For the canonical pattern + history see
`src/test-helpers/schema-barrel-mock.ts` and `.codebase-memory/adr.md`
§7. The root `bunfig.toml` carries the same warning.

## Migrations

```bash
bun run --filter @coms-portal/portal-api db:generate   # author migration
bun run --filter @coms-portal/portal-api db:migrate    # apply against DB
bun run --filter @coms-portal/portal-api db:studio     # drizzle studio
```

`deploy-portal-api.yml` runs `db:migrate` automatically before building
the image, via cloud-sql-proxy + the prod URL secret. Destructive
migrations (`DROP COLUMN`, `DROP TABLE`) need the deploy-first /
migrate-after ordering instead — see the workflow comment for the
constraint.
