#!/usr/bin/env bash
# scripts/cron-setup.sh — Install crontab entries for automated backups.
#
# Usage:
#   sudo bash scripts/cron-setup.sh
#   sudo bash scripts/cron-setup.sh --remove   # remove cron entries
#   sudo bash scripts/cron-setup.sh --dry-run  # show what would be added
#
# What it sets up:
#   • Daily at 02:00 — database backup  (STACK=prod)
#   • Weekly Sunday at 03:00 — uploads backup  (STACK=prod)
#
# The script is idempotent — running it multiple times is safe.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="${REPO_DIR}/scripts/backup.sh"
CRON_MARKER="# MOPS Portal automated backup"
LOG_DIR="${REPO_DIR}/backups/logs"

DRY_RUN=0
REMOVE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --remove)  REMOVE=1  ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//' | head -15
      exit 0
      ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[cron-setup]${NC} $*"; }
success() { echo -e "${GREEN}[cron-setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[cron-setup]${NC} $*"; }
error()   { echo -e "${RED}[cron-setup]${NC} $*" >&2; }

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
  error "Backup script not found: ${BACKUP_SCRIPT}"
  exit 1
fi

# Determine the user whose crontab to modify (default: current user)
CRON_USER="${CRON_USER:-$(whoami)}"

CRON_FILE="/etc/cron.d/mops-portal-backup"

if [[ "$REMOVE" -eq 1 ]]; then
  if [[ -f "$CRON_FILE" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      warn "[dry-run] would remove: ${CRON_FILE}"
    else
      rm -f "$CRON_FILE"
      success "Removed ${CRON_FILE}"
    fi
  else
    info "No cron file to remove (${CRON_FILE} not found)."
  fi
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  warn "[dry-run] would write ${CRON_FILE} with:"
  echo "  0 2 * * * ${CRON_USER} DB_ONLY=1 STACK=prod bash ${BACKUP_SCRIPT} >> ${LOG_DIR}/backup-db.log 2>&1"
  echo "  0 3 * * 0 ${CRON_USER} UPLOADS_ONLY=1 STACK=prod bash ${BACKUP_SCRIPT} >> ${LOG_DIR}/backup-uploads.log 2>&1"
  exit 0
fi

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Write the cron file (idempotent — overwrites previous version)
cat > "$CRON_FILE" << CRONEOF
${CRON_MARKER} — managed by scripts/cron-setup.sh
# DO NOT EDIT MANUALLY — re-run scripts/cron-setup.sh to update

# Daily database backup at 02:00
0 2 * * * ${CRON_USER} DB_ONLY=1 STACK=prod bash ${BACKUP_SCRIPT} >> ${LOG_DIR}/backup-db.log 2>&1

# Weekly uploads backup on Sunday at 03:00
0 3 * * 0 ${CRON_USER} UPLOADS_ONLY=1 STACK=prod bash ${BACKUP_SCRIPT} >> ${LOG_DIR}/backup-uploads.log 2>&1
CRONEOF

chmod 644 "$CRON_FILE"
success "Cron jobs installed in ${CRON_FILE}"
info "Daily DB backup:     02:00 every day"
info "Weekly uploads:      03:00 every Sunday"
info "Logs: ${LOG_DIR}/"
echo ""
info "Test with: bash ${BACKUP_SCRIPT} --dry-run"
info "Remove with: sudo bash scripts/cron-setup.sh --remove"
