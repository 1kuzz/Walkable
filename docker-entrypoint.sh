#!/bin/sh
# docker-entrypoint.sh — Portal container entry point.
# Waits for the backend to be healthy, then starts nginx and prints a startup summary.

set -eu

BACKEND_HOST="${BACKEND_HOST:-backend}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
BACKEND_HEALTH="http://${BACKEND_HOST}:${BACKEND_PORT}/health"
APP_VERSION="${VITE_APP_VERSION:-$(cat /usr/share/nginx/html/version.txt 2>/dev/null || echo 'unknown')}"
AUTH_MODE="${VITE_OIDC_AUTHORITY:+OIDC/SSO}"
AUTH_MODE="${AUTH_MODE:-Mock (local JWT)}"

# Wait for backend to be reachable (up to 60s).
# In production, depends_on: condition: service_healthy already ensures ordering,
# but this adds a runtime guard for restarts and manual container starts.
RETRIES=12
WAIT=5
i=0
while [ "$i" -lt "$RETRIES" ]; do
  if wget -q -O /dev/null "$BACKEND_HEALTH" 2>/dev/null || \
     curl -sf "$BACKEND_HEALTH" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  echo "[portal] Waiting for backend at ${BACKEND_HEALTH} … (${i}/${RETRIES})"
  sleep "$WAIT"
done

if [ "$i" -eq "$RETRIES" ]; then
  echo "[portal] WARNING: backend not reachable after $((RETRIES * WAIT))s — starting nginx anyway."
  echo "[portal] Check: docker logs ${BACKEND_HOST}"
else
  echo "[portal] Backend is healthy."
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  MOPS Portal — started                                           ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  Version:  %-52s ║\n" "$APP_VERSION"
printf "║  Auth:     %-52s ║\n" "$AUTH_MODE"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

exec nginx -g 'daemon off;'
