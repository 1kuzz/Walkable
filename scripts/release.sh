#!/usr/bin/env bash
# scripts/release.sh — Automated version bump, changelog generation, and tagging.
#
# Usage:
#   bash scripts/release.sh patch    # 1.5.0 → 1.5.1
#   bash scripts/release.sh minor    # 1.5.0 → 1.6.0
#   bash scripts/release.sh major    # 1.5.0 → 2.0.0
#   bash scripts/release.sh --dry-run patch   # preview changes
#
# What it does:
#   1. Reads the current version from VERSION file
#   2. Bumps version according to semver level (patch/minor/major)
#   3. Updates VERSION file and package.json files
#   4. Generates a CHANGELOG entry from conventional commits since the last tag
#   5. Creates a git commit + tag
#   6. Prints push instructions (does not push automatically)
#
# Requires: git with conventional commit history

set -euo pipefail

DRY_RUN=0
BUMP_LEVEL=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    patch|minor|major) BUMP_LEVEL="$arg" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//' | head -18
      exit 0
      ;;
  esac
done

if [[ -z "$BUMP_LEVEL" ]]; then
  echo "Usage: $0 [--dry-run] patch|minor|major"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# ─── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[release]${NC} $*"; }
success() { echo -e "${GREEN}[release]${NC} $*"; }
warn()    { echo -e "${YELLOW}[release]${NC} $*"; }

# ── 1. Read current version ──────────────────────────────────────────────────
CURRENT_VERSION=$(cat VERSION 2>/dev/null | tr -d '[:space:]')
if [[ -z "$CURRENT_VERSION" ]]; then
  echo "ERROR: VERSION file not found or empty."
  exit 1
fi

IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"

# ── 2. Calculate new version ──────────────────────────────────────────────────
case "$BUMP_LEVEL" in
  major) NEW_VERSION="$((V_MAJOR + 1)).0.0" ;;
  minor) NEW_VERSION="${V_MAJOR}.$((V_MINOR + 1)).0" ;;
  patch) NEW_VERSION="${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))" ;;
esac

echo ""
echo -e "${BOLD}┌─── MOPS Portal — Release ────────────────────────────────────────┐${NC}"
echo ""
info "Current version: v${CURRENT_VERSION}"
info "Bump level:      ${BUMP_LEVEL}"
info "New version:     v${NEW_VERSION}"
[[ "$DRY_RUN" -eq 1 ]] && warn "DRY RUN — no changes will be made"
echo ""

# ── 3. Check for uncommitted changes ─────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Uncommitted changes detected. Commit or stash before releasing."
  git status --short
  exit 1
fi

# ── 4. Generate changelog entry from conventional commits ─────────────────────
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$LAST_TAG" ]]; then
  RANGE="${LAST_TAG}..HEAD"
else
  RANGE="HEAD"
fi

info "Generating changelog from commits since ${LAST_TAG:-beginning}..."

FEATURES=""
FIXES=""
BREAKING=""
OTHER=""

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  case "$line" in
    feat*)   FEATURES="${FEATURES}\n- ${line}" ;;
    fix*)    FIXES="${FIXES}\n- ${line}" ;;
    *!:*|*BREAKING*) BREAKING="${BREAKING}\n- ${line}" ;;
    *)       OTHER="${OTHER}\n- ${line}" ;;
  esac
done < <(git log "$RANGE" --pretty=format:'%s' 2>/dev/null || true)

CHANGELOG_ENTRY="## [${NEW_VERSION}] — $(date +%Y-%m-%d)\n"
[[ -n "$BREAKING" ]] && CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n### ⚠ Breaking Changes\n${BREAKING}\n"
[[ -n "$FEATURES" ]] && CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n### Features\n${FEATURES}\n"
[[ -n "$FIXES" ]]    && CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n### Bug Fixes\n${FIXES}\n"
[[ -n "$OTHER" ]]    && CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n### Other Changes\n${OTHER}\n"

echo -e "$CHANGELOG_ENTRY"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  warn "[dry-run] Would update: VERSION, package.json, backend/package.json, CHANGELOG.md"
  warn "[dry-run] Would commit and tag as v${NEW_VERSION}"
  echo ""
  echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
  exit 0
fi

# ── 5. Update version files ──────────────────────────────────────────────────
info "Updating VERSION file..."
echo "$NEW_VERSION" > VERSION

info "Updating package.json..."
sed -i "s|\"version\": \"${CURRENT_VERSION}\"|\"version\": \"${NEW_VERSION}\"|" package.json

info "Updating backend/package.json..."
sed -i "s|\"version\": \"${CURRENT_VERSION}\"|\"version\": \"${NEW_VERSION}\"|" backend/package.json

# ── 6. Prepend changelog entry ────────────────────────────────────────────────
info "Updating CHANGELOG.md..."
if [[ -f CHANGELOG.md ]]; then
  # Insert after the first line (title)
  TEMP_FILE=$(mktemp)
  {
    head -1 CHANGELOG.md
    echo ""
    echo -e "$CHANGELOG_ENTRY"
    tail -n +2 CHANGELOG.md
  } > "$TEMP_FILE"
  mv "$TEMP_FILE" CHANGELOG.md
else
  echo -e "# Changelog\n\n${CHANGELOG_ENTRY}" > CHANGELOG.md
fi

# ── 7. Commit and tag ────────────────────────────────────────────────────────
info "Creating release commit..."
git add VERSION package.json backend/package.json CHANGELOG.md
git commit -m "chore(release): v${NEW_VERSION}"

info "Creating git tag v${NEW_VERSION}..."
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

echo ""
echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
success "✔ Release v${NEW_VERSION} prepared!"
echo ""
info "Next steps:"
info "  1. Review the commit: git log --oneline -1"
info "  2. Push to trigger deploy: git push origin main --follow-tags"
echo ""
