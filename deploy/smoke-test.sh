#!/usr/bin/env sh
set -eu

BASE_URL="${1:-${PORTAL_BASE_URL:-}}"

if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base-url>"
  echo "   or: PORTAL_BASE_URL=http://<host> $0"
  exit 1
fi

case "$BASE_URL" in
  http://*|https://*) ;;
  *)
    echo "ERROR: base URL must start with http:// or https://"
    exit 1
    ;;
esac

BASE_URL="${BASE_URL%/}"

echo "Smoke testing MOPS Portal at: $BASE_URL"

# 1) /health should return 200 and body 'ok'
health_body="$(curl -fsS "$BASE_URL/health")"
if [ "$health_body" != "ok" ]; then
  echo "ERROR: /health returned unexpected body: '$health_body'"
  exit 1
fi
echo "✓ /health returned expected body"

# 2) /api/health/ready should report a healthy backend
ready_body="$(curl -fsS "$BASE_URL/api/health/ready")"
printf '%s' "$ready_body" | grep -q '"status":"ok"' || {
  echo "ERROR: /api/health/ready did not report status ok"
  exit 1
}
echo "✓ /api/health/ready reported healthy status"

# 3) Root page should be 200 and include SPA root container
root_html="$(curl -fsS "$BASE_URL/")"
printf '%s' "$root_html" | grep -qi '<div id="root">' || {
  echo "ERROR: / does not contain SPA root element"
  exit 1
}
echo "✓ / returns SPA HTML"

# 4) /gallery should be 200 and also serve SPA index fallback
gallery_html="$(curl -fsS "$BASE_URL/gallery")"
printf '%s' "$gallery_html" | grep -qi '<div id="root">' || {
  echo "ERROR: /gallery does not serve SPA HTML"
  exit 1
}
echo "✓ /gallery serves SPA HTML"

# 5) Security headers should be present on /
headers="$(curl -fsSI "$BASE_URL/")"
for h in \
  'content-security-policy:' \
  'x-frame-options:' \
  'x-content-type-options:' \
  'referrer-policy:' \
  'strict-transport-security:'
do
  printf '%s' "$headers" | tr '[:upper:]' '[:lower:]' | grep -q "$h" || {
    echo "ERROR: missing header '$h' on / response"
    exit 1
  }
done
echo "✓ required security headers are present"

# 6) /version should return a non-empty build version string
version_body="$(curl -fsS "$BASE_URL/version")"
if [ -z "$(printf '%s' "$version_body" | tr -d '[:space:]')" ]; then
  echo "ERROR: /version returned empty value"
  exit 1
fi
echo "✓ /version returned build version: $version_body"

echo "Smoke test PASSED"
