#!/usr/bin/env bash
# scripts/upgrade.sh — Server-side upgrade script for MOPS Portal.
#
# Usage:
#   bash scripts/upgrade.sh                  # full upgrade (backup → pull → deploy)
#   bash scripts/upgrade.sh --dry-run        # preview actions without changes
#   bash scripts/upgrade.sh --skip-backup    # skip pre-upgrade database backup
#
# What it does:
#   1. Pre-upgrade database backup (unless --skip-backup)
#   2. Pulls latest code (git pull --ff-only)
#   3. Syncs /opt/mops/*.env files with new keys from deploy/env.example
#   4. Triggers compose-deploy.sh for the detected stack
#   5. Runs post-deploy smoke tests
#   6. Prints rollback instructions on failure
#
# Environment variables:
#   STACK               — force a specific stack: prod|staging (default: auto-detect)
#   SKIP_BACKUP         — set to 1 to skip pre-upgrade backup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

DRY_RUN=0
SKIP_BACKUP="${SKIP_BACKUP:-0}"
for arg in "$@"; do
  case "$arg" in
    --dry-run)      DRY_RUN=1 ;;
    --skip-backup)  SKIP_BACKUP=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//' | head -20
      exit 0
      ;;
  esac
done

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[upgrade]${NC} $*"; }
success() { echo -e "${GREEN}[upgrade]${NC} $*"; }
warn()    { echo -e "${YELLOW}[upgrade]${NC} $*"; }
error()   { echo -e "${RED}[upgrade]${NC} $*" >&2; }

dry() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    warn "[dry-run] would run: $*"
  else
    "$@"
  fi
}

# Auto-detect docker compose
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  error "Docker Compose not found."
  exit 1
fi

# ── 0. Detect running stack ───────────────────────────────────────────────────
if [[ -z "${STACK:-}" ]]; then
  if $COMPOSE -f docker-compose.prod.yml --project-name mops-prod \
       ps --services --filter "status=running" 2>/dev/null | grep -q .; then
    STACK="prod"
  elif $COMPOSE -f docker-compose.staging.yml --project-name mops-staging \
       ps --services --filter "status=running" 2>/dev/null | grep -q .; then
    STACK="staging"
  else
    error "No running Docker stack detected. Set STACK=prod or STACK=staging."
    exit 1
  fi
fi

PRE_VERSION="$(cat VERSION 2>/dev/null || echo "unknown")"
echo ""
echo -e "${BOLD}┌─── MOPS Portal — Server Upgrade ────────────────────────────────┐${NC}"
echo ""
info "Current version: v${PRE_VERSION}"
info "Stack:           ${STACK}"
[[ "$DRY_RUN" -eq 1 ]] && warn "DRY RUN — no changes will be made"
echo ""

# ── 1. Pre-upgrade database backup ───────────────────────────────────────────
if [[ "$SKIP_BACKUP" -eq 0 ]]; then
  info "Running pre-upgrade database backup..."
  if [[ "$DRY_RUN" -eq 0 ]]; then
    DB_ONLY=1 STACK="$STACK" bash scripts/backup.sh || {
      error "Pre-upgrade backup failed. Aborting upgrade."
      error "Fix the issue or re-run with --skip-backup to proceed without backup."
      exit 1
    }
    success "✔ Pre-upgrade backup complete."
  else
    warn "[dry-run] would run: DB_ONLY=1 STACK=${STACK} bash scripts/backup.sh"
  fi
else
  warn "Skipping pre-upgrade backup (--skip-backup)."
fi

# ── 2. Check for uncommitted changes ─────────────────────────────────────────
info "Checking for uncommitted changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  error "Uncommitted changes detected. Commit or stash before upgrading."
  git status --short
  exit 1
fi

# ── 3. Pull latest code ──────────────────────────────────────────────────────
PRE_HEAD=$(git rev-parse HEAD)
info "Pulling latest changes..."
if [[ "$DRY_RUN" -eq 0 ]]; then
  if ! git pull --ff-only; then
    error "git pull --ff-only failed. Resolve manually."
    exit 1
  fi
else
  warn "[dry-run] would run: git pull --ff-only"
fi

POST_HEAD=$(git rev-parse HEAD)
if [[ "$PRE_HEAD" != "$POST_HEAD" ]]; then
  NEW_COMMITS=$(git log --oneline "${PRE_HEAD}..${POST_HEAD}" | wc -l | tr -d ' ')
  success "✔ Updated: ${NEW_COMMITS} new commit(s)."
else
  info "Already up to date."
fi

# ── 4. Sync /opt/mops/*.env with new keys ────────────────────────────────────
info "Syncing environment files with deploy/env.example..."
if [[ -f deploy/env.example ]]; then
  for ENV_FILE in /opt/mops/prod.env /opt/mops/staging.env; do
    if [[ -f "$ENV_FILE" ]]; then
      ADDED=0
      while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        key="${line%%=*}"
        [[ -z "$key" ]] && continue
        if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
          if [[ "$DRY_RUN" -eq 0 ]]; then
            echo "$line" >> "$ENV_FILE"
          fi
          info "  Added ${key} to ${ENV_FILE}"
          ((ADDED++))
        fi
      done < deploy/env.example
      [[ "$ADDED" -eq 0 ]] && info "  ${ENV_FILE} — up to date"
    fi
  done
