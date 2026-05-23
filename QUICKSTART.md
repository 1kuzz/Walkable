# MOPS Portal — Quick Start

## Choose the right path

| Goal | Command | Read next |
|---|---|---|
| Standard local stack | `./setup.sh` | `docs/user-guide.md` |
| Frontend-only development | `./setup.sh --dev` | `CONTRIBUTING.md` |
| Full local stack with backend | `./setup.sh --dev-full` | `CONTRIBUTING.md` |
| Full local stack with mock OIDC | `./setup.sh --dev-full --mock-oidc` | `docs/authentication.md` |
| Validate prerequisites only | `make doctor` | `docs/RUNBOOK.md` |
| Offline / restricted network setup | `./setup.sh --offline` | `docs/offline-setup.md` |

## 1. Standard local setup

```bash
cd /home/runner/work/PortalReliability/PortalReliability
make doctor
./setup.sh
```

What `setup.sh` does:

1. checks Node.js and npm availability
2. creates `.env` from `.env.example` when needed
3. auto-generates `LOCAL_JWT_SECRET` and `POSTGRES_PASSWORD`
4. installs dependencies with `npm ci --prefer-offline`
5. builds the frontend
6. starts the local Docker stack

After the success banner:

- portal: `http://localhost`
- backend health: `http://localhost/api/health`
- public health: `http://localhost/health`

## 2. Development modes

### Frontend only

```bash
./setup.sh --dev
# or
make dev
```

Use this for UI-only work. No backend is started.

### Full local stack

```bash
./setup.sh --dev-full
# or
make dev-full
```

Starts:

- PostgreSQL on `localhost:5432`
- backend on `localhost:3001`
- Vite dev server on `localhost:5173`

### Full local stack with mock OIDC

```bash
./setup.sh --dev-full --mock-oidc
# or
make dev-full-oidc
```

This mode configures the local mock identity provider automatically. The SPA still uses the
canonical `/callback` route.

## 3. First browser login

1. open the portal URL shown by setup
2. wait for the startup checks to complete
3. complete `/setup` on the first run
4. sign in with either:
   - a configured OIDC provider, or
   - a local account created by an admin, or
   - mock mode where no real IdP is configured

## 4. Important local files

- env template:
  `/home/runner/work/PortalReliability/PortalReliability/.env.example`
- local bootstrap script:
  `/home/runner/work/PortalReliability/PortalReliability/setup.sh`
- task shortcuts:
  `/home/runner/work/PortalReliability/PortalReliability/Makefile`

## 5. Minimal env changes

At minimum, review these values in `.env`:

| Variable | Why it matters |
|---|---|
| `VITE_ADMIN_USERS` | initial admin login shown in the UI |
| `ADMIN_USERS` | backend-side admin authorization |
| `VITE_OIDC_AUTHORITY` | enables SSO when set |
| `VITE_OIDC_CLIENT_ID` | required with OIDC authority |
| `VITE_OIDC_REDIRECT_URI` | should point to `https://<host>/callback` |
| `CORS_ORIGIN` | backend CORS allow-list |

Keep `VITE_ADMIN_USERS` and `ADMIN_USERS` aligned.

## 6. Non-interactive setup

For CI, remote shells, or automation:

```bash
SETUP_NON_INTERACTIVE=1 SETUP_ADMIN_LOGIN='KL\svc_portal_admin' SETUP_OIDC_AUTHORITY='https://cbasts.kaspersky.com/adfs' SETUP_OIDC_CLIENT_ID='portal-client-id' SETUP_OIDC_REDIRECT_URI='https://portal.example.com/callback' SETUP_CORS_ORIGIN='https://portal.example.com' ./setup.sh
```

Supported automation inputs are defined by `setup.sh`.

## 7. Offline / restricted-network flow

```bash
cp registry.env.example registry.env
make pull-images
make vendor-deps
./setup.sh --offline
```

Use `make doctor-offline` when normal network checks are expected to fail.

## 8. Day-2 commands

```bash
make validate-env
make env-diff
make update
make backup
make restore BACKUP=backups/db-local-YYYYMMDD-HHMM.sql.gz STACK=local
make stop
```

## 9. Validation commands

Run these before opening a pull request:

```bash
npm run lint
npm run lint:md
npm run check:links
npm run docs:api
npm run build
npm run test
npm run test:e2e
cd backend && npm run build
```

## 10. Where to go next

- contributor workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
- operations / production: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- auth / SSO details: [docs/authentication.md](docs/authentication.md)
- backend routes: [docs/backend-api.md](docs/backend-api.md)
