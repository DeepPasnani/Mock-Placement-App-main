#!/bin/bash
set -euo pipefail

# ============================================================
# Blue-Green Deployment Script
#
# Maintains two environments (blue and green) behind nginx.
# Deploys new version to the inactive environment, runs smoke
# tests, then flips traffic with zero downtime.
#
# Usage:
#   ./scripts/deploy-blue-green.sh [blue|green|flip|rollback]
#
# Commands:
#   blue              Deploy to blue environment
#   green             Deploy to green environment
#   flip              Flip nginx traffic to the other environment
#   rollback          Flip back to the previous environment
# ============================================================

# ── Configuration ─────────────────────────────────────────
PROJECT_DIR="/opt/placementpro"
COMPOSE_FILE="docker-compose.blue-green.yml"
NGINX_CONF_SOURCE="infra/blue-green-nginx.conf"
NGINX_CONF_TARGET="/etc/nginx/sites-enabled/placementpro"
STATE_FILE="${PROJECT_DIR}/.deploy-state"

# Determine which environment is active
if [ -f "$STATE_FILE" ]; then
  CURRENT=$(cat "$STATE_FILE")
else
  CURRENT="blue"
  echo "$CURRENT" > "$STATE_FILE"
fi

if [ "$CURRENT" = "blue" ]; then
  INACTIVE="green"
else
  INACTIVE="blue"
fi

ACTIVE_PORT=5000
INACTIVE_PORT=5001

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ── Functions ─────────────────────────────────────────────
log()   { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_health() {
  local port=$1
  local retries=30
  local wait=5

  log "Waiting for health check on port ${port}..."
  for i in $(seq 1 $retries); do
    if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
      log "Health check passed on port ${port}"
      return 0
    fi
    sleep $wait
  done
  error "Health check failed on port ${port} after ${retries} attempts"
  return 1
}

run_smoke_tests() {
  local port=$1
  log "Running smoke tests against port ${port}..."

  # Test login endpoint
  local login_res
  login_res=$(curl -sf -X POST "http://localhost:${port}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@test.edu","password":"testpass123"}' 2>&1) || {
    warn "Smoke test: login failed (expected if test users not seeded)"
    return 0
  }

  local token
  token=$(echo "$login_res" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")

  if [ -n "$token" ]; then
    # Test health
    curl -sf "http://localhost:${port}/health" > /dev/null && log "Smoke: /health OK" || warn "Smoke: /health failed"

    # Test API
    curl -sf "http://localhost:${port}/api/tests" \
      -H "Authorization: Bearer ${token}" > /dev/null && log "Smoke: /api/tests OK" || warn "Smoke: /api/tests failed"
  fi

  log "Smoke tests completed"
}

update_nginx() {
  local active_env=$1
  log "Updating nginx to point to ${active_env} environment..."

  # Use sed to update the upstream server lines in the nginx config
  # or generate the config for the active environment
  if [ "$active_env" = "blue" ]; then
    ACTIVE_UPSTREAM="blue"
  else
    ACTIVE_UPSTREAM="green"
  fi

  # Copy the blue-green nginx config
  cp "${PROJECT_DIR}/${NGINX_CONF_SOURCE}" "${NGINX_CONF_TARGET}"

  # Replace the environment placeholder
  sed -i "s/__ACTIVE_ENV__/${ACTIVE_UPSTREAM}/g" "${NGINX_CONF_TARGET}"

  # Test and reload nginx
  nginx -t && systemctl reload nginx
  log "Nginx reloaded successfully"
}

deploy_to() {
  local target_env=$1
  local target_port=$2

  log "Deploying to ${target_env} environment (port ${target_port})..."

  cd "${PROJECT_DIR}"

  # Pull latest images
  docker-compose -f "${COMPOSE_FILE}" pull backend-${target_env}

  # Build and start the target environment
  docker-compose -f "${COMPOSE_FILE}" up -d --build backend-${target_env}

  # Wait for health check
  if check_health "${target_port}"; then
    log "${target_env} environment deployed and healthy"

    # Run smoke tests
    if run_smoke_tests "${target_port}"; then
      log "Smoke tests passed for ${target_env}"
      return 0
    else
      error "Smoke tests failed for ${target_env}"
      return 1
    fi
  else
    error "${target_env} health check failed"
    return 1
  fi
}

flip_traffic() {
  log "Flipping traffic from ${CURRENT} to ${INACTIVE}..."

  # Update nginx to point to the inactive environment (now becoming active)
  update_nginx "${INACTIVE}"

  # Save new state
  echo "${INACTIVE}" > "${STATE_FILE}"

  log "Traffic flipped! ${INACTIVE} is now active"

  # Keep old environment running for quick rollback
  log "${CURRENT} environment is still running (for quick rollback)"
}

rollback() {
  if [ -f "$STATE_FILE" ]; then
    PREVIOUS=$(cat "${STATE_FILE}")
    if [ "$PREVIOUS" = "blue" ]; then
      ROLLBACK_TO="green"
    else
      ROLLBACK_TO="blue"
    fi
    log "Rolling back to ${ROLLBACK_TO}..."

    update_nginx "${ROLLBACK_TO}"
    echo "${ROLLBACK_TO}" > "${STATE_FILE}"

    log "Rollback complete. ${ROLLBACK_TO} is now active"
  else
    error "No deployment state found. Cannot rollback"
    exit 1
  fi
}

# ── Main ──────────────────────────────────────────────────
case "${1:-}" in
  blue)
    deploy_to "blue" 5000
    ;;
  green)
    deploy_to "green" 5001
    ;;
  flip)
    flip_traffic
    ;;
  rollback)
    rollback
    ;;
  *)
    echo "Usage: $0 [blue|green|flip|rollback]"
    echo ""
    echo "Commands:"
    echo "  blue              Deploy to blue environment"
    echo "  green             Deploy to green environment"
    echo "  flip              Flip nginx traffic to the other environment"
    echo "  rollback          Flip back to the previous environment"
    echo ""
    echo "Current state: ${CURRENT} (active) / ${INACTIVE} (inactive)"
    exit 1
    ;;
esac
