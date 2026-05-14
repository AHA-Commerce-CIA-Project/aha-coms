# syntax=docker/dockerfile:1
#
# Built with monorepo root as the docker context. See
# .github/workflows/deploy-fast.yml for the invocation.
#
# Fast is a Next.js app with `output: 'standalone'` in next.config.ts — the
# builder stage produces `.next/standalone/server.js`, a self-contained Node
# entry. Bun handles dependency install at the workspace boundary (shared
# bun.lock); Node serves the standalone build at runtime.
#
# Per ADR 0011 fast keeps Prisma — `prisma generate` runs as a postinstall
# hook so the generated client lands in node_modules during the deps stage.

FROM oven/bun:1 AS deps
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
# Smoketest workspace — declared in root package.json (T51-T53 added it as
# the React chrome's stub consumer). `bun install --frozen-lockfile` fails
# workspace resolution if its package.json isn't present, even though no
# stage builds it.
COPY packages/ui-react/examples/smoketest/package.json packages/ui-react/examples/smoketest/
# Prisma schema is needed for the explicit `db:generate` below. The postinstall
# hook was removed from apps/fast/package.json so unrelated Dockerfiles
# (heroes-web, portal-*) can run `bun install` without needing fast's prisma
# schema. fast's docker build owns the explicit prisma generate step.
COPY apps/fast/prisma apps/fast/prisma
RUN bun install --frozen-lockfile
RUN bun run --filter @coms-portal/fast db:generate

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps apps/
COPY --from=deps /app/packages packages/
# Root package.json + lockfile let `bun run --filter @coms-portal/fast` walk
# the workspace tree to find the build script. heroes-web's Dockerfile works
# without this (apparently bun resolves the filter via node_modules symlinks
# for SvelteKit), but Next.js + Prisma + the standalone-output pipeline
# needs the full workspace context at build time — without root
# package.json, `bun run --filter` errors ENOENT before next build runs.
COPY package.json bun.lock ./
COPY tsconfig.base.json ./
COPY apps/fast apps/fast
COPY packages/sdk packages/sdk
COPY packages/shared packages/shared
COPY packages/ui-react packages/ui-react
COPY packages/account-widget-react packages/account-widget-react
COPY packages/design-tokens packages/design-tokens
# `next build` honours `output: 'standalone'` and emits
# apps/fast/.next/standalone/{server.js, ...} plus apps/fast/.next/static/.
RUN NODE_ENV=production bun run --filter @coms-portal/fast build

# Bullseye (Debian 11) carries libssl1.1 — Prisma's runtime detection picks
# the debian-openssl-1.1.x query engine binary; without libssl1.1 the engine
# fails to load. node:20-slim defaults to Bookworm (Debian 12) which only
# ships libssl3, so the 1.1.x binary can't link. Pinning to bullseye-slim
# matches what Prisma is detecting and keeps the runtime stage's libssl
# layer aligned with the binary picked at startup.
FROM node:20-bullseye-slim AS runtime
LABEL org.opencontainers.image.title="COMS Fast" \
      org.opencontainers.image.description="Next.js standalone — AHA Smart Tracker"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output bundles only the runtime deps it traced; copy
# the standalone tree + the unbundled static assets + the public/ dir.
COPY --from=builder /app/apps/fast/.next/standalone ./
COPY --from=builder /app/apps/fast/.next/static apps/fast/.next/static
COPY --from=builder /app/apps/fast/public apps/fast/public

EXPOSE 3000
USER node
CMD ["node", "apps/fast/server.js"]
