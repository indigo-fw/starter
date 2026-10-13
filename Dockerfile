# syntax=docker/dockerfile:1.7
# ─── Stage 1: Install dependencies ─────────────────────────────────────────
# Pinned patch version: a floating minor tag (`bun:1.2`) makes two builds a
# week apart differ, and the lockfile format tracks the bun that wrote it.
# Bump deliberately, together with the local toolchain.
FROM oven/bun:1.3.8 AS deps

WORKDIR /app
COPY package.json bun.lock* ./
# BuildKit cache mount: the package cache survives across builds, so a
# lockfile change re-downloads only what changed.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Fail fast if content/ images are unresolved git-LFS pointers (the build
# checkout must run with `lfs: true` / `git lfs pull`) - shipping pointers
# would serve ~130-byte text files as broken images. image-sync also skips
# pointers at runtime, but a failed build surfaces the misconfig immediately.
RUN if [ -d content ] && grep -rl "https://git-lfs.github.com/spec/v1" content \
      --include="*.png" --include="*.jpg" --include="*.jpeg" \
      --include="*.gif" --include="*.webp" --include="*.avif" 2>/dev/null | grep -q .; then \
      echo "ERROR: content/ contains git-LFS pointer files; enable LFS in the CI checkout" >&2; \
      exit 1; \
    fi

# Deploy metadata for /api/health. CI runs `bun run build-info` in the git
# checkout before `docker build` (the image has no .git); this placeholder
# keeps the COPY below valid when it didn't.
RUN [ -f build-info.json ] || echo '{"source":"unknown"}' > build-info.json

# Dummy env vars for Next.js static analysis during build.
# Real values are provided at runtime.
ENV DATABASE_URL="postgresql://localhost:5432/placeholder" \
    BETTER_AUTH_SECRET="build-time-placeholder-secret-that-is-32-chars" \
    NEXT_PUBLIC_APP_URL="http://localhost:3000" \
    NODE_ENV="production"

RUN node scripts/i18n/po-to-json.mjs
# Next's incremental compile cache persists across builds via the mount.
RUN --mount=type=cache,target=/app/.next/cache \
    npx next build

# ─── Stage 3: Runtime ────────────────────────────────────────────────────
FROM oven/bun:1.3.8-slim AS runtime

WORKDIR /app

# Install libvips runtime (not -dev) for sharp image processing
RUN apt-get update && apt-get install -y --no-install-recommends libvips42 && \
    rm -rf /var/lib/apt/lists/*

# Copy built artifacts and runtime files. node_modules ships in full (incl.
# devDependencies): the runtime executes TypeScript source directly (`bun run
# server.ts`, `src/scripts/migrate.ts` from the entrypoint) rather than a
# pruned production build, and no step has yet verified which devDependencies
# that path can live without. Known follow-up: measure, then prune.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/build-info.json ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src ./src
COPY --from=builder /app/emails ./emails
COPY --from=builder /app/content ./content
COPY --from=builder /app/public ./public
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/locales ./locales
COPY --from=builder /app/scripts ./scripts

# Remove test files from runtime image; create the writable dirs and hand the
# app tree to the unprivileged `bun` user the base image ships with.
RUN find /app/src -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/src -name "*.test.ts" -delete 2>/dev/null; \
    mkdir -p /app/uploads && \
    chown -R bun:bun /app/uploads /app/.next

ENV NODE_ENV=production \
    SERVER_ROLE=all \
    PORT=3000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Run as non-root: a compromised request handler can't rewrite the app tree.
USER bun

EXPOSE 3000

# Container-level liveness: /api/health returns 503 only when a critical core
# check (DB, Redis) fails, so the orchestrator restarts a wedged instance.
# Memory and queue backlog are reported as `degraded` (still 200) — they are
# load signals, not liveness. The worker role answers the same path from
# server.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "server.ts"]
