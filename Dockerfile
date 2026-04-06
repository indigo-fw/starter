# ─── Stage 1: Install dependencies ─────────────────────────────────────────
FROM oven/bun:1.1 AS deps

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────
FROM oven/bun:1.1 AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy env vars for Next.js static analysis during build.
# Real values are provided at runtime.
ENV DATABASE_URL="postgresql://localhost:5432/placeholder" \
    BETTER_AUTH_SECRET="build-time-placeholder-secret-that-is-32-chars" \
    NEXT_PUBLIC_APP_URL="http://localhost:3000"

RUN bun run build

# ─── Stage 3: Runtime ────────────────────────────────────────────────────
FROM oven/bun:1.1-debian-slim AS runtime

WORKDIR /app

# Install libvips runtime (not -dev) for sharp image processing
RUN apt-get update && apt-get install -y --no-install-recommends libvips42 && \
    rm -rf /var/lib/apt/lists/*

# Copy built artifacts and runtime files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src/proxy.ts ./src/proxy.ts
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/src/engine ./src/engine
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/config ./src/config
COPY --from=builder /app/src/scripts ./src/scripts
COPY --from=builder /app/emails ./emails
COPY --from=builder /app/public ./public

# Remove test files from runtime image
RUN find /app/src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/src -name "*.test.ts" -delete 2>/dev/null; \
    mkdir -p /app/uploads

ENV NODE_ENV=production \
    SERVER_ROLE=all \
    PORT=3000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "server.ts"]