fi

# ── 5. Determine health port and deploy ───────────────────────────────────────
case "$STACK" in
  prod)    HEALTH_PORT=3000; ENV_FILE="/opt/mops/prod.env" ;;
  staging) HEALTH_PORT=3001; ENV_FILE="/opt/mops/staging.env" ;;
esac

info "Deploying ${STACK} stack..."
if [[ "$DRY_RUN" -eq 0 ]]; then
  if [[ -f /opt/mops/.secrets && -f "$ENV_FILE" ]]; then
    set -a
    source /opt/mops/.secrets
    source "$ENV_FILE"
    set +a

    # Build fresh images with the current code
    # Registry and npm URLs: read from /opt/mops env or fall back to defaults.
    # To change, update /opt/mops/.secrets or /opt/mops/<env>.env.
    # See deploy/HOSTS.md for the full list of infrastructure endpoints.
    REGISTRY="${DOCKER_REGISTRY:-r-docker-all-in-one.repository.avp.ru:443}"
    NPM_REGISTRY_URL="${NPM_REGISTRY:-https://repository.avp.ru/artifactory/api/npm/r-npm/}"
    NPM_AUTH_TOKEN=""
    if [[ -n "${NPM_USER:-}" && -n "${NPM_PASSWORD:-}" ]]; then
      NPM_AUTH_TOKEN=$(echo -n "${NPM_USER}:${NPM_PASSWORD}" | base64)
    fi

    BUILD_ID="upgrade-$(date +%Y%m%d-%H%M%S)"

    DOCKER_BUILDKIT=1 docker build \
      --build-arg BUILDKIT_INLINE_CACHE=1 \
      --build-arg DOCKER_REGISTRY="${REGISTRY}/" \
      --build-arg NPM_REGISTRY="${NPM_REGISTRY_URL}" \
      --build-arg "NPM_AUTH=${NPM_AUTH_TOKEN}" \
      --build-arg "VITE_APP_VERSION=${BUILD_ID}" \
      --build-arg "VITE_ADMIN_USERS=${VITE_ADMIN_USERS:-}" \
      -t "mops-portal:${STACK}-${BUILD_ID}" \
      "$REPO_DIR"

    DOCKER_BUILDKIT=1 docker build \
      --build-arg BUILDKIT_INLINE_CACHE=1 \
      --build-arg DOCKER_REGISTRY="${REGISTRY}/" \
      --build-arg NPM_REGISTRY="${NPM_REGISTRY_URL}" \
      --build-arg "NPM_AUTH=${NPM_AUTH_TOKEN}" \
      -t "mops-backend:${STACK}-${BUILD_ID}" \
      "$REPO_DIR/backend"

    export PORTAL_IMAGE="mops-portal:${STACK}-${BUILD_ID}"
    export BACKEND_IMAGE="mops-backend:${STACK}-${BUILD_ID}"

    bash deploy/compose-deploy.sh "$STACK"
  else
    error "Missing /opt/mops/.secrets or ${ENV_FILE}. Run scripts/bootstrap-agent.sh first."
    exit 1
  fi
else
  warn "[dry-run] would build images and run deploy/compose-deploy.sh ${STACK}"
fi

# ── 6. Post-deploy smoke tests ───────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 0 ]]; then
  info "Running post-deploy smoke tests..."
  if bash deploy/smoke-test.sh "http://localhost:${HEALTH_PORT}"; then
    success "✔ Smoke tests passed."
  else
    error "Smoke tests failed!"
    echo ""
    error "ROLLBACK INSTRUCTIONS:"
    error "  1. List available images: docker images mops-portal --format '{{.Tag}}\t{{.CreatedAt}}'"
    error "  2. Roll back:"
    error "     export PORTAL_IMAGE=mops-portal:${STACK}-<previous-build-id>"
    error "     export BACKEND_IMAGE=mops-backend:${STACK}-<previous-build-id>"
    error "     bash deploy/compose-deploy.sh ${STACK}"
    error "  3. Restore database if needed:"
    error "     make restore BACKUP=backups/db-${STACK}-<timestamp>.sql.gz STACK=${STACK}"
    exit 1
  fi
fi

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo ""
POST_VERSION="$(cat VERSION 2>/dev/null || echo "unknown")"
echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
if [[ "$PRE_VERSION" != "$POST_VERSION" ]]; then
  success "✔ Upgraded: v${PRE_VERSION} → v${POST_VERSION} (${STACK})"
else
  success "✔ Upgrade complete: v${POST_VERSION} (${STACK})"
fi
echo ""
