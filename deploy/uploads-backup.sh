#!/bin/sh
# Archives the uploads volume (attachments, maintenance photos). Run from the host via cron.
set -eu
docker run --rm -v code_sprint1_uploads:/data:ro -v "${BACKUP_DIR:-$PWD/backups}":/out alpine \
  tar czf /out/uploads-$(date +%Y%m%d).tgz -C /data .
find "${BACKUP_DIR:-$PWD/backups}" -name 'uploads-*.tgz' -mtime +${RETENTION_DAYS:-30} -delete
