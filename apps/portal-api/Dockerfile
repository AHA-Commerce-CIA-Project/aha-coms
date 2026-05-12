# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/portal-api/cloudbuild.yaml for the invocation.
#
# Three stages: deps (cacheable bun install), builder (bundle), runtime
# (slim image with just dist/ + node_modules). server.ts imports the
# Elysia app from src/index.ts only — no SvelteKit handler bridging.

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/portal-api/package.json apps/portal-api/
COPY apps/portal-web/package.json apps/portal-web/
COPY apps/heroes-api/package.json apps/heroes-api/
COPY apps/heroes-web/package.json apps/heroes-web/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/ui-svelte/package.json packages/ui-svelte/
COPY packages/ui-react/package.json packages/ui-react/
COPY packages/account-widget-svelte/package.json packages/account-widget-svelte/
COPY packages/account-widget-react/package.json packages/account-widget-react/
COPY packages/heroes-shared/package.json packages/heroes-shared/
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Bun's isolated install puts third-party deps under per-workspace node_modules.
# Copy every per-workspace node_modules tree so the builder can resolve all imports.
COPY --from=deps /app/apps apps/
COPY --from=deps /app/packages packages/
COPY tsconfig.base.json ./
COPY apps/portal-api apps/portal-api
COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
RUN NODE_ENV=production bun run --filter @coms-portal/portal-api build

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Portal API" \
      org.opencontainers.image.description="Elysia + Bun — identity, app registry, webhook delivery"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/portal-api/dist apps/portal-api/dist
COPY --from=builder /app/apps/portal-api/package.json apps/portal-api/package.json
COPY --from=builder /app/apps/portal-api/src/db/migrations apps/portal-api/src/db/migrations
COPY --from=builder /app/apps/portal-api/scripts apps/portal-api/scripts
COPY --from=builder /app/apps/portal-api/drizzle.config.ts apps/portal-api/drizzle.config.ts
COPY --from=builder /app/packages/shared packages/shared
COPY --from=builder /app/packages/sdk packages/sdk
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/portal-api/dist/server.js"]
