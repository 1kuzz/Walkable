# Changelog

All notable changes to MOPS Portal are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Structured JSON logging** (`backend/src/utils/logger.ts`): new `logger` module replaces
  `console.*` calls throughout the backend. In `NODE_ENV=production` each line is a single
  JSON object (timestamp, level, message, optional metadata) ready for ELK / Azure Monitor
  / any log aggregator. In development it pretty-prints with ANSI colour. Log level is
  configurable via the `LOG_LEVEL` environment variable (`debug|info|warn|error`).
- **Request timeout middleware** (`backend/src/middleware/requestTimeout.ts`): all API routes
  now automatically abort after 30 s (configurable via `REQUEST_TIMEOUT_MS`) and return
  `503 Service Unavailable`. Health-check endpoints are excluded so probes are unaffected.
- **Brute-force protection on local-login**: the `/api/auth/local-login` endpoint now tracks
  consecutive failed attempts per username. After 5 failures the account is locked for 15
  minutes and returns `429 Too Many Requests`. The counter resets on a successful login.
- **ADFS TLS verification flag** (`ADFS_REJECT_UNAUTHORIZED`): a new environment variable
  controls whether Node.js verifies the ADFS server's TLS certificate. Defaults to `false`
  for backwards compatibility (corporate environments where the internal CA is not installed
  in the container). Set to `true` after adding the CA bundle via `NODE_EXTRA_CA_CERTS`.
  A warning is logged at startup whenever TLS verification is disabled.
- **JWT secret startup validation**: the server now refuses to start in `NODE_ENV=production`
  if `LOCAL_JWT_SECRET` is set to the insecure development default, and logs an error if the
  secret is shorter than 32 characters in any environment.
- **CORS wildcard warning**: a startup warning is emitted if `CORS_ORIGIN=*` is detected in
  production, reminding operators to restrict the origin to the portal's exact URL.
- **Graceful shutdown** (`SIGTERM` / `SIGINT`): the backend now stops accepting new
  connections, waits up to `SHUTDOWN_TIMEOUT_MS` (default 10 s) for in-flight requests to
  complete, and closes the database pool before exiting. Container orchestration platforms
  receive a clean exit instead of a hard kill.
- **Migration version tracking** (`schema_migrations` table): `runMigrations()` now records
  each applied SQL file in a `schema_migrations` table and skips files that have already been
  applied. Each migration is executed inside an explicit transaction — on failure the
  transaction is rolled back and the error is re-thrown, leaving the database in a clean state.
  The migration for `005_schema_migrations.sql` itself is bootstrapped inline before the
  normal loop runs so there is no chicken-and-egg problem.
- **Cross-tab session synchronisation** (frontend): `AuthProvider` now opens a
  `BroadcastChannel('mops_auth')` on mount. On logout it broadcasts a `LOGOUT` event so all
  other tabs clear their session and redirect to the login page. On a successful silent token
  refresh it broadcasts `TOKEN_REFRESHED` so sibling tabs adopt the new token without
  triggering their own independent refresh race.
- `.env.example` extended with documented entries for `ADFS_IP`, `ADFS_HOST`,
  `ADFS_REJECT_UNAUTHORIZED`, `LOG_LEVEL`, `REQUEST_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`.
- **Bilingual UI foundation (EN/RU)**: added app-wide i18n provider, locale persistence and
  browser-language fallback, reusable locale-aware date/time formatting helpers, a global EN/RU
  switcher, and initial localization coverage across shell/auth/key pages. Added `npm run check:i18n`
  to validate locale key consistency between English and Russian dictionaries.

### Changed

- `azure-pipelines.yml`: the `npm audit` step is now **blocking for HIGH+ severity
  vulnerabilities**. The `continueOnError: true` flag has been removed. Low and moderate
  advisory findings still allow the build to pass because `--audit-level=high` is used.
- All backend `console.error` / `console.info` calls replaced with structured `logger.*`
  calls including a structured metadata object where relevant.
- `ADFS_HOST` and `ADFS_IP` in `backend/src/routes/auth.ts` now read from `process.env` with
  the previous hard-coded values as defaults, making them overridable without code changes.

---

## [1.5.0] - 2026-04-20

### Added

