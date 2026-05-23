#!/usr/bin/env bash
# scripts/bootstrap-agent.sh — Idempotent build agent provisioning for MOPS Portal.
#
# Usage:
#   sudo bash scripts/bootstrap-agent.sh                # interactive
#   sudo SETUP_NON_INTERACTIVE=1 bash scripts/bootstrap-agent.sh  # unattended
#   sudo bash scripts/bootstrap-agent.sh --offline      # validate only, no external downloads
#
# What it does:
#   1. Installs required tools: Node.js 20.x, Docker, Docker Compose v2, git, curl, openssl
#   2. Creates /opt/mops/ directory structure with secure permissions
#   3. Copies deploy/env.example as template files
#   4. Prompts for required secrets (or accepts them via env vars for automation)
#   5. Validates everything with doctor-equivalent checks
#
# Offline mode (--offline or SETUP_OFFLINE=1):
#   Skips all package installations from external sources.
#   Only validates that prerequisites are already installed and configures /opt/mops.
#   Use this in restricted networks where tools are pre-installed by IT.
#
# Environment variables (for non-interactive mode):
#   SETUP_NON_INTERACTIVE=1       — skip all prompts, use env vars or defaults
#   SETUP_OFFLINE=1               — skip external installs, validate-only mode
#   AGENT_USER                    — OS user for the build agent (default: current user)
#   ARTIFACTORY_URL               — corporate Artifactory base URL
#                                   (default: https://repository.avp.ru)
#   DOCKER_COMPOSE_DEB_VERSION    — docker-compose deb version to install from Artifactory
#                                   (default: 2.40.3-3)
#   NPM_USER                      — Artifactory npm username
#   NPM_PASSWORD                  — Artifactory npm password
#   NPM_REGISTRY                  — corporate npm registry URL
#                                   (default: ${ARTIFACTORY_URL}/artifactory/api/npm/r-npm/)
#   POSTGRES_PASSWORD              — PostgreSQL password (auto-generated if empty)
#   LOCAL_JWT_SECRET               — JWT signing secret (auto-generated if empty)
#   VITE_ADMIN_USERS               — Comma-separated admin logins
#   VITE_OIDC_CLIENT_ID            — OIDC client ID

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[bootstrap]${NC} $*"; }
success() { echo -e "${GREEN}[bootstrap]${NC} $*"; }
warn()    { echo -e "${YELLOW}[bootstrap]${NC} $*"; }
error()   { echo -e "${RED}[bootstrap]${NC} $*" >&2; }

NON_INTERACTIVE="${SETUP_NON_INTERACTIVE:-0}"
AGENT_USER="${AGENT_USER:-$(whoami)}"
OFFLINE="${SETUP_OFFLINE:-0}"
ARTIFACTORY_URL="${ARTIFACTORY_URL:-https://repository.avp.ru}"
DOCKER_COMPOSE_DEB_VERSION="${DOCKER_COMPOSE_DEB_VERSION:-2.40.3-3}"

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --offline) OFFLINE=1 ;;
  esac
done

# ─── Secret generation helpers ────────────────────────────────────────────────
generate_secret() {
  local chars="${1:-64}"
  local bytes=$(( (chars + 1) / 2 ))
  if command -v openssl &>/dev/null; then
    openssl rand -hex "$bytes" | head -c "$chars"
  else
    LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c "$chars"
  fi
}

generate_password() {
  local chars="${1:-24}"
  if command -v openssl &>/dev/null; then
    openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c "$chars"
  else
    LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "$chars"
  fi
}

prompt_or_default() {
  local varname="$1" prompt_text="$2" default="${3:-}"
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    eval "$varname=\"\${$varname:-$default}\""
    return
  fi
  local current="${!varname:-$default}"
  if [[ -n "$current" ]]; then
    read -rp "  $prompt_text [$current]: " input
    eval "$varname=\"\${input:-$current}\""
  else
    read -rp "  $prompt_text: " input
    eval "$varname=\"\${input:-$default}\""
  fi
}

