#!/bin/bash
set -euo pipefail

ROOT="$HOME/Mock-Placement-App-main"
FRONTEND_PORT=5180
cd "$ROOT"

echo "=== 1. Databases ==="
sudo docker compose up -d postgres redis

echo "=== 1b. Waiting for Postgres to accept connections ==="
tries=0
until sudo docker exec pp_postgres pg_isready -U postgres >/dev/null 2>&1; do
  tries=$((tries+1))
  if [ "$tries" -gt 30 ]; then
    echo "❌ Postgres never became ready. Check: sudo docker logs pp_postgres --tail=100"
    exit 1
  fi
  sleep 1
done
echo "✅ Postgres is ready"

echo "=== 2. Judge0 ==="
cd "$ROOT/infra/judge0"
sudo docker compose up -d db redis
sleep 10
sudo docker compose up -d
cd "$ROOT"

echo "=== 3. Node version check ==="
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "⚠️  Node $(node -v) detected — several backend deps require Node 20+."
  echo "    Run: nvm install 20 && nvm use 20  then re-run this script."
  exit 1
fi

echo "=== 4. Backend ==="
cd "$ROOT/backend"

if [ ! -f .env ]; then
  echo "⚠️  backend/.env not found — creating from .env.example"
  cp .env.example .env
  echo "⚠️  Edit backend/.env with your actual secrets before continuing, or press Enter to use defaults (dev only)"
  read -r
fi

npm install
npm run db:migrate
npm run db:seed

if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi
pm2 delete campustrack-backend 2>/dev/null || true
pm2 start src/index.js --name campustrack-backend
cd "$ROOT"

echo "=== 5. Frontend ==="
cd "$ROOT/frontend"
npm install
npm run build

pm2 delete campustrack-frontend 2>/dev/null || true

# Defensive: if a previous run (or an unrelated docker container) is still
# holding this port, fuser -k clears it before we start. Harmless no-op if
# the port is already free.
sudo fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
sleep 1

pm2 start npm --name campustrack-frontend -- run preview -- --host 0.0.0.0 --port "$FRONTEND_PORT"
cd "$ROOT"

echo "=== 6. Health check ==="
tries=0
until curl -sf -m 5 http://localhost:5000/health > /dev/null 2>&1; do
  tries=$((tries+1))
  if [ "$tries" -gt 20 ]; then
    echo "❌ Backend not responding. Check: pm2 logs campustrack-backend --lines 100"
    exit 1
  fi
  sleep 2
done
echo "✅ Backend is up"

curl -sf -m 5 "http://localhost:${FRONTEND_PORT}" > /dev/null \
  && echo "✅ Frontend is up on port ${FRONTEND_PORT}" \
  || echo "⚠️  Frontend not responding on port ${FRONTEND_PORT} yet — check: pm2 logs campustrack-frontend, and confirm nothing else already owns that port (sudo ss -tlnp | grep ${FRONTEND_PORT})"

echo ""
echo "All services started under pm2. Useful commands:"
echo "  pm2 status"
echo "  pm2 logs campustrack-backend"
echo "  pm2 logs campustrack-frontend"
echo "  pm2 restart campustrack-backend"
echo "  pm2 stop all"
echo ""
echo "Frontend is served on port ${FRONTEND_PORT} (moved off 5173 to avoid colliding"
echo "with other docker projects on this host). Make sure backend/.env's"
echo "FRONTEND_URL matches this port."
echo ""
echo "After frontend source changes, rebuild:"
echo "  cd frontend && npm run build && pm2 restart campustrack-frontend"
