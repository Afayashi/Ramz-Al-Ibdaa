#!/bin/sh
# Daily pg_dump with retention. Env: PGHOST PGUSER PGPASSWORD PGDATABASE BACKUP_DIR RETENTION_DAYS [S3_BUCKET]
set -eu
TS=$(date +%Y%m%d-%H%M%S)
DIR=${BACKUP_DIR:-/backups}
mkdir -p "$DIR"
FILE="$DIR/erp-$TS.dump"
pg_dump -Fc -Z 9 -f "$FILE"
pg_restore --list "$FILE" > /dev/null         # verify archive is readable
echo "[backup] $(date -Iseconds) $FILE $(du -h "$FILE" | cut -f1)"
if [ -n "${S3_BUCKET:-}" ] && command -v aws >/dev/null; then aws s3 cp "$FILE" "s3://$S3_BUCKET/postgres/" --only-show-errors; fi
find "$DIR" -name 'erp-*.dump' -mtime +${RETENTION_DAYS:-30} -delete
