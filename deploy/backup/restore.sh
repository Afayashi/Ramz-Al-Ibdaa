#!/bin/sh
# Usage: ./restore.sh /backups/erp-YYYYMMDD-HHMMSS.dump   (stops nothing — run with the API scaled to 0)
set -eu
[ -f "${1:-}" ] || { echo "usage: restore.sh <file.dump>"; exit 1; }
echo "Restoring $1 into $PGDATABASE on $PGHOST — existing data will be replaced. Ctrl+C to abort."; sleep 5
pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$1"
echo "[restore] done"
