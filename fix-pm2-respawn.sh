#!/bin/bash
set -euo pipefail

ROOT="$HOME/Mock-Placement-App-main"
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
  echo "⚠️  Edit backend/.env with your actual secrets, or press Enter to use defaults (dev only)"
  read -r
fi

npm install
npm run db:migrate
npm run db:seed
pm2 delete campustrack-backend 2>/dev/null || true
pm2 start src/index.js --name campustrack-backend
pm2 save --force
cd "$ROOT"

echo "=== 5. Frontend ==="
cd "$ROOT/frontend"
npm install
npm run build

pm2 delete campustrack-frontend 2>/dev/null || true
pm2 start npm --name campustrack-frontend -- run preview -- --host 0.0.0.0 --port 5173
pm2 save --force
cd "$ROOT"

echo "=== 6. Health check ==="
tries=0
until curl -sf http://localhost:5000/health | grep -q '"status":"ok"'; do
  tries=$((tries+1))
  if [ "$tries" -gt 40 ]; then
    echo "❌ Still not healthy. Check: pm2 logs campustrack-backend --lines 100"
    exit 1
  fi
  sleep 3
done
echo "✅ Backend is up"

pm2 list
echo ""
echo "✅ DONE"
