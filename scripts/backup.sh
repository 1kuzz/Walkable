#!/usr/bin/env bash
# scripts/backup.sh — Backup PostgreSQL database and uploaded files.
#
# Usage:
#   bash scripts/backup.sh                         # backup prod stack
#   STACK=staging bash scripts/backup.sh           # backup staging stack
#   STACK=local bash scripts/backup.sh             # backup local dev stack
#   bash scripts/backup.sh --dry-run               # preview without writing files
#
# Environment variables:
#   STACK                  prod|staging|local (default: prod)
#   BACKUP_DIR             target directory (default: ./backups)
#   BACKUP_RETENTION_DAYS  days to keep backups (default: 30)
#   DB_ONLY                set to 1 to skip uploads backup
#   UPLOADS_ONLY           set to 1 to skip database backup

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//' | head -20
      exit 0
      ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[backup]${NC} $*"; }
success() { echo -e "${GREEN}[backup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[backup]${NC} $*"; }
error()   { echo -e "${RED}[backup]${NC} $*" >&2; }

dry_run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    warn "[dry-run] would run: $*"
    return 0
  fi
  "$@"
}

# ── Configuration ──────────────────────────────────────────────────────────────
STACK="${STACK:-prod}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_DIR}/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_ONLY="${DB_ONLY:-0}"
UPLOADS_ONLY="${UPLOADS_ONLY:-0}"
TIMESTAMP=$(date +%Y%m%d-%H%M)

case "$STACK" in
  prod)    PROJECT="mops-prod";    POSTGRES_CONTAINER="mops-prod-postgres";    UPLOADS_VOLUME="mops-prod-uploads" ;;
  staging) PROJECT="mops-staging"; POSTGRES_CONTAINER="mops-staging-postgres"; UPLOADS_VOLUME="mops-staging-uploads" ;;
  local)   PROJECT="mops";         POSTGRES_CONTAINER="mops-postgres";          UPLOADS_VOLUME="mops-uploads" ;;
  *)
    error "Unknown STACK '${STACK}'. Use: prod, staging, or local."
    exit 1
    ;;
esac

DB_BACKUP="${BACKUP_DIR}/db-${STACK}-${TIMESTAMP}.sql.gz"
UPLOADS_BACKUP="${BACKUP_DIR}/uploads-${STACK}-${TIMESTAMP}.tgz"

# ── Preflight ─────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 0 ]]; then
  mkdir -p "$BACKUP_DIR"
fi

if ! docker inspect "$POSTGRES_CONTAINER" &>/dev/null; then
  error "Container '${POSTGRES_CONTAINER}' is not running."
  error "Start the ${STACK} stack first, or set STACK=local|staging|prod."
  exit 1
fi

echo ""
info "Stack:       ${STACK} (project: ${PROJECT})"
info "Backup dir:  ${BACKUP_DIR}"
info "Timestamp:   ${TIMESTAMP}"
info "Retention:   ${BACKUP_RETENTION_DAYS} days"
[[ "$DRY_RUN" -eq 1 ]] && warn "DRY RUN — no files will be written"
echo ""

# ── Database backup ────────────────────────────────────────────────────────────
if [[ "$UPLOADS_ONLY" -eq 0 ]]; then
  info "Backing up PostgreSQL → ${DB_BACKUP} …"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    docker exec "$POSTGRES_CONTAINER" \
      pg_dump -U portal portal | gzip > "$DB_BACKUP"
    # Verify backup integrity
    if gunzip -t "$DB_BACKUP" 2>/dev/null; then
      DB_SIZE=$(du -sh "$DB_BACKUP" | cut -f1)
      success "Database backup: ${DB_BACKUP} (${DB_SIZE})"
    else
      error "Database backup verification failed — file may be corrupt: ${DB_BACKUP}"
      rm -f "$DB_BACKUP"
      exit 1
    fi
  else
    warn "[dry-run] would run: docker exec ${POSTGRES_CONTAINER} pg_dump -U portal portal | gzip > ${DB_BACKUP}"
  fi
fi

# ── Uploads backup ─────────────────────────────────────────────────────────────
if [[ "$DB_ONLY" -eq 0 ]]; then
  info "Backing up uploads volume '${UPLOADS_VOLUME}' → ${UPLOADS_BACKUP} …"
  # Check volume exists
  if docker volume inspect "$UPLOADS_VOLUME" &>/dev/null; then
    if [[ "$DRY_RUN" -eq 0 ]]; then
      docker run --rm \
        -v "${UPLOADS_VOLUME}:/data:ro" \
        -v "${BACKUP_DIR}:/out" \
        busybox:1.37 tar czf "/out/$(basename "$UPLOADS_BACKUP")" /data 2>/dev/null
      UPLOADS_SIZE=$(du -sh "$UPLOADS_BACKUP" | cut -f1)
      success "Uploads backup: ${UPLOADS_BACKUP} (${UPLOADS_SIZE})"
    else
      warn "[dry-run] would run: docker run --rm -v ${UPLOADS_VOLUME}:/data:ro busybox tar czf ..."
    fi
  else
    warn "Volume '${UPLOADS_VOLUME}' does not exist — skipping uploads backup."
  fi
fi

# ── Prune old backups ─────────────────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 0 && "$BACKUP_RETENTION_DAYS" -gt 0 && -d "$BACKUP_DIR" ]]; then
  STALE_FILES=$(find "$BACKUP_DIR" \( -name "*.sql.gz" -o -name "*.tgz" \) \
    -mtime +"$BACKUP_RETENTION_DAYS" -print 2>/dev/null || true)
  if [[ -n "$STALE_FILES" ]]; then
    DELETED=$(echo "$STALE_FILES" | wc -l | tr -d ' ')
    echo "$STALE_FILES" | while IFS= read -r f; do
      info "  Pruning: $(basename "$f")"
    done
    echo "$STALE_FILES" | xargs -r rm -f
    info "Pruned ${DELETED} backup file(s) older than ${BACKUP_RETENTION_DAYS} days."
  fi
fi

echo ""
success "Backup complete."
echo ""
