#!/usr/bin/env bash
# backup.sh — Daily PostgreSQL backup to Supabase Storage.
#
# Intended as a Railway cron job or GitHub Actions scheduled workflow.
# Requires: pg_dump, Supabase CLI, SUPABASE_DB_URL env var.
#
# Usage: ./supabase/scripts/backup.sh
# Cron:  0 2 * * * /app/supabase/scripts/backup.sh (2 AM UTC daily)

set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_${TIMESTAMP}.sql.gz"
BUCKET="db-backups"

echo "[backup] Starting PostgreSQL backup at ${TIMESTAMP}"

# Dump the public schema only (auth.users managed by Supabase)
pg_dump \
  --no-privileges \
  --no-owner \
  --schema=public \
  "${SUPABASE_DB_URL}" \
  | gzip > "/tmp/${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "/tmp/${BACKUP_FILE}" | cut -f1)
echo "[backup] Dump complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Upload to Supabase Storage via CLI
supabase storage cp \
  "/tmp/${BACKUP_FILE}" \
  "ss:///${BUCKET}/${BACKUP_FILE}" \
  --project-ref "${SUPABASE_PROJECT_REF}"

echo "[backup] Uploaded to storage: ${BUCKET}/${BACKUP_FILE}"

# Retention: delete backups older than 30 days
# (Supabase Storage lifecycle policies can handle this automatically)
echo "[backup] Backup complete."

# Cleanup local file
rm -f "/tmp/${BACKUP_FILE}"
