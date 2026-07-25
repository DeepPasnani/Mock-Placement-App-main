# Database Backup Automation

## Overview

Two scripts provide automated PostgreSQL backup with rotation and optional S3 upload.

## Scripts

### `scripts/backup-db.sh`

Creates a compressed `pg_dump` custom-format backup.

```bash
# Basic usage (defaults to ./backups)
./scripts/backup-db.sh

# Specify output directory
./scripts/backup-db.sh /path/to/backups
```

**Environment variables:**
| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5433` | PostgreSQL port |
| `DB_NAME` | `campustrack` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres_password_change_me` | Database password |
| `S3_BUCKET` | _(optional)_ | S3 bucket for cloud upload |
| `AWS_ACCESS_KEY_ID` | _(optional)_ | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | _(optional)_ | AWS secret key |

### `scripts/backup-rotate.sh`

Manages retention: keeps 7 daily + 4 weekly backups.

```bash
./scripts/backup-rotate.sh /path/to/backups
```

## Cron Setup

Add to crontab (`crontab -e`):

```cron
# Run backup every night at 2 AM, then rotate
0 2 * * * /opt/campustrack/scripts/backup-db.sh /opt/campustrack/backups && /opt/campustrack/scripts/backup-rotate.sh /opt/campustrack/backups

# Upload to S3 (if configured) at 3 AM
0 3 * * * /opt/campustrack/scripts/backup-db.sh /opt/campustrack/backups
```

## Docker Compose Service

Add to `docker-compose.prod.yml`:

```yaml
backup:
  image: postgres:16-alpine
  container_name: pp_backup
  environment:
    DB_HOST: postgres
    DB_PORT: 5432
    DB_NAME: campustrack
    DB_USER: postgres
    DB_PASSWORD: ${DB_PASSWORD}
    S3_BUCKET: ${S3_BUCKET}
    AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
    AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
  volumes:
    - ./backups:/backups
    - ./scripts:/scripts:ro
  command: >
    sh -c "
    apk add --no-cache aws-cli &&
    while true; do
      /scripts/backup-db.sh /backups &&
      /scripts/backup-rotate.sh /backups &&
      sleep 86400
    done
    "
  depends_on:
    - postgres
```

## S3 Upload (in backup-db.sh)

If `S3_BUCKET` is set, the script uploads the backup file to S3:

```bash
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "${OUTPUT_DIR}/${FILENAME}" "s3://${S3_BUCKET}/postgres/${FILENAME}"
fi
```

## Restore Procedure

```bash
# Restore from custom-format backup
pg_restore -h localhost -p 5433 -U postgres -d campustrack --no-owner --no-acl -v campustrack_2025-01-15_02-00-01.sql.gz
```
