# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/heroes-api/cloudbuild.yaml for the invocation.
#
# Four stages:
#   deps-dev  : full workspace install — feeds the builder
#   builder   : `bun build --target bun --minify` → dist/index.js (bundle
#               inlines @coms-portal/heroes-shared + sdk + shared)
#   deps-prod : `bun install --production --filter` → only prod deps for this workspace
#   runtime   : ships dist/ + prod node_modules only. No source for
#               packages/heroes-shared (it's inlined into dist).

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
COPY apps/heroes-api apps/heroes-api
COPY apps/heroes-web apps/heroes-web
COPY packages/heroes-shared packages/heroes-shared
COPY packages/sdk packages/sdk
COPY packages/shared packages/shared
RUN bun run --filter @coms-portal/heroes-shared build
RUN NODE_ENV=production bun build apps/heroes-api/src/index.ts \
      --outdir apps/heroes-api/dist \
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
RUN bun install --production --frozen-lockfile --filter @coms-portal/heroes-api

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Heroes API" \
      org.opencontainers.image.description="Elysia + Bun — heroes recognition platform API"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=deps-prod /app/apps/heroes-api/node_modules apps/heroes-api/node_modules
COPY --from=builder /app/apps/heroes-api/dist apps/heroes-api/dist
COPY --from=builder /app/apps/heroes-api/package.json apps/heroes-api/package.json
COPY --from=builder /app/apps/heroes-api/drizzle.config.ts apps/heroes-api/drizzle.config.ts
COPY package.json ./
EXPOSE 8080
USER bun
CMD ["bun", "apps/heroes-api/dist/index.js"]
