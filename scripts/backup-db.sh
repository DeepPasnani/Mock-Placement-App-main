#!/bin/bash
set -euo pipefail

# ============================================================
# CampusTrack Database Backup Script
# Usage: ./scripts/backup-db.sh [output-dir]
#
# Can also be run as a Docker Compose service or cron job.
# Set these env vars or use defaults:
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
#
# Optional S3 upload:
#   S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# ============================================================

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="campustrack_${TIMESTAMP}.sql.gz"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-placementpro}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres_password_change_me}"

mkdir -p "$OUTPUT_DIR"

export PGPASSWORD="$DB_PASSWORD"

echo "Backing up $DB_NAME@$DB_HOST:$DB_PORT → $OUTPUT_DIR/$FILENAME"

pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  --format=custom \
  --compress=9 \
  --file="${OUTPUT_DIR}/${FILENAME}"

echo "Backup complete: $(du -h "${OUTPUT_DIR}/${FILENAME}" | cut -f1)"

# ── Optional S3 upload ─────────────────────────────────────
if [ -n "${S3_BUCKET:-}" ]; then
  if command -v aws &> /dev/null; then
    echo "Uploading to s3://${S3_BUCKET}/postgres/${FILENAME}..."
    aws s3 cp "${OUTPUT_DIR}/${FILENAME}" "s3://${S3_BUCKET}/postgres/${FILENAME}" --only-show-errors
    echo "S3 upload complete"
  else
    echo "Warning: AWS CLI not found, skipping S3 upload"
  fi
fi

# Keep only last 30 backups
ls -t "$OUTPUT_DIR"/campustrack_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm

echo "Pruned old backups (kept last 30)"
