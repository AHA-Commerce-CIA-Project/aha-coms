# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN bun install --frozen-lockfile

# Stage 2: Build (shared first; web + server in parallel afterwards)
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .
RUN bun run --filter=@coms/shared build
# web and server only import each other's source for *types*, not built dist —
# safe to build in parallel. Wait on each PID so the RUN exits non-zero if
# either build fails.
RUN bun run --filter=@coms/web build & WEB_PID=$!; \
    NODE_ENV=production bun run --filter=@coms/server build & SRV_PID=$!; \
    wait $WEB_PID && wait $SRV_PID

# Stage 3: Production (minimal)
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV SVELTEKIT_BUILD_PATH=/app/packages/web/build
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/web/build ./packages/web/build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8080
CMD ["bun", "run", "dist/index.js"]
