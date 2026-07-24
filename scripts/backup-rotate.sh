#!/bin/bash
set -euo pipefail

# ============================================================
# CampusTrack Database Backup Rotation Script
#
# Retention policy:
#   - 7 daily backups (keep one per day)
#   - 4 weekly backups (keep one per week, taken on Sunday)
#
# Usage:
#   ./scripts/backup-rotate.sh [backup-dir]
#
# Recommended crontab entry (run daily at 2 AM):
#   0 2 * * * /path/to/scripts/backup-db.sh /path/to/backups && /path/to/scripts/backup-rotate.sh /path/to/backups
# ============================================================

BACKUP_DIR="${1:-./backups}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Backup directory '$BACKUP_DIR' not found"
  exit 1
fi

echo "── Rotating backups in $BACKUP_DIR ──"

# ── Daily retention: keep last 7 days ──────────────────────
echo "Pruning daily backups (keeping 7)..."
find "$BACKUP_DIR" -name 'campustrack_*.sql.gz' -type f -mtime +7 -delete 2>/dev/null || true

# Count remaining daily backups
DAILY_COUNT=$(find "$BACKUP_DIR" -name 'campustrack_*.sql.gz' -type f | wc -l)
echo "  Daily backups retained: $DAILY_COUNT"

# ── Weekly retention: keep last 4 weeks ────────────────────
# Weekly backups are identified by being created on a Sunday
# We make a copy of the Sunday backup to a weekly-named file
WEEK_NUM=$(date +%U)
WEEKLY_FILE="$BACKUP_DIR/campustrack_weekly_${WEEK_NUM}.sql.gz"

# Find the most recent backup from Sunday
SUNDAY_BACKUP=$(find "$BACKUP_DIR" -name 'campustrack_*.sql.gz' -type f -newermt "$(date -d 'last sunday' +%Y-%m-%d)" ! -newermt "$(date -d 'next monday' +%Y-%m-%d)" 2>/dev/null | head -1)

if [ -n "$SUNDAY_BACKUP" ] && [ ! -f "$WEEKLY_FILE" ]; then
  cp "$SUNDAY_BACKUP" "$WEEKLY_FILE"
  echo "  Created weekly backup: $(basename "$WEEKLY_FILE")"
fi

# Remove weekly backups older than 4 weeks
find "$BACKUP_DIR" -name 'campustrack_weekly_*.sql.gz' -type f -mtime +28 -delete 2>/dev/null || true

WEEKLY_COUNT=$(find "$BACKUP_DIR" -name 'campustrack_weekly_*.sql.gz' -type f | wc -l)
echo "  Weekly backups retained: $WEEKLY_COUNT"

echo "── Rotation complete ──"
