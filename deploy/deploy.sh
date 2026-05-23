#!/usr/bin/env bash
# Full redeploy: pull → install → build → migrate files → restart
set -euo pipefail

APP=/var/www/walkable/app
cd "$APP"

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

echo "[deploy] Restarting backend..."
pm2 restart showcase-backend

echo "[deploy] Waiting for backend to be healthy..."
for i in $(seq 1 15); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || true)
  if [ "$STATUS" = "200" ]; then
    echo "[deploy] Backend healthy after ${i}s"
    break
  fi
  sleep 1
done

echo "[deploy] Reloading nginx..."
# Use sudo if available (non-root SSH users); fall back to direct call (root)
SUDO=$(command -v sudo 2>/dev/null && echo "sudo" || echo "")
$SUDO nginx -t && $SUDO systemctl reload nginx

echo "[deploy] Done. Health:"
curl -s http://localhost/api/health | python3 -m json.tool
