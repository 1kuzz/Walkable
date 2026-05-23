# Project Showcase — Deployment Guide

## Files in this directory

| File | Purpose |
|---|---|
| `compose-deploy.sh` | Deploy with rollback |
| `env.example` | Server-side environment template |
| `smoke-test.sh` | Public smoke-test script |

## Deployment model

The deployed application stack is:

- `portal` → nginx container
- `backend` → Node.js API container
- `postgres` → PostgreSQL container

Production compose file: `docker-compose.prod.yml`
Staging compose file: `docker-compose.staging.yml`

## Required server-side files

The automation expects:

- `/opt/showcase/prod.env`
- `/opt/showcase/staging.env`

Use `.env.example` as the template.

## Image build and deploy flow

The pipeline builds two images:

- `showcase-portal:<tag>`
- `showcase-backend:<tag>`

Deploy example:

```bash
source /opt/showcase/prod.env
export PORTAL_IMAGE=showcase-portal:prod-<build-id>
export BACKEND_IMAGE=showcase-backend:prod-<build-id>
bash deploy/compose-deploy.sh prod
```

## Health and smoke tests

Public checks:

- `/health`
- `/api/health/ready`
- `/version`
- SPA routing on `/` and `/gallery`

Run the smoke test against the public portal port:

```bash
bash deploy/smoke-test.sh http://localhost:3000
```

## Rollback

If deployment health checks fail, `compose-deploy.sh` attempts rollback automatically. Manual
rollback is still possible by re-exporting the previous image tags and re-running the deploy script.

## Deployment checklist

- [ ] required env files are present on the host
- [ ] target images exist locally or can be pulled
- [ ] PostgreSQL becomes healthy
- [ ] public `/health` returns `ok`
- [ ] `/api/health/ready` reports healthy status
- [ ] `/version` matches the expected build
- [ ] smoke tests pass
