# syntax=docker/dockerfile:1

# ── Stage 1: Install dependencies ────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# ── Stage 2: Build SvelteKit static files ────────────────────────
FROM deps AS web-build
ARG VITE_GIP_API_KEY
ARG VITE_GIP_AUTH_DOMAIN
ARG VITE_GIP_PROJECT_ID
ENV VITE_GIP_API_KEY=$VITE_GIP_API_KEY
ENV VITE_GIP_AUTH_DOMAIN=$VITE_GIP_AUTH_DOMAIN
ENV VITE_GIP_PROJECT_ID=$VITE_GIP_PROJECT_ID
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/src/ apps/api/src/
COPY apps/api/package.json apps/api/
COPY apps/web/ apps/web/
RUN cd apps/web && bun run build

# ── Stage 3: Production runtime ──────────────────────────────────
FROM oven/bun:1-slim AS runtime
LABEL org.opencontainers.image.title="COMS Portal" \
      org.opencontainers.image.description="COMS Portal — SvelteKit + Elysia on Bun"
WORKDIR /app
COPY --from=deps /app/node_modules/ node_modules/
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
COPY --from=web-build /app/apps/web/build/ public/
COPY package.json ./
EXPOSE 3000
USER bun
CMD ["bun", "apps/api/server.ts"]
