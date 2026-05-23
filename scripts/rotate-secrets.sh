#!/usr/bin/env bash
# scripts/rotate-secrets.sh — Rotate JWT secret and/or PostgreSQL password.
#
# Usage:
#   sudo bash scripts/rotate-secrets.sh                   # rotate all secrets
#   sudo bash scripts/rotate-secrets.sh --jwt-only        # rotate JWT secret only
#   sudo bash scripts/rotate-secrets.sh --db-only         # rotate DB password only
#   sudo bash scripts/rotate-secrets.sh --dry-run         # preview changes
#   bash scripts/rotate-secrets.sh --local                # rotate secrets in local .env
#
# What it does:
#   1. Generates new secrets (LOCAL_JWT_SECRET and/or POSTGRES_PASSWORD)
#   2. Updates /opt/mops/.secrets (server) or .env (--local)
#   3. For DB password: updates the running PostgreSQL user password
#   4. Restarts the backend to pick up new secrets
#
# ⚠️  Rotating LOCAL_JWT_SECRET invalidates ALL active user sessions.
# ⚠️  Rotating POSTGRES_PASSWORD requires both DB and secrets file to be updated atomically.

set -euo pipefail

DRY_RUN=0
ROTATE_JWT=1
ROTATE_DB=1
STACK="${STACK:-prod}"
LOCAL_MODE=0

for arg in "$@"; do
  case "$arg" in
    --jwt-only)  ROTATE_DB=0  ;;
    --db-only)   ROTATE_JWT=0 ;;
    --dry-run)   DRY_RUN=1    ;;
    --local)     LOCAL_MODE=1  ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//' | head -15
      exit 0
      ;;
  esac
done

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[rotate]${NC} $*"; }
success() { echo -e "${GREEN}[rotate]${NC} $*"; }
warn()    { echo -e "${YELLOW}[rotate]${NC} $*"; }
error()   { echo -e "${RED}[rotate]${NC} $*" >&2; }

SECRETS_FILE="/opt/mops/.secrets"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_ENV_FILE="${REPO_DIR}/.env"

if [[ "$LOCAL_MODE" -eq 1 ]]; then
  if [[ ! -f "$LOCAL_ENV_FILE" ]]; then
    error "Local .env not found: ${LOCAL_ENV_FILE}"
    error "Run ./setup.sh first."
    exit 1
  fi
  info "Local mode — rotating secrets in ${LOCAL_ENV_FILE}"
else
  if [[ ! -f "$SECRETS_FILE" ]]; then
    error "Secrets file not found: ${SECRETS_FILE}"
    error "Run scripts/bootstrap-agent.sh first, or use --local for local .env."
    exit 1
  fi
fi

# ─── Secret generation ────────────────────────────────────────────────────────
generate_secret() {
  local chars="${1:-64}"
  local bytes=$(( (chars + 1) / 2 ))
  openssl rand -hex "$bytes" | head -c "$chars"
}

generate_password() {
  local chars="${1:-24}"
  openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c "$chars"
}

# ─── Determine container names ────────────────────────────────────────────────
if [[ "$LOCAL_MODE" -eq 1 ]]; then
  PROJECT="mops"
  PG_CONTAINER="mops-postgres"
else
  case "$STACK" in
    prod)    PROJECT="mops-prod";    PG_CONTAINER="mops-prod-postgres" ;;
    staging) PROJECT="mops-staging"; PG_CONTAINER="mops-staging-postgres" ;;
    *)
      error "Unknown STACK '${STACK}'. Use: prod or staging."
      exit 1
      ;;
  esac
fi

echo ""
if [[ "$LOCAL_MODE" -eq 1 ]]; then
  info "Secret rotation for: local (.env)"
else
  info "Secret rotation for stack: ${STACK}"
fi
[[ "$DRY_RUN" -eq 1 ]] && warn "DRY RUN — no changes will be made"
echo ""

# Load current secrets
if [[ "$LOCAL_MODE" -eq 1 ]]; then
  source "$LOCAL_ENV_FILE"
else
  source "$SECRETS_FILE"
fi

# ── 1. Rotate LOCAL_JWT_SECRET ────────────────────────────────────────────────
if [[ "$ROTATE_JWT" -eq 1 ]]; then
  NEW_JWT=$(generate_secret 64)
  info "Generated new LOCAL_JWT_SECRET (64 chars)"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    if [[ "$LOCAL_MODE" -eq 1 ]]; then
      sed -i "s|^LOCAL_JWT_SECRET=.*|LOCAL_JWT_SECRET=${NEW_JWT}|" "$LOCAL_ENV_FILE"
      success "✔ Updated LOCAL_JWT_SECRET in ${LOCAL_ENV_FILE}"
    else
      sed -i "s|^LOCAL_JWT_SECRET=.*|LOCAL_JWT_SECRET=${NEW_JWT}|" "$SECRETS_FILE"
      success "✔ Updated LOCAL_JWT_SECRET in ${SECRETS_FILE}"
    fi
    warn "⚠️  All active user sessions have been invalidated."
  else
    warn "[dry-run] would update LOCAL_JWT_SECRET"
  fi
fi

# ── 2. Rotate POSTGRES_PASSWORD ───────────────────────────────────────────────
if [[ "$ROTATE_DB" -eq 1 ]]; then
  NEW_PG_PASS=$(generate_password 24)
  info "Generated new POSTGRES_PASSWORD (24 chars)"

  # Step 2a: Update the running PostgreSQL database
  if docker inspect "$PG_CONTAINER" &>/dev/null; then
    if [[ "$DRY_RUN" -eq 0 ]]; then
      echo "ALTER USER portal PASSWORD '${NEW_PG_PASS}';" | \
        docker exec -i "$PG_CONTAINER" psql -U portal 2>/dev/null
      success "✔ Updated PostgreSQL password in running database"
    else
      warn "[dry-run] would run: ALTER USER portal PASSWORD '***';"
    fi
  else
    warn "Container ${PG_CONTAINER} not running — database password NOT updated."
    warn "You must manually update the DB password after starting the container."
  fi

  # Step 2b: Update the secrets file
  if [[ "$DRY_RUN" -eq 0 ]]; then
    if [[ "$LOCAL_MODE" -eq 1 ]]; then
      sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW_PG_PASS}|" "$LOCAL_ENV_FILE"
      # Also update DATABASE_URL if present
      sed -i "s|postgresql://portal:[^@]*@|postgresql://portal:${NEW_PG_PASS}@|" "$LOCAL_ENV_FILE"
      success "✔ Updated POSTGRES_PASSWORD in ${LOCAL_ENV_FILE}"
    else
      sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW_PG_PASS}|" "$SECRETS_FILE"
      success "✔ Updated POSTGRES_PASSWORD in ${SECRETS_FILE}"
    fi
  else
    warn "[dry-run] would update POSTGRES_PASSWORD"
  fi
fi

# ── 3. Restart backend to pick up new secrets ─────────────────────────────────
if [[ "$DRY_RUN" -eq 0 ]]; then
  info "Restarting backend to apply new secrets..."
  BACKEND_CONTAINER="${PROJECT}-backend"
  if docker inspect "$BACKEND_CONTAINER" &>/dev/null; then
    docker restart "$BACKEND_CONTAINER"
    success "✔ Backend restarted."
  else
    warn "Backend container ${BACKEND_CONTAINER} not found. Redeploy to apply."
  fi
fi

echo ""
success "Secret rotation complete."
info "Verify with: curl -sf http://localhost:$([ \"$STACK\" = staging ] && echo 3001 || echo 3000)/health"
echo ""
