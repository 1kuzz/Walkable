#!/usr/bin/env bash
# scripts/vendor-deps.sh — Cache npm dependencies for offline / air-gapped builds.
#
# Downloads all npm packages into a local cache directory so that future
# `npm ci` calls can work without network access.
#
# Usage:
#   bash scripts/vendor-deps.sh            # populate .npm-cache/ for both frontend and backend
#   bash scripts/vendor-deps.sh --clean    # remove cached packages and start fresh
#
# After running, the cache is stored in .npm-cache/ at the repo root.
# This directory is git-ignored but should be preserved on build agents.
#
# To install from the cache:
#   npm ci --cache .npm-cache --prefer-offline
#   cd backend && npm ci --cache ../.npm-cache --prefer-offline

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[vendor-deps]${NC} $*"; }
success() { echo -e "${GREEN}[vendor-deps]${NC} $*"; }
warn()    { echo -e "${YELLOW}[vendor-deps]${NC} $*"; }
error()   { echo -e "${RED}[vendor-deps]${NC} $*" >&2; }

CACHE_DIR="$REPO_DIR/.npm-cache"

# ─── Parse arguments ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --clean)
      info "Removing existing cache: ${CACHE_DIR}"
      rm -rf "$CACHE_DIR"
      success "Cache cleaned."
      ;;
    -h|--help)
      echo "Usage: $0 [--clean]"
      echo ""
      echo "Downloads all npm packages for frontend and backend into .npm-cache/."
      echo "This enables fully offline npm ci installs."
      exit 0
      ;;
  esac
done

# ─── Load registry.env if present ────────────────────────────────────────────
if [[ -f "$REPO_DIR/registry.env" ]]; then
  set -a; source "$REPO_DIR/registry.env" 2>/dev/null || true; set +a
fi

# Configure npm registry if set
if [[ -n "${NPM_REGISTRY:-}" ]]; then
  npm config set registry "$NPM_REGISTRY"
  info "Using npm registry: ${NPM_REGISTRY}"
fi
if [[ "${NPM_STRICT_SSL:-true}" == "false" ]]; then
  npm config set strict-ssl false
fi

mkdir -p "$CACHE_DIR"

echo ""
echo -e "${BOLD}┌─── MOPS Portal — Vendor npm Dependencies ─────────────────────┐${NC}"
echo ""

# ─── Frontend ─────────────────────────────────────────────────────────────────
info "Caching frontend dependencies …"
cd "$REPO_DIR"
npm ci --cache "$CACHE_DIR" --prefer-offline --ignore-scripts 2>&1 | tail -5
success "  ✔ Frontend packages cached."

# ─── Backend ──────────────────────────────────────────────────────────────────
info "Caching backend dependencies …"
cd "$REPO_DIR/backend"
npm ci --cache "$CACHE_DIR" --prefer-offline --ignore-scripts 2>&1 | tail -5
TOTAL_COUNT=$(find "$CACHE_DIR" -name '*.tgz' 2>/dev/null | wc -l | tr -d ' ')
success "  ✔ Backend packages cached. Total: ${TOTAL_COUNT} packages in cache."

echo ""
echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
CACHE_SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
success "Cache directory: ${CACHE_DIR} (${CACHE_SIZE})"
echo ""
info "To install from this cache (offline):"
echo "  npm ci --cache .npm-cache --prefer-offline"
echo "  cd backend && npm ci --cache ../.npm-cache --prefer-offline"
echo ""
info "To use in Docker builds:"
echo "  docker build --build-arg NPM_CACHE=.npm-cache ."
echo ""
