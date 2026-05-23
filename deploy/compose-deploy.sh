#!/usr/bin/env bash
# deploy/compose-deploy.sh — Docker Compose-based deploy with rollback.
#
# Usage:
#   PORTAL_IMAGE=mops-portal:staging-123 BACKEND_IMAGE=mops-backend:staging-123 \
#     bash deploy/compose-deploy.sh staging
#
# Required env vars (sourced by caller before invoking):
#   PORTAL_IMAGE, BACKEND_IMAGE — image tags to deploy
#   POSTGRES_PASSWORD            — DB password
#   VITE_OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, LOCAL_JWT_SECRET, CORS_ORIGIN — backend config
#   VITE_ADMIN_USERS             — optional comma-separated admin logins
#
# The script:
#   1. Resolves compose file and health-check port by ENV
#   2. Saves current images as rollback point
#   3. Migrates any bare docker-run containers into compose (first-time only)
#   4. Starts postgres (idempotent) then force-recreates backend + portal
#   5. Health-checks: postgres (12 × 5s), backend (22 × 5s), portal (20 × 5s)
#   6. On failure: rolls back to saved images, exits 1
#   7. Cleans up old images (keeps last 3 per service)

set -euo pipefail

ENV="${1:-}"
if [ "$ENV" != "staging" ] && [ "$ENV" != "prod" ]; then
  echo "Usage: $0 staging|prod" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${REPO_DIR}/docker-compose.${ENV}.yml"
PROJECT="mops-${ENV}"

# Auto-detect docker compose v2 plugin or docker-compose v1
if docker compose version &>/dev/null 2>&1; then
  _COMPOSE_BIN="docker compose"
elif command -v docker-compose &>/dev/null; then
  _COMPOSE_BIN="docker-compose"
else
  echo "[deploy] ERROR: Docker Compose not found." >&2
  echo "[deploy] Install from the corporate Artifactory deb (see scripts/bootstrap-agent.sh for the canonical version):" >&2
  echo "[deploy]   sudo bash scripts/bootstrap-agent.sh" >&2
  exit 1
fi
echo "[deploy] Using compose: ${_COMPOSE_BIN}"

# Derive health-check port from compose file
if [ "$ENV" = "staging" ]; then
  HEALTH_PORT=3001
else
  HEALTH_PORT=3000
fi

TAG_PREFIX="${ENV}-"

: "${PORTAL_IMAGE:?PORTAL_IMAGE must be set}"
: "${BACKEND_IMAGE:?BACKEND_IMAGE must be set}"

COMPOSE_CMD="${_COMPOSE_BIN} -f ${COMPOSE_FILE} --project-name ${PROJECT}"

# ── 1. Save rollback point ────────────────────────────────────────────────────
OLD_PORTAL=$(docker inspect --format='{{.Config.Image}}' "${PROJECT}-portal" 2>/dev/null || echo "")
OLD_BACKEND=$(docker inspect --format='{{.Config.Image}}' "${PROJECT}-backend" 2>/dev/null || echo "")
echo "[deploy] Rolling from: portal=${OLD_PORTAL:-<none>} backend=${OLD_BACKEND:-<none>}"
echo "[deploy] Rolling to:   portal=${PORTAL_IMAGE} backend=${BACKEND_IMAGE}"

# ── 2. One-time migration: adopt bare docker-run containers into compose ──────
# If a container exists but lacks our compose project label, stop+rm it so
# compose can take ownership. Volumes are untouched — data is preserved.
for SVC in postgres backend portal; do
  CNAME="${PROJECT}-${SVC}"
  LABEL=$(docker inspect "$CNAME" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || echo "")
  if docker inspect "$CNAME" &>/dev/null && [ "$LABEL" != "$PROJECT" ]; then
    echo "[deploy] Migrating bare container ${CNAME} into compose (stop+rm, volume kept)"
    docker stop "$CNAME" 2>/dev/null || true
    docker rm   "$CNAME" 2>/dev/null || true
  fi
done

# ── 3+4. Stop all containers then start fresh ────────────────────────────────
# docker-compose v1 crashes with KeyError: 'ContainerConfig' on ANY recreate
# path (even --no-recreate) when the Docker Engine image format is newer.
# Fix: stop+rm ALL three containers so compose always does a fresh create,
# never hitting the recreate_container code path.
# Data lives in named volumes — postgres container removal is safe.
echo "[deploy] Stopping all containers before redeploy..."
docker stop "${PROJECT}-backend" "${PROJECT}-portal" "${PROJECT}-postgres" 2>/dev/null || true
docker rm   "${PROJECT}-backend" "${PROJECT}-portal" "${PROJECT}-postgres" 2>/dev/null || true

echo "[deploy] Starting full stack..."

# Source the environment-specific secrets/config file so that all variables
# defined there (e.g. CONFLUENCE_ROOT_PAGE_ID) are exported to the compose process.
ENV_FILE="/opt/mops/${ENV}.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
SECRETS_FILE="/opt/mops/.secrets"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

