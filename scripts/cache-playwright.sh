#!/usr/bin/env bash
# scripts/cache-playwright.sh — Pre-download Playwright browsers for offline use.
#
# Run this on a machine with internet access to cache Playwright browser binaries.
# Then copy the cache directory to air-gapped build agents.
#
# Usage:
#   bash scripts/cache-playwright.sh                     # download to default cache dir
#   PLAYWRIGHT_BROWSERS_PATH=/opt/pw bash scripts/cache-playwright.sh  # custom path
#
# The cache is stored in:
#   - Default: ~/.cache/ms-playwright/
#   - Custom: $PLAYWRIGHT_BROWSERS_PATH
#
# To use the cache on a build agent:
#   export PLAYWRIGHT_BROWSERS_PATH=/path/to/cache
#   npx playwright install chromium    # will use cached binaries

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[playwright]${NC} $*"; }
success() { echo -e "${GREEN}[playwright]${NC} $*"; }
warn()    { echo -e "${YELLOW}[playwright]${NC} $*"; }
error()   { echo -e "${RED}[playwright]${NC} $*" >&2; }

# ─── Load registry.env if present ────────────────────────────────────────────
if [[ -f "$REPO_DIR/registry.env" ]]; then
  set -a; source "$REPO_DIR/registry.env" 2>/dev/null || true; set +a
fi

# Configure Playwright download host if set
if [[ -n "${PLAYWRIGHT_DOWNLOAD_HOST:-}" ]]; then
  export PLAYWRIGHT_DOWNLOAD_HOST
  info "Using Playwright mirror: ${PLAYWRIGHT_DOWNLOAD_HOST}"
fi

CACHE_DIR="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"
export PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR"

echo ""
echo -e "${BOLD}┌─── MOPS Portal — Cache Playwright Browsers ───────────────────┐${NC}"
echo ""

# Ensure Playwright is installed as a dependency
if [[ ! -f node_modules/.package-lock.json ]]; then
  info "Installing npm dependencies first …"
  npm ci --prefer-offline --ignore-scripts 2>&1 | tail -3
fi

# Download browsers
info "Downloading Playwright browsers to: ${CACHE_DIR}"
npx playwright install --with-deps chromium 2>/dev/null || npx playwright install chromium

echo ""
CACHE_SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
success "Playwright browsers cached: ${CACHE_DIR} (${CACHE_SIZE})"
echo ""
info "To use on another machine:"
echo "  1. Copy ${CACHE_DIR} to the target machine"
echo "  2. Set: export PLAYWRIGHT_BROWSERS_PATH=/path/to/cache"
echo "  3. Run E2E tests normally — Playwright will find cached browsers"
echo ""
if [[ -n "${PLAYWRIGHT_DOWNLOAD_HOST:-}" ]]; then
  info "Mirror: ${PLAYWRIGHT_DOWNLOAD_HOST}"
else
  info "No PLAYWRIGHT_DOWNLOAD_HOST set — downloaded from Microsoft CDN."
  info "Set PLAYWRIGHT_DOWNLOAD_HOST in registry.env for corporate networks."
fi

echo ""
echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
