# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/heroes-web/cloudbuild.yaml for the invocation.
#
# Heroes-web uses svelte-adapter-bun; build/ ships a Bun-native server entry
# that exposes `httpserver` via build/index.js. SSR + workspace deps are
# inlined by adapter-bun, so the runtime image carries only the build/
# artifact and a production-filtered node_modules tree (not the hoisted
# dev install).

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
# heroes-web type-checks against @coms-portal/heroes-api source.
COPY apps/heroes-api apps/heroes-api
COPY apps/heroes-web apps/heroes-web
COPY packages/heroes-shared packages/heroes-shared
COPY packages/sdk packages/sdk
COPY packages/shared packages/shared
COPY packages/design-tokens packages/design-tokens
COPY packages/ui-svelte packages/ui-svelte
COPY packages/account-widget-svelte packages/account-widget-svelte
RUN bun run --filter @coms-portal/heroes-shared build
RUN NODE_ENV=production bun run --filter @coms-portal/heroes-web build

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
RUN bun install --production --frozen-lockfile --filter @coms-portal/heroes-web

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Heroes Web" \
      org.opencontainers.image.description="SvelteKit SSR on Bun — heroes app shell"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=deps-prod /app/apps/heroes-web/node_modules apps/heroes-web/node_modules
COPY --from=builder /app/apps/heroes-web/build apps/heroes-web/build
COPY --from=builder /app/apps/heroes-web/package.json apps/heroes-web/package.json
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/heroes-web/build/index.js"]
