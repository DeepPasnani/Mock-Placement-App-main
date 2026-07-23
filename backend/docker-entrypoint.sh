#!/bin/sh
set -e

if [ "$SKIP_MIGRATION" != "1" ]; then
  echo "Running database migrations..."
  node src/db/migrate.js
  echo "Running database seed..."
  node src/db/seed.js
else
  echo "Skipping migrations (SKIP_MIGRATION=1)"
fi

echo "Starting server..."
exec node src/index.js
