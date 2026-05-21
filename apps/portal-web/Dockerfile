# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/portal-web/cloudbuild.yaml for the invocation.
#
# Four stages:
#   deps-dev  : full workspace install — feeds the builder
#   builder   : `vite build` (svelte-adapter-bun emits build/ with inlined
#               workspace + 3p deps)
#   deps-prod : `bun install --production --filter` for just this workspace
#   runtime   : ships build/ + prod node_modules only. No more double-copy of
#               apps/portal-web/node_modules — the prod install fills it.
#
# VITE_* build args are baked into the client bundle at build time and are
# safe to expose (Firebase Identity Platform's web config is public by design).

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
ARG VITE_GIP_API_KEY
ARG VITE_GIP_AUTH_DOMAIN
ARG VITE_GIP_PROJECT_ID
ENV VITE_GIP_API_KEY=$VITE_GIP_API_KEY
ENV VITE_GIP_AUTH_DOMAIN=$VITE_GIP_AUTH_DOMAIN
ENV VITE_GIP_PROJECT_ID=$VITE_GIP_PROJECT_ID
COPY --from=deps-dev /app/node_modules ./node_modules
COPY --from=deps-dev /app/apps apps/
COPY --from=deps-dev /app/packages packages/
COPY tsconfig.base.json ./
# portal-web type-checks against @coms-portal/portal-api source — that
# package must be present so svelte-check can follow the imports.
COPY apps/portal-api apps/portal-api
COPY apps/portal-web apps/portal-web
COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY packages/design-tokens packages/design-tokens
COPY packages/ui-svelte packages/ui-svelte
COPY packages/account-widget-svelte packages/account-widget-svelte
RUN NODE_ENV=production bun run --filter @coms-portal/portal-web build

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
RUN bun install --production --frozen-lockfile --filter @coms-portal/portal-web

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Portal Web" \
      org.opencontainers.image.description="SvelteKit SSR on Bun — the portal app shell"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=deps-prod /app/apps/portal-web/node_modules apps/portal-web/node_modules
COPY --from=builder /app/apps/portal-web/build apps/portal-web/build
COPY --from=builder /app/apps/portal-web/package.json apps/portal-web/package.json
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/portal-web/build/index.js"]