# ── Registry login ─────────────────────────────────────────────────────────
# When DOCKER_REGISTRY is set the compose files pull postgres from the
# corporate mirror. The Docker daemon must be authenticated first.
# Credentials come from DOCKER_REGISTRY_USER / DOCKER_REGISTRY_PASSWORD;
# if those are absent, the Artifactory NPM credentials (NPM_USER /
# NPM_PASSWORD) are reused — they grant access to the same registry.
if [[ -n "${DOCKER_REGISTRY:-}" ]]; then
  _reg_host="${DOCKER_REGISTRY%%/*}"
  _reg_user="${DOCKER_REGISTRY_USER:-${NPM_USER:-}}"
  _reg_pass="${DOCKER_REGISTRY_PASSWORD:-${NPM_PASSWORD:-}}"
  if [[ -n "$_reg_user" && -n "$_reg_pass" ]]; then
    echo "[deploy] Logging in to Docker registry: ${_reg_host}"
    # Disable xtrace temporarily so the password does not appear in pipeline
    # logs if this script is invoked with `bash -x` or `set -x`.
    { set +x; echo "$_reg_pass" | docker login "$_reg_host" -u "$_reg_user" --password-stdin; } 2>/dev/null
    echo "[deploy] docker login succeeded: ${_reg_host}"
  else
    echo "[deploy] WARNING: DOCKER_REGISTRY=${DOCKER_REGISTRY} is set but no credentials found." >&2
    echo "[deploy]          Add DOCKER_REGISTRY_USER + DOCKER_REGISTRY_PASSWORD to /opt/mops/.secrets," >&2
    echo "[deploy]          or ensure NPM_USER + NPM_PASSWORD are present (they double as registry creds)." >&2
  fi
fi

$COMPOSE_CMD up -d

# Wait for postgres healthy before checking portal (compose depends_on handles
# ordering, but we still wait explicitly for health check to propagate)
echo "[deploy] Waiting for postgres to become healthy..."
for i in $(seq 1 12); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${PROJECT}-postgres" 2>/dev/null || echo "")
  [ "$STATUS" = "healthy" ] && break
  echo "[deploy] Postgres status=${STATUS:-starting} — waiting (${i}/12)..."
  sleep 5
done
STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${PROJECT}-postgres" 2>/dev/null || echo "")
if [ "$STATUS" != "healthy" ]; then
  echo "[deploy] ERROR: postgres did not become healthy. Aborting." >&2
  docker logs "${PROJECT}-postgres" --tail 20 2>&1 || true
  exit 1
fi

# Wait for backend healthy before checking portal.
# Portal depends_on backend (service_healthy), so portal won't start until backend is up.
# Worst-case backend start: start_period(30s) + retries(5) × interval(15s) = 105s.
echo "[deploy] Waiting for backend to become healthy..."
for i in $(seq 1 22); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${PROJECT}-backend" 2>/dev/null || echo "")
  [ "$STATUS" = "healthy" ] && break
  echo "[deploy] Backend status=${STATUS:-starting} — waiting (${i}/22)..."
  sleep 5
done
STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${PROJECT}-backend" 2>/dev/null || echo "")
if [ "$STATUS" != "healthy" ]; then
  echo "[deploy] ERROR: backend did not become healthy. Aborting." >&2
  docker logs "${PROJECT}-backend" --tail 20 2>&1 || true
  exit 1
fi

# ── 5. Health check ───────────────────────────────────────────────────────────
echo "[deploy] Waiting for portal health check on :${HEALTH_PORT}..."
HEALTHY=0
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${HEALTH_PORT}/health" >/dev/null; then
    echo "[deploy] Health check passed (attempt ${i}/20)"
    HEALTHY=1
    break
  fi
  echo "[deploy] Attempt ${i}/20 — not ready, retrying in 5s..."
  sleep 5
done

if [ "$HEALTHY" -eq 0 ]; then
  echo "[deploy] === Portal logs ==="
  docker logs "${PROJECT}-portal" --tail 40 2>&1 || true
  echo "[deploy] === Backend logs ==="
  docker logs "${PROJECT}-backend" --tail 20 2>&1 || true
  echo "[deploy] Health check failed — rolling back..."

  if [ -n "$OLD_PORTAL" ] && [ -n "$OLD_BACKEND" ]; then
    docker stop "${PROJECT}-backend" "${PROJECT}-portal" "${PROJECT}-postgres" 2>/dev/null || true
    docker rm   "${PROJECT}-backend" "${PROJECT}-portal" "${PROJECT}-postgres" 2>/dev/null || true
    PORTAL_IMAGE="$OLD_PORTAL" BACKEND_IMAGE="$OLD_BACKEND" \
      $COMPOSE_CMD up -d
    echo "[deploy] Rolled back: portal=${OLD_PORTAL} backend=${OLD_BACKEND}"
  else
    echo "[deploy] No previous images to roll back to — stack left stopped."
  fi
  exit 1
fi

echo "[deploy] Deploy successful."

# ── 6. Cleanup old images (keep last 3 per service) ──────────────────────────
for SVC in portal backend; do
  docker images "mops-${SVC}" --format '{{.Tag}}' \
    | grep "^${TAG_PREFIX}" \
    | sort -t'-' -k2 -n -r \
    | tail -n +4 \
    | xargs -I {} docker rmi "mops-${SVC}:{}" 2>/dev/null || true
done

echo "[deploy] Cleanup done. Stack status:"
$COMPOSE_CMD ps
