# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/heroes-api/cloudbuild.yaml for the invocation.
#
# Replaces heroes' standalone-repo Dockerfile (which COPY'd from the
# pre-restructure packages/{server,web,shared} layout).

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
# Bun's isolated install puts third-party deps under per-workspace node_modules
# (e.g. elysia lives under apps/heroes-api/node_modules, not the hoisted root).
# Copy every per-workspace node_modules tree so the builder can resolve all imports.
COPY --from=deps /app/apps apps/
COPY --from=deps /app/packages packages/
COPY tsconfig.base.json ./
COPY apps/heroes-api apps/heroes-api
COPY apps/heroes-web apps/heroes-web
COPY packages/heroes-shared packages/heroes-shared
COPY packages/sdk packages/sdk
COPY packages/shared packages/shared
RUN bun run --filter @coms-portal/heroes-shared build
RUN NODE_ENV=production bun run --filter @coms-portal/heroes-api build

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Heroes API" \
      org.opencontainers.image.description="Elysia + Bun — heroes recognition platform API"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/heroes-api/dist apps/heroes-api/dist
COPY --from=builder /app/apps/heroes-api/package.json apps/heroes-api/package.json
COPY --from=builder /app/apps/heroes-api/drizzle.config.ts apps/heroes-api/drizzle.config.ts
COPY --from=builder /app/packages/heroes-shared packages/heroes-shared
COPY package.json ./
EXPOSE 8080
USER bun
CMD ["bun", "apps/heroes-api/dist/index.js"]
