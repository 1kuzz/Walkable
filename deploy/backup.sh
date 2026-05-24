#!/usr/bin/env bash
# Daily database backup — keeps last 14 dumps
set -euo pipefail

BACKUP_DIR=/var/backups/walkable
mkdir -p "$BACKUP_DIR"

FILENAME="walkable_$(date +%Y%m%d_%H%M%S).sql.gz"
# Load DATABASE_URL from .env if not already set
if [ -z "${DATABASE_URL:-}" ] && [ -f /var/www/walkable/app/backend/.env ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' /var/www/walkable/app/backend/.env | cut -d= -f2-)
fi
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$FILENAME"

echo "[backup] Saved $BACKUP_DIR/$FILENAME ($(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1))"

# Keep only the 14 most recent backups
ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "[backup] Done. Total backups: $(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
