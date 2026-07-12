#!/bin/sh
set -e

# Run database migrations unless disabled (AUTO_MIGRATE=false skips them).
# A failed migration aborts boot by default so the server never runs on a
# stale schema. Set AUTO_MIGRATE=continue to boot anyway despite failure.
if [ "${AUTO_MIGRATE:-true}" != "false" ]; then
  echo "Running database migrations..."
  if ! bun run db:migrate; then
    if [ "${AUTO_MIGRATE}" = "continue" ]; then
      echo "Migration failed — continuing anyway (AUTO_MIGRATE=continue)"
    else
      echo "Migration failed — aborting boot (set AUTO_MIGRATE=continue to override)"
      exit 1
    fi
  fi
fi

# Content sync runs at server startup (server.ts) — no separate step needed.
# To run manually: bun run content:sync

exec "$@"
