# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# apps/heroes-web/cloudbuild.yaml for the invocation.
#
# Heroes-web uses svelte-adapter-bun; build/ ships a Bun-native server
# entry that exposes `httpserver` via build/index.js.

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
RUN bun run --filter @coms-portal/heroes-web build

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Heroes Web" \
      org.opencontainers.image.description="SvelteKit SSR on Bun — heroes app shell"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/heroes-web/build apps/heroes-web/build
COPY --from=builder /app/apps/heroes-web/package.json apps/heroes-web/package.json
COPY --from=builder /app/packages/heroes-shared packages/heroes-shared
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/heroes-web/build/index.js"]