echo ""
echo -e "${BOLD}┌─── MOPS Portal — Build Agent Bootstrap ─────────────────────────┐${NC}"
echo ""

# ── 1. Check running as root (or with sudo) ──────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  error "This script must be run as root or with sudo."
  echo "  Usage: sudo bash scripts/bootstrap-agent.sh"
  exit 1
fi

# ── 2. Detect OS ──────────────────────────────────────────────────────────────
info "Detecting operating system..."
if [[ -f /etc/os-release ]]; then
  source /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-}"
  success "Detected: ${PRETTY_NAME:-$OS_ID}"
else
  OS_ID="unknown"
  warn "Could not detect OS. Assuming Debian/Ubuntu-compatible."
fi

# ── 3. Install Node.js 20.x ──────────────────────────────────────────────────
info "Checking Node.js..."
INSTALL_NODE=0
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)
  if (( MAJOR >= 20 )); then
    success "Node.js $NODE_VER — OK"
  else
    warn "Node.js $NODE_VER found, but >= 20.x required."
    INSTALL_NODE=1
  fi
else
  INSTALL_NODE=1
fi

if [[ "$INSTALL_NODE" -eq 1 ]]; then
  if [[ "$OFFLINE" -eq 1 ]]; then
    error "Node.js >= 20 is required but not installed."
    error "Offline mode: cannot install from external sources."
    error "Install Node.js manually, then re-run this script."
    exit 1
  fi
  info "Installing Node.js 20.x..."
  case "$OS_ID" in
    ubuntu|debian)
      if command -v curl &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      else
        apt-get update -qq && apt-get install -y -qq curl
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      fi
      apt-get install -y -qq nodejs
      ;;
    centos|rhel|fedora|rocky|almalinux)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      yum install -y nodejs || dnf install -y nodejs
      ;;
    *)
      error "Unsupported OS for automatic Node.js installation: $OS_ID"
      error "Install Node.js >= 20 manually: https://nodejs.org"
      exit 1
      ;;
  esac
  success "Node.js $(node -v) installed."
fi

# ── 4. Install Docker ─────────────────────────────────────────────────────────
info "Checking Docker..."
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "")
  if [[ -n "$DOCKER_VER" ]]; then
    success "Docker v${DOCKER_VER} — OK (daemon running)"
  else
    warn "Docker installed but daemon not running."
    info "Starting Docker..."
    systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
    systemctl enable docker 2>/dev/null || true
  fi
else
  if [[ "$OFFLINE" -eq 1 ]]; then
    error "Docker is required but not installed."
    error "Offline mode: cannot install from external sources."
    error "Install Docker manually, then re-run this script."
    exit 1
  fi
  info "Installing Docker..."
  case "$OS_ID" in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq apt-transport-https ca-certificates gnupg lsb-release
      curl -fsSL https://download.docker.com/linux/${OS_ID}/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null || true
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/${OS_ID} $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    centos|rhel|fedora|rocky|almalinux)
      yum install -y yum-utils 2>/dev/null || dnf install -y dnf-utils 2>/dev/null || true
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || true
      yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || \
        dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
      ;;
    *)
      error "Unsupported OS for automatic Docker installation: $OS_ID"
      error "Install Docker manually: https://docs.docker.com/get-docker/"
      exit 1
      ;;
  esac
  systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
  systemctl enable docker 2>/dev/null || true
  success "Docker installed and started."
fi

# Add agent user to docker group
if id "$AGENT_USER" &>/dev/null; then
  if ! id -nG "$AGENT_USER" | grep -qw docker; then
    info "Adding ${AGENT_USER} to docker group..."
    usermod -aG docker "$AGENT_USER"
    success "Added ${AGENT_USER} to docker group (re-login required)."
  fi
fi

