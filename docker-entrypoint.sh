#!/bin/sh
set -e

# Run database migrations if AUTO_MIGRATE is set (default: true)
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "Running database migrations..."
  bun run db:migrate || echo "Migration failed — continuing anyway"
fi

exec "$@"
