# MOPS Portal — Makefile
# Build always happens on the host. Docker only serves the result (nginx).

.PHONY: start dev dev-full dev-full-oidc dev-full-oidc-stop stop build test lint lint-md check-links docs-api logs update upgrade reconfigure sync-env validate-env env-diff doctor doctor-offline hooks backup restore push-cache bootstrap-agent rotate-secrets release vendor-deps pull-images offline-install help

# Auto-detect docker compose v2 or docker-compose v1
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

## start            → Build locally + serve via Docker (nginx) on http://localhost:80
start:
	./setup.sh

## dev              → Start Vite dev server on http://localhost:5173 (hot-reload, no Docker)
dev:
	./setup.sh --dev

## dev-full         → Start full dev stack: postgres + backend (Docker) + Vite dev server
dev-full:
	./setup.sh --dev-full

## dev-full-oidc    → dev-full + auto-configure mock OIDC server (no manual .env edits)
##                    Any username/password works for login
dev-full-oidc:
	./setup.sh --dev-full --mock-oidc

## dev-full-oidc-stop → Revert mock OIDC settings in .env and stop the mock server
dev-full-oidc-stop:
	@if [ -f .env ] && grep -q '^VITE_OIDC_AUTHORITY_REAL=' .env; then \
	  _real=$$(grep '^VITE_OIDC_AUTHORITY_REAL=' .env | cut -d= -f2-); \
	  _cid_real=$$(grep '^VITE_OIDC_CLIENT_ID_REAL=' .env | cut -d= -f2-); \
	  sed -i "s|^VITE_OIDC_AUTHORITY=.*|VITE_OIDC_AUTHORITY=$${_real}|" .env; \
	  sed -i "s|^OIDC_AUTHORITY=.*|OIDC_AUTHORITY=$${_real}|" .env; \
	  sed -i "s|^VITE_OIDC_CLIENT_ID=.*|VITE_OIDC_CLIENT_ID=$${_cid_real}|" .env; \
	  sed -i "s|^OIDC_CLIENT_ID=.*|OIDC_CLIENT_ID=$${_cid_real}|" .env; \
	  sed -i '/^# Mock OIDC backup/d; /^VITE_OIDC_AUTHORITY_REAL=/d; /^OIDC_AUTHORITY_REAL=/d; /^VITE_OIDC_CLIENT_ID_REAL=/d; /^OIDC_CLIENT_ID_REAL=/d' .env; \
	  echo "[setup] Mock OIDC settings reverted."; \
	else \
	  echo "[setup] No mock OIDC backup found in .env — nothing to revert."; \
	fi
	$(COMPOSE) -f docker-compose.dev.yml --profile mock-oidc stop mock-oidc 2>/dev/null || true

## stop             → Stop the running container(s)
stop:
	$(COMPOSE) down 2>/dev/null || true
	$(COMPOSE) -f docker-compose.dev.yml down 2>/dev/null || true

## build            → Build production bundle locally (dist/)
build:
	npm run build

## test             → Run unit tests
test:
	npm run test

## lint             → Run ESLint
lint:
	npm run lint

## lint-md          → Run markdownlint for repository docs
lint-md:
	npm run lint:md

## check-links      → Validate markdown links and anchors
check-links:
	npm run check:links

## docs-api         → Generate API documentation with TypeDoc
docs-api:
	npm run docs:api

## logs             → Tail logs for the running container
logs:
	$(COMPOSE) logs -f

## update           → Pull latest code, sync .env, smart-rebuild, and redeploy
update:
	./update.sh

## reconfigure      → Re-run .env interactive wizard (admin login, OIDC, registry) without rebuilding
reconfigure:
	./setup.sh --reconfigure

## sync-env         → Merge new keys from .env.example into .env
sync-env:
	./setup.sh --sync-env

## validate-env     → Validate .env secrets and required keys (color-coded report)
validate-env:
	./setup.sh --validate

