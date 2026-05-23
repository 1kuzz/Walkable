#!/usr/bin/env bash
# scripts/pull-images.sh — Pre-pull all Docker images needed by the MOPS Portal.
#
# Run this once on a machine with registry access to warm the local Docker cache.
# Subsequent docker-compose builds will use cached images — no network needed.
#
# Usage:
#   bash scripts/pull-images.sh                          # pull all images
#   bash scripts/pull-images.sh --push REGISTRY          # pull + re-tag + push to internal registry
#   DOCKER_REGISTRY=myregistry/ bash scripts/pull-images.sh  # pull from internal mirror
#
# Images are read from docker-compose*.yml and Dockerfile automatically.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[pull-images]${NC} $*"; }
success() { echo -e "${GREEN}[pull-images]${NC} $*"; }
warn()    { echo -e "${YELLOW}[pull-images]${NC} $*"; }
error()   { echo -e "${RED}[pull-images]${NC} $*" >&2; }

# ─── Load registry.env if present ────────────────────────────────────────────
if [[ -f "$REPO_DIR/registry.env" ]]; then
  set -a; source "$REPO_DIR/registry.env" 2>/dev/null || true; set +a
fi
if [[ -f "$REPO_DIR/.env" ]]; then
  # Only pick up DOCKER_REGISTRY from .env if not already set
  _dr=$(grep '^DOCKER_REGISTRY=' "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
  DOCKER_REGISTRY="${DOCKER_REGISTRY:-$_dr}"
fi

REGISTRY_PREFIX="${DOCKER_REGISTRY:-}"

# ─── Parse arguments ─────────────────────────────────────────────────────────
PUSH_TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      shift
      PUSH_TARGET="${1:?Usage: --push REGISTRY_URL}"
      PUSH_TARGET="${PUSH_TARGET%/}/"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--push REGISTRY_URL]"
      echo ""
      echo "Pulls all Docker images used by MOPS Portal."
      echo "Optionally re-tags and pushes them to an internal registry."
      echo ""
      echo "Environment variables:"
      echo "  DOCKER_REGISTRY   Prefix for image pulls (e.g. myregistry.example.com/)"
      exit 0
      ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

# ─── Image list ───────────────────────────────────────────────────────────────
# All base images referenced across Dockerfiles and compose files.
IMAGES=(
  "node:20-alpine"
  "nginx:1.27-alpine"
  "postgres:16-alpine"
)

# Optional development images
DEV_IMAGES=(
  "ghcr.io/navikt/mock-oauth2-server:2.1.10"
  "mcr.microsoft.com/devcontainers/typescript-node:22"
)

# ─── Pull ─────────────────────────────────────────────────────────────────────
PULLED=0
FAILED=0

pull_image() {
  local img="$1"
  local full="${REGISTRY_PREFIX}${img}"
  info "Pulling ${full} …"
  if docker pull "$full" --quiet >/dev/null 2>&1; then
    success "  ✔ ${full}"
    ((PULLED++))

    # Re-tag and push if requested
    if [[ -n "$PUSH_TARGET" ]]; then
      local target="${PUSH_TARGET}${img}"
      docker tag "$full" "$target"
      if docker push "$target" --quiet >/dev/null 2>&1; then
        success "  ✔ pushed → ${target}"
      else
        warn "  ⚠ push failed → ${target}"
      fi
    fi
  else
    warn "  ✘ Failed to pull ${full}"
    ((FAILED++))
  fi
}

echo ""
echo -e "${BOLD}┌─── MOPS Portal — Pull Docker Images ───────────────────────────┐${NC}"
echo ""

echo -e "  ${CYAN}§ Core images (required)${NC}"
for img in "${IMAGES[@]}"; do
  pull_image "$img"
done

echo ""
echo -e "  ${CYAN}§ Development images (optional)${NC}"
for img in "${DEV_IMAGES[@]}"; do
  pull_image "$img"
done

echo ""
echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
printf "  %b%d pulled%b  |  %b%d failed%b\n" \
  "$GREEN" "$PULLED" "$NC"  "$RED" "$FAILED" "$NC"
echo ""

if [[ "$FAILED" -gt 0 ]]; then
  warn "Some images could not be pulled. Check your network or DOCKER_REGISTRY setting."
  exit 1
fi

success "All images cached locally. Docker builds will use the local cache."
