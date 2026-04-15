# syntax=docker/dockerfile:1

# ── Stage 1: Install dependencies ────────────────────────────────
FROM oven/bun:1 AS install

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────
FROM oven/bun:1 AS build

WORKDIR /app

# Firebase client config — inlined by Vite at build time (public, not secret)
ARG VITE_GIP_API_KEY
ARG VITE_GIP_AUTH_DOMAIN
ARG VITE_GIP_PROJECT_ID
ENV VITE_GIP_API_KEY=$VITE_GIP_API_KEY
ENV VITE_GIP_AUTH_DOMAIN=$VITE_GIP_AUTH_DOMAIN
ENV VITE_GIP_PROJECT_ID=$VITE_GIP_PROJECT_ID

# Copy installed modules from install stage
COPY --from=install /app/node_modules ./node_modules

# Copy full source
COPY . .

RUN bun run build

# ── Stage 3: Runtime ─────────────────────────────────────────────
FROM oven/bun:1 AS runtime

LABEL org.opencontainers.image.title="COMS Portal" \
      org.opencontainers.image.description="COMS Portal — TanStack Start + Elysia on Bun" \
      org.opencontainers.image.vendor="fbi-dev-484410"

WORKDIR /app

# Copy built output, server entry, and production node_modules only
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=install /app/node_modules ./node_modules

EXPOSE 3000

# Run as the non-root bun user provided by the base image
USER bun

CMD ["bun", "server.ts"]