# ── 4a. Install docker-compose from corporate Artifactory ──────────────────────
info "Checking docker-compose..."
COMPOSE_INSTALLED=0
if docker compose version &>/dev/null 2>&1; then
  success "docker compose (v2 plugin) $(docker compose version --short 2>/dev/null) — OK"
  COMPOSE_INSTALLED=1
elif command -v docker-compose &>/dev/null; then
  success "docker-compose $(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') — OK"
  COMPOSE_INSTALLED=1
fi

if [[ "$COMPOSE_INSTALLED" -eq 0 ]]; then
  if [[ "$OFFLINE" -eq 1 ]]; then
    error "docker-compose is not installed."
    error "Offline mode: install it manually from the corporate Artifactory:"
    error "  ${ARTIFACTORY_URL}/artifactory/r-deb-debian-cache/pool/main/d/docker-compose/docker-compose_${DOCKER_COMPOSE_DEB_VERSION}_amd64.deb"
    exit 1
  fi
  case "$OS_ID" in
    ubuntu|debian)
      info "Installing docker-compose ${DOCKER_COMPOSE_DEB_VERSION} from ${ARTIFACTORY_URL}..."
      _DC_DEB_URL="${ARTIFACTORY_URL}/artifactory/r-deb-debian-cache/pool/main/d/docker-compose/docker-compose_${DOCKER_COMPOSE_DEB_VERSION}_amd64.deb"
      _DC_TMP="$(mktemp /tmp/docker-compose-XXXXXX.deb)"
      if curl -fsSL -o "$_DC_TMP" "$_DC_DEB_URL"; then
        dpkg -i "$_DC_TMP"
        rm -f "$_DC_TMP"
        success "docker-compose $(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') installed from Artifactory."
      else
        rm -f "$_DC_TMP"
        error "Failed to download docker-compose from: ${_DC_DEB_URL}"
        error "Check that ${ARTIFACTORY_URL} is reachable and try again."
        exit 1
      fi
      ;;
    *)
      warn "docker-compose deb installation only supported on Debian/Ubuntu."
      warn "Install docker-compose >= 2 manually from:"
      warn "  ${ARTIFACTORY_URL}/artifactory/r-deb-debian-cache/pool/main/d/docker-compose/docker-compose_${DOCKER_COMPOSE_DEB_VERSION}_amd64.deb"
      ;;
  esac
fi

# ── 5. Install additional tools ───────────────────────────────────────────────
PKGS_TO_INSTALL=()
command -v git     &>/dev/null || PKGS_TO_INSTALL+=(git)
command -v curl    &>/dev/null || PKGS_TO_INSTALL+=(curl)
command -v openssl &>/dev/null || PKGS_TO_INSTALL+=(openssl)
command -v make    &>/dev/null || PKGS_TO_INSTALL+=(make)

