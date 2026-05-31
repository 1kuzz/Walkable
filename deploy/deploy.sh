#!/usr/bin/env bash
# Full redeploy: pull → install → build → prune devDeps → restart
set -euo pipefail

APP=/var/www/walkable/app
cd "$APP"

SUDO=""
if [ "$(id -u)" != "0" ]; then
  SUDO="sudo"
fi

echo "[deploy] Pulling latest code..."
git pull origin main

echo "[deploy] Installing frontend dependencies..."
npm install --prefer-offline 2>&1 | tail -3

echo "[deploy] Installing backend dependencies..."
(cd backend && npm install --prefer-offline 2>&1 | tail -3)

echo "[deploy] Building frontend..."
npm run build 2>&1 | tail -5

echo "[deploy] Building backend..."
(cd backend && npm run build 2>&1 | tail -3)

echo "[deploy] Copying SQL migrations to dist..."
mkdir -p backend/dist/db/migrations
cp backend/src/db/migrations/*.sql backend/dist/db/migrations/

echo "[deploy] Pruning backend devDependencies (not needed at runtime)..."
(cd backend && npm prune --omit=dev 2>&1 | tail -2)

echo "[deploy] Restarting backend..."
# Use ecosystem.config.cjs — handles single-instance, heap limit, restart backoff
if $SUDO pm2 list | grep -q "showcase-backend"; then
  $SUDO pm2 restart showcase-backend --update-env
else
  $SUDO pm2 start ecosystem.config.cjs
fi
$SUDO pm2 save

echo "[deploy] Waiting for backend to be healthy..."
for i in $(seq 1 20); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || true)
  if [ "$STATUS" = "200" ]; then
    echo "[deploy] Backend healthy after ${i}s"
    break
  fi
  sleep 1
done

echo "[deploy] Reloading nginx..."
$SUDO nginx -t && $SUDO systemctl reload nginx

echo "[deploy] Done. Health:"
curl -s http://localhost/api/health | python3 -m json.tool

echo "[deploy] Disk:"
df -h / | tail -1

echo "[deploy] Memory:"
free -h | grep Mem