- `docker-compose.dev.yml` — full local development stack (PostgreSQL + backend with
  hot-reload via tsx watch). Start with `make dev-full` or `./setup.sh --dev-full`.
  SSO token exchange now works end-to-end in local dev because all three services run
  together.
- Optional mock OIDC server profile (`COMPOSE_PROFILES=mock-oidc make dev-full`) using `ghcr.io/navikt/mock-oauth2-server` — enables testing the full SSO login flow without a real corporate IdP.
- `update.sh` — smart update script: `git pull --ff-only`, `.env` key sync,
  dependency-aware rebuild (runs `npm ci` only when `package-lock.json` changed,
  runs `npm run build` only when source files changed), and automatic Docker stack
  redeploy. Use `./update.sh --dry-run` to preview.
- `setup.sh --dev-full` flag — starts the Docker dev stack and then the Vite dev server in one command.
- `setup.sh --sync-env` flag — merges new keys from `.env.example` into an existing `.env` without overwriting values. Called automatically by `./update.sh`.
- `setup.sh --reconfigure` flag — re-runs the interactive `.env` wizard (admin login, OIDC, Docker registry) without rebuilding.
- `setup.sh` now automatically syncs new `.env.example` keys into an existing `.env` on every run (no values are overwritten).
- `setup.sh` shows a coloured `.env` summary (admin users, auth mode, registry, database URL) whenever an existing `.env` is found.
- `setup.sh` idempotent prod mode: if the stack is running and `dist/` is up to date, skips the full `npm ci + npm run build + docker build` cycle and only restarts containers.
- `Makefile` new targets: `dev-full`, `update`, `reconfigure`, `env-diff`, `push-cache`.
- `deploy/env.example` — template for the server-side `/opt/mops/prod.env` and `staging.env` files used by the CI/CD pipeline, with documentation for every required key.
- `deploy/ops-runbook.md` — Day-2 operations guide covering server bootstrap, routine updates, manual rollback, backup/restore, and troubleshooting.
- `VERSION` file — machine-readable release version at the repo root; read by `setup.sh` and `update.sh` to show which version is being installed or upgraded to.

### Changed

- `azure-pipelines.yml` production stage now sources `/opt/mops/prod.env` instead of `/var/www/Corp-MOPSMarketingPortal/.env`, removing the coupling between pipeline config and the repo working directory.
- `azure-pipelines.yml` both stages now have a **pre-flight validation step** that checks all required environment variables are set and prints a masked config summary before the Docker build starts.
- `azure-pipelines.yml` Docker builds now use `DOCKER_BUILDKIT=1` and
  `--build-arg BUILDKIT_INLINE_CACHE=1` with `--cache-from` pointing to the previous
  image tag. Unchanged layers (especially `npm ci`) are reused, significantly
  reducing build times on incremental deploys.
- `setup.sh` help text updated with new flags; now prints the portal version from `VERSION` on startup.
- `update.sh` now prints the current installed version vs. the incoming version before and after an upgrade.
- `QUICKSTART.md` updated with `--dev-full` workflow, mock OIDC instructions, Day 2 ops section (update, reconfigure, env-diff, push-cache).

---

## [1.0.0] - 2026-04-01

### Added

- Core SPA portal with role-based routes and startup checks
- OIDC Authorization Code + PKCE flow with mock fallback mode
- Admin setup wizard and managed admin operations (op-mode)
- Content upload and visibility management with isolated preview
- Usage statistics dashboard and centralized debug logging
- Version history tracking for portal and uploaded content
- Documentation set for authentication, API integration, admin guide, operations, and ADRs
- Documentation quality automation:
  - markdown linting in CI
  - markdown link checks in CI
  - TypeDoc generation configuration
  - Mermaid diagrams for architecture and key flows

### Changed

- Branding migrated to Kaspersky corporate style tokens and assets
- Architecture documentation moved from text-only flow to Mermaid-based diagrams
- CI expanded to include documentation quality checks

### Security

- Token validation hardening (`iss`, `aud`, `nonce`) in OIDC flow
- PKCE S256, OAuth `state` validation, and session expiration checks
- Admin rights resolution isolated from JWT claims
- Security headers and static delivery hardening through nginx deployment profile

---

_Last updated: 2026-04-20_