## env-diff         → Show which .env.example keys are missing from .env (and extra keys)
env-diff:
	@echo "=== Keys in .env.example missing from .env ==="
	@if [ ! -f .env ]; then echo "  .env not found — run ./setup.sh first"; else \
	  grep -v '^[[:space:]]*#' .env.example | grep -v '^[[:space:]]*$$' | cut -d= -f1 | \
	  while read key; do \
	    grep -q "^$$key=" .env || echo "  MISSING: $$key"; \
	  done; \
	fi
	@echo ""
	@echo "=== Keys in .env not present in .env.example ==="
	@if [ -f .env ]; then \
	  grep -v '^[[:space:]]*#' .env | grep -v '^[[:space:]]*$$' | cut -d= -f1 | \
	  while read key; do \
	    grep -q "^$$key=" .env.example 2>/dev/null || echo "  EXTRA:   $$key"; \
	  done; \
	fi

## doctor           → Check all prerequisites (tools, .env, ports, Docker) before setup
doctor:
	@bash scripts/doctor.sh

## doctor-offline   → Same as doctor but skip network-dependent checks (registry reachability)
doctor-offline:
	@bash scripts/doctor.sh --offline

## vendor-deps      → Cache all npm packages for offline builds (frontend + backend)
vendor-deps:
	@bash scripts/vendor-deps.sh

## pull-images      → Pre-pull all Docker images needed by the portal
pull-images:
	@bash scripts/pull-images.sh

## offline-install  → Install npm dependencies from local cache (no network required)
offline-install:
	npm ci --cache .npm-cache --prefer-offline
	cd backend && npm ci --cache ../.npm-cache --prefer-offline

## hooks            → Install git pre-commit and commit-msg hooks (requires npm install first)
hooks:
	@if [ -d node_modules/.bin ] && node_modules/.bin/husky --version >/dev/null 2>&1; then \
	  npm run prepare; \
	  echo "[hooks] Husky git hooks installed."; \
	else \
	  echo "[hooks] Run 'npm install' first to install Husky, then run 'make hooks' again."; \
	fi

## backup           → Backup database and uploads for the prod stack (STACK=prod|staging|local)
backup:
	bash scripts/backup.sh

## restore          → Restore database from a backup file
##                    Usage: make restore BACKUP=backups/db-prod-20260420-0200.sql.gz
restore:
	@if [ -z "$(BACKUP)" ]; then echo "Usage: make restore BACKUP=<path-to-backup.sql.gz>"; exit 1; fi
	@STACK=$${STACK:-prod}; \
	case "$$STACK" in \
	  prod)    PG="mops-prod-postgres" ;; \
	  staging) PG="mops-staging-postgres" ;; \
	  local)   PG="mops-postgres" ;; \
	  *)       echo "Unknown STACK '$$STACK'"; exit 1 ;; \
	esac; \
	echo "Restoring $(BACKUP) → $$PG …"; \
	gunzip -c "$(BACKUP)" | docker exec -i "$$PG" psql -U portal portal; \
	echo "Restore complete."

## push-cache       → Tag and push local build as cache layer for CI
##                    Usage: REGISTRY=myregistry.example.com make push-cache
push-cache:
	@if [ -z "$(REGISTRY)" ]; then echo "Usage: REGISTRY=myregistry.example.com make push-cache"; exit 1; fi
	docker build -t $(REGISTRY)/mops-portal:cache --build-arg BUILDKIT_INLINE_CACHE=1 .
	docker push $(REGISTRY)/mops-portal:cache
	docker build -t $(REGISTRY)/mops-backend:cache --build-arg BUILDKIT_INLINE_CACHE=1 backend/
	docker push $(REGISTRY)/mops-backend:cache

## upgrade           → Server-side upgrade: backup → pull → build → deploy → smoke test
##                    Usage: bash scripts/upgrade.sh [--dry-run] [--skip-backup]
upgrade:
	bash scripts/upgrade.sh

## bootstrap-agent   → Provision a fresh build agent (installs tools, creates /opt/mops)
##                    Usage: sudo make bootstrap-agent
bootstrap-agent:
	bash scripts/bootstrap-agent.sh

## rotate-secrets    → Rotate JWT secret and/or PostgreSQL password
##                    Usage: sudo make rotate-secrets  |  sudo STACK=staging make rotate-secrets
rotate-secrets:
	bash scripts/rotate-secrets.sh

## release           → Bump version, generate changelog entry, commit + tag
##                    Usage: make release LEVEL=patch  (or minor / major)
release:
	@if [ -z "$(LEVEL)" ]; then echo "Usage: make release LEVEL=patch|minor|major"; exit 1; fi
	bash scripts/release.sh $(LEVEL)

## help             → Show this help message
help:
	@grep -E '^##' Makefile | sed 's/## /  /'

