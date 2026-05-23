# Project Showcase

A public site where anyone can submit a GitHub repository and track its stats.
No login required — browse the gallery, submit a repo, watch the numbers.

## What it does

- **Gallery** — browse submitted GitHub repos with search and language filter
- **Submit** — paste a GitHub URL and it auto-fetches name, description, language, and stars
- **Project detail** — per-project page with full metadata and view counter
- **Stats** — total project count, top by views, top by stars

## Architecture

```text
Browser
  -> nginx container (:80 public)
     -> /api/* -> backend container (:3001 internal)
     -> /uploads/* proxy -> backend
        -> PostgreSQL (:5432 internal)
```

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, optionally GITHUB_TOKEN and ADMIN_PASSWORD
docker compose up --build
```

App is available at `http://localhost`.

## Local development

```bash
# Frontend
npm install
npm run dev          # Vite dev server at http://localhost:5173

# Backend (separate terminal)
cd backend
npm install
npm run dev          # Express at http://localhost:3001
```

Set `DATABASE_URL` in `backend/.env` pointing at a local Postgres instance.

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password |
| `DATABASE_URL` | Full Postgres connection string |
| `GITHUB_TOKEN` | GitHub PAT — optional but raises rate limit from 60 to 5000 req/h |
| `ADMIN_PASSWORD` | Bearer token for admin endpoints (approve/reject projects) |
| `CORS_ORIGIN` | Allowed CORS origin in production |

## Admin endpoints

Send `Authorization: Bearer <ADMIN_PASSWORD>` to:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/pending` | List unapproved submissions |
| `PATCH` | `/api/projects/:id` | Approve or reject a project |
| `POST` | `/api/projects/:id/refresh` | Re-sync GitHub metadata |

## Repository layout

```text
├── src/                  React frontend (TypeScript + Vite)
├── backend/              Node.js/Express API + PostgreSQL migrations
├── deploy/               Deployment scripts
├── nginx.conf            nginx server config
├── Dockerfile            Multi-stage SPA build + nginx serve
├── docker-compose.yml    Full stack definition
└── azure-pipelines.yml   CI/CD pipeline
```

## CI/CD

`azure-pipelines.yml` defines two stages:

- **Staging** — triggered on push to `develop`
- **Production** — triggered on push to `main`, requires manual approval

Set `RUN_TESTS=true` as a pipeline variable to enable the optional lint + test step.
