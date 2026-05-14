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
# Fast workspace package.json — needed so `bun install --frozen-lockfile`
# resolves the workspace declared in root package.json. The fast source +
# its Prisma schema are NOT needed here; heroes-web doesn't import from
# fast. T57 added fast to the workspaces, then the postinstall hook
# removal (alongside Op-6 retries) let unrelated builds skip fast's
# prisma generate.
COPY apps/fast/package.json apps/fast/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/ui-svelte/package.json packages/ui-svelte/
COPY packages/ui-react/package.json packages/ui-react/
COPY packages/account-widget-svelte/package.json packages/account-widget-svelte/
COPY packages/account-widget-react/package.json packages/account-widget-react/
COPY packages/heroes-shared/package.json packages/heroes-shared/
# Smoketest workspace — declared in root package.json (T51-T53 added it as
# the React chrome's stub consumer). `bun install --frozen-lockfile` fails
# workspace resolution if its package.json isn't present, even though no
# stage builds it.
COPY packages/ui-react/examples/smoketest/package.json packages/ui-react/examples/smoketest/
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Bun's isolated install puts third-party deps under per-workspace node_modules.
# Copy every per-workspace node_modules tree so the builder can resolve all imports.
COPY --from=deps /app/apps apps/
COPY --from=deps /app/packages packages/
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

FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Heroes Web" \
      org.opencontainers.image.description="SvelteKit SSR on Bun — heroes app shell"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
# SSR runtime imports third-party deps that bun's isolated install left under
# apps/heroes-web/node_modules (e.g. clsx, the SvelteKit Node adapter).
COPY --from=deps /app/apps/heroes-web/node_modules apps/heroes-web/node_modules
COPY --from=builder /app/apps/heroes-web/build apps/heroes-web/build
COPY --from=builder /app/apps/heroes-web/package.json apps/heroes-web/package.json
COPY --from=builder /app/packages/heroes-shared packages/heroes-shared
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/heroes-web/build/index.js"]
