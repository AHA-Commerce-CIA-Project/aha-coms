# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/portal-api/cloudbuild.yaml for the invocation.
#
# Four stages:
#   deps-dev  : full workspace install — feeds the builder
#   builder   : `bun build --target bun --minify` → dist/server.js (bundle inlines workspace + 3p deps)
#   deps-prod : `bun install --production --filter` → only the workspace's prod deps
#   runtime   : ships dist/ + prod node_modules only. NO hoisted dev tree, NO
#               unrelated workspace deps, NO source for packages/shared|sdk
#               (the bundle inlines them).

FROM oven/bun:1 AS deps-dev
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/portal-api/package.json apps/portal-api/
COPY apps/portal-web/package.json apps/portal-web/
COPY apps/heroes-api/package.json apps/heroes-api/
COPY apps/heroes-web/package.json apps/heroes-web/
COPY apps/fast/package.json apps/fast/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/ui-svelte/package.json packages/ui-svelte/
COPY packages/ui-react/package.json packages/ui-react/
COPY packages/account-widget-svelte/package.json packages/account-widget-svelte/
COPY packages/account-widget-react/package.json packages/account-widget-react/
COPY packages/heroes-shared/package.json packages/heroes-shared/
COPY packages/ui-react/examples/smoketest/package.json packages/ui-react/examples/smoketest/
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps-dev /app/node_modules ./node_modules
COPY --from=deps-dev /app/apps apps/
COPY --from=deps-dev /app/packages packages/
COPY tsconfig.base.json ./
COPY apps/portal-api apps/portal-api
COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
RUN NODE_ENV=production bun build apps/portal-api/server.ts \
      --outdir apps/portal-api/dist \
      --target bun \
      --minify \
      --sourcemap=none

FROM oven/bun:1 AS deps-prod
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/portal-api/package.json apps/portal-api/
COPY apps/portal-web/package.json apps/portal-web/
COPY apps/heroes-api/package.json apps/heroes-api/
COPY apps/heroes-web/package.json apps/heroes-web/
COPY apps/fast/package.json apps/fast/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/ui-svelte/package.json packages/ui-svelte/
COPY packages/ui-react/package.json packages/ui-react/
COPY packages/account-widget-svelte/package.json packages/account-widget-svelte/
COPY packages/account-widget-react/package.json packages/account-widget-react/
COPY packages/heroes-shared/package.json packages/heroes-shared/
COPY packages/ui-react/examples/smoketest/package.json packages/ui-react/examples/smoketest/
RUN bun install --production --frozen-lockfile --filter @coms-portal/portal-api

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Portal API" \
      org.opencontainers.image.description="Elysia + Bun — identity, app registry, webhook delivery"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=deps-prod /app/apps/portal-api/node_modules apps/portal-api/node_modules
COPY --from=builder /app/apps/portal-api/dist apps/portal-api/dist
COPY --from=builder /app/apps/portal-api/package.json apps/portal-api/package.json
COPY --from=builder /app/apps/portal-api/src/db/migrations apps/portal-api/src/db/migrations
COPY --from=builder /app/apps/portal-api/scripts apps/portal-api/scripts
COPY --from=builder /app/apps/portal-api/drizzle.config.ts apps/portal-api/drizzle.config.ts
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/portal-api/dist/server.js"]
