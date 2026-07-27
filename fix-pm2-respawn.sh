#!/bin/bash
set -e

ROOT="$HOME/Mock-Placement-App-main"
cd "$ROOT"

echo "=== 1. What is PM2 currently managing? ==="
pm2 list || true

echo "=== 2. Tell PM2 to stop managing everything (this is what actually"
echo "    prevents it from respawning what we kill — a raw 'kill' alone"
echo "    just makes PM2 restart it again within seconds) ==="
pm2 delete all 2>/dev/null || true
pm2 save --force 2>/dev/null || true

echo "=== 3. Confirm port 5000 is now actually free ==="
sleep 2
if sudo ss -tlnp | grep -q ':5000'; then
  echo "  Still something there — force-killing directly as a fallback"
  sudo fuser -k 5000/tcp 2>/dev/null || true
  sleep 2
fi
sudo ss -tlnp | grep ':5000' && echo "⚠️  still occupied" || echo "✅ port 5000 is free"

echo "=== 4. Remove any stale backend container and start the stack ==="
sudo docker rm -f pp_backend 2>/dev/null || true
sudo docker compose up -d

echo "=== 5. Health check ==="
tries=0
until curl -sf http://localhost:5000/health | grep -q '"status":"ok"'; do
  tries=$((tries+1))
  if [ "$tries" -gt 40 ]; then
    echo "❌ Still not healthy. Check: sudo docker compose logs backend --tail=100"
    exit 1
  fi
  sleep 3
done
echo "✅ Backend is up"

echo "=== 6. Confirm your data is still there ==="
sudo docker exec pp_postgres psql -U postgres -d campustrack -c \
  "SELECT (SELECT COUNT(*) FROM tests) AS tests, (SELECT COUNT(*) FROM users) AS users;"

sudo docker compose ps
echo ""
echo "✅ DONE — Frontend: http://139.59.21.223:2828"
