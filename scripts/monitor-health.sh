#!/bin/bash
# ============================================================
# CampusTrack Uptime Monitoring Script
#
# Usage:
#   ./scripts/monitor-health.sh <url> [alert-email]
#   ./scripts/monitor-health.sh https://campustrack.app admin@college.edu
#
# Add to crontab:
#   */5 * * * * /path/to/scripts/monitor-health.sh https://campustrack.app
# ============================================================

URL="${1:-http://localhost:5000/health}"
ALERT_EMAIL="$2"
LOG_FILE="./logs/uptime.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$(dirname "$LOG_FILE")"

response=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$URL" 2>/dev/null) || response="000"

if [ "$response" = "200" ]; then
  echo "$TIMESTAMP OK $URL" >> "$LOG_FILE"
else
  echo "$TIMESTAMP DOWN ($response) $URL" >> "$LOG_FILE"
  echo "[ALERT] $URL returned HTTP $response at $TIMESTAMP"

  if [ -n "$ALERT_EMAIL" ]; then
    echo "Subject: [CampusTrack] Uptime Alert - $URL is down

    Service: $URL
    Status:  HTTP $response
    Time:    $TIMESTAMP

    Action required. Check the server immediately." \
    | sendmail -f "monitor@campustrack.app" "$ALERT_EMAIL" 2>/dev/null \
    || echo "Mail not configured — install sendmail or use another transport"
  fi
fi