if [[ ${#PKGS_TO_INSTALL[@]} -gt 0 ]]; then
  if [[ "$OFFLINE" -eq 1 ]]; then
    error "Missing tools: ${PKGS_TO_INSTALL[*]}"
    error "Offline mode: cannot install from external sources."
    error "Install these tools manually, then re-run this script."
    exit 1
  fi
  info "Installing: ${PKGS_TO_INSTALL[*]}"
  case "$OS_ID" in
    ubuntu|debian)
      apt-get install -y -qq "${PKGS_TO_INSTALL[@]}"
      ;;
    centos|rhel|fedora|rocky|almalinux)
      yum install -y "${PKGS_TO_INSTALL[@]}" 2>/dev/null || dnf install -y "${PKGS_TO_INSTALL[@]}" 2>/dev/null || true
      ;;
  esac
fi
success "All required tools available."

# ── 6. Create /opt/mops directory structure ───────────────────────────────────
info "Setting up /opt/mops/..."
mkdir -p /opt/mops
chmod 700 /opt/mops

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# ── 7. Gather secrets ─────────────────────────────────────────────────────────
echo ""
info "Configuring secrets..."

prompt_or_default NPM_USER "Artifactory npm username" "svc_mops_npm"
prompt_or_default NPM_PASSWORD "Artifactory npm password" ""
prompt_or_default VITE_ADMIN_USERS "Admin users (comma-separated DOMAIN\\login)" "KL\\svc_portal_admin"
prompt_or_default VITE_OIDC_CLIENT_ID "OIDC client ID" ""
prompt_or_default CORS_ORIGIN "CORS origin (portal public URL)" "https://mops.kaspersky.com"

# Auto-generate secrets if not provided
if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  POSTGRES_PASSWORD=$(generate_password 24)
  info "Auto-generated POSTGRES_PASSWORD (24 chars)"
fi
if [[ -z "${LOCAL_JWT_SECRET:-}" ]]; then
  LOCAL_JWT_SECRET=$(generate_secret 64)
  info "Auto-generated LOCAL_JWT_SECRET (64 chars)"
fi

# ── 8. Write secrets file ─────────────────────────────────────────────────────
# Validate critical secrets are not empty
MISSING_SECRETS=()
[[ -z "${NPM_USER:-}" ]]          && MISSING_SECRETS+=("NPM_USER")
[[ -z "${NPM_PASSWORD:-}" ]]      && MISSING_SECRETS+=("NPM_PASSWORD")
[[ -z "${POSTGRES_PASSWORD:-}" ]]  && MISSING_SECRETS+=("POSTGRES_PASSWORD")
[[ -z "${LOCAL_JWT_SECRET:-}" ]]   && MISSING_SECRETS+=("LOCAL_JWT_SECRET")

if [[ ${#MISSING_SECRETS[@]} -gt 0 ]]; then
  warn "The following secrets are empty: ${MISSING_SECRETS[*]}"
  warn "The secrets file will be written but you must fill in the missing values."
fi

info "Writing /opt/mops/.secrets..."
cat > /opt/mops/.secrets << SECRETS_EOF
# MOPS Portal — Shared secrets (managed by bootstrap-agent.sh)
# Generated: $(date -Iseconds)

NPM_USER=${NPM_USER}
NPM_PASSWORD=${NPM_PASSWORD}
OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
LOCAL_JWT_SECRET=${LOCAL_JWT_SECRET}
SECRETS_EOF
chmod 600 /opt/mops/.secrets

# ── 8a. Configure npm registry for agent user ──────────────────────────────────
NPM_REGISTRY_URL="${NPM_REGISTRY:-${ARTIFACTORY_URL}/artifactory/api/npm/r-npm/}"
AGENT_HOME=$(getent passwd "$AGENT_USER" | cut -d: -f6 2>/dev/null || echo "/home/${AGENT_USER}")

if [[ -n "${NPM_USER:-}" && -n "${NPM_PASSWORD:-}" ]]; then
  info "Configuring npm registry for ${AGENT_USER}: ${NPM_REGISTRY_URL}"
  _NPM_AUTH_B64=$(echo -n "${NPM_USER}:${NPM_PASSWORD}" | base64)
  _REG_HOST=$(echo "$NPM_REGISTRY_URL" | sed 's|https://||' | sed 's|/$||')
  cat > "${AGENT_HOME}/.npmrc" << NPMRC_EOF
registry=${NPM_REGISTRY_URL}
//${_REG_HOST}/:_auth=${_NPM_AUTH_B64}
strict-ssl=false
prefer-offline=true
fund=false
update-notifier=false
NPMRC_EOF
  chown "${AGENT_USER}:${AGENT_USER}" "${AGENT_HOME}/.npmrc" 2>/dev/null || true
  chmod 600 "${AGENT_HOME}/.npmrc"
  unset _NPM_AUTH_B64 _REG_HOST
  success "npm configured: registry=${NPM_REGISTRY_URL}"
  # Note: strict-ssl=false is needed because the corporate Artifactory uses a self-signed
  # certificate. The preferred alternative is to set NODE_EXTRA_CA_CERTS to the corporate
  # CA PEM file in registry.env — see registry.env.example for details.
else
  warn "NPM_USER or NPM_PASSWORD not set — skipping npm registry configuration."
  warn "Pipeline npm commands will use ${AGENT_HOME}/.npmrc or npm defaults."
fi

# ── 9. Write per-environment config files ─────────────────────────────────────
for ENV_NAME in prod staging; do
  ENV_FILE="/opt/mops/${ENV_NAME}.env"
  if [[ -f "$ENV_FILE" ]]; then
    warn "${ENV_FILE} already exists — not overwriting."
  else
    info "Writing ${ENV_FILE}..."
    cat > "$ENV_FILE" << ENV_EOF
# MOPS Portal — ${ENV_NAME} configuration (managed by bootstrap-agent.sh)
# Generated: $(date -Iseconds)

VITE_ADMIN_USERS=${VITE_ADMIN_USERS}
VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID:-your_${ENV_NAME}_client_id_here}
VITE_OIDC_ADMIN_ROLES=
CORS_ORIGIN=${CORS_ORIGIN}
CONFLUENCE_USERNAME=
CONFLUENCE_PASSWORD=
CONFLUENCE_PAT=
ENV_EOF
    chmod 600 "$ENV_FILE"
  fi
done

# Set ownership
chown -R "${AGENT_USER}:${AGENT_USER}" /opt/mops/ 2>/dev/null || true

# ── 10. Validate ──────────────────────────────────────────────────────────────
echo ""
info "Running validation checks..."

PASS=0; FAIL=0
_ok()   { printf "  ${GREEN}✅  %-30s${NC}  %s\n" "$1" "${2:-}"; PASS=$((PASS+1)); }
_fail() { printf "  ${RED}❌  %-30s${NC}  %s\n" "$1" "${2:-}"; FAIL=$((FAIL+1)); }

command -v node    &>/dev/null && _ok "Node.js"   "$(node -v)"     || _fail "Node.js"   "not installed"
command -v npm     &>/dev/null && _ok "npm"        "v$(npm -v)"     || _fail "npm"        "not installed"
command -v docker  &>/dev/null && _ok "Docker"     "$(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" || _fail "Docker" "not installed"
command -v git     &>/dev/null && _ok "git"        "$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" || _fail "git" "not installed"
command -v curl    &>/dev/null && _ok "curl"       "installed"      || _fail "curl" "not installed"
command -v openssl &>/dev/null && _ok "openssl"    "installed"      || _fail "openssl" "not installed"

[[ -f /opt/mops/.secrets ]]    && _ok "/opt/mops/.secrets"   "present" || _fail "/opt/mops/.secrets" "missing"
[[ -f /opt/mops/prod.env ]]    && _ok "/opt/mops/prod.env"   "present" || _fail "/opt/mops/prod.env" "missing"
[[ -f /opt/mops/staging.env ]] && _ok "/opt/mops/staging.env" "present" || _fail "/opt/mops/staging.env" "missing"

if docker compose version &>/dev/null 2>&1; then
  _ok "Docker Compose v2" "$(docker compose version --short 2>/dev/null)"
elif command -v docker-compose &>/dev/null; then
  _ok "Docker Compose v1" "$(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
else
  _fail "Docker Compose" "not found"
fi

echo ""
echo -e "${BOLD}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
printf "  %b%d passed%b  |  %b%d failed%b\n" "$GREEN" "$PASS" "$NC" "$RED" "$FAIL" "$NC"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  error "Bootstrap completed with ${FAIL} issue(s). Review above."
  exit 1
fi

success "Build agent bootstrap complete!"
echo ""
info "Next steps:"
info "  1. Edit /opt/mops/prod.env with production OIDC client ID"
info "  2. Edit /opt/mops/staging.env with staging OIDC client ID"
info "  3. Clone the repository and run the pipeline"
echo ""
