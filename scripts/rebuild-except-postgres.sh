#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Rebuild every container EXCEPT postgres.
#
# postgres (and its `postgres_data` volume) is never touched —
# it keeps running the whole time — so all admin accounts and
# tests already stored in the database survive the rebuild.
#
# `backend-init` re-running is safe: migrate.js only creates
# tables if they don't already exist, and seed.js upserts
# (ON CONFLICT) rather than deleting, so nothing gets wiped.
#
# Usage:
#   ./scripts/rebuild-except-postgres.sh          # from repo root
#   ./scripts/rebuild-except-postgres.sh --prod   # use docker-compose.prod.yml
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="docker-compose.yml"
if [[ "${1:-}" == "--prod" ]]; then
  COMPOSE_FILE="docker-compose.prod.yml"
fi

if docker compose version >/dev/null 2>&1; then
  DC="docker compose -f $COMPOSE_FILE"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose -f $COMPOSE_FILE"
else
  echo "Neither 'docker compose' nor 'docker-compose' was found on this machine." >&2
  exit 1
fi

# Every service in the file except postgres itself. Derived from
# the compose file so this keeps working if services are added later.
mapfile -t ALL_SERVICES < <($DC config --services)
SERVICES=()
for s in "${ALL_SERVICES[@]}"; do
  [[ "$s" == "postgres" ]] || SERVICES+=("$s")
done

echo "postgres will be left running untouched (data preserved)."
echo "Rebuilding: ${SERVICES[*]}"
echo

$DC build --no-cache "${SERVICES[@]}"

echo
echo "Recreating containers (postgres excluded)..."
$DC up -d --no-deps --force-recreate "${SERVICES[@]}"

echo
echo "Done. postgres was not rebuilt, restarted, or recreated."
$DC ps
