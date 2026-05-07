# 🌿 Walkable

Discover, build, and share walking routes in parks. Check weather and trail conditions, browse community photos, and track your walking history.

## Runtime target and release acceptance

- **Primary deployment target:** Vercel (configured by `vercel.json`)
- **Secondary/self-host target:** any Node.js server with persistent PostgreSQL and writable/persistent photo storage

A release is considered **ready** when all of these are true:

1. `npm run build` succeeds and app boots with `npm run start`
2. CI is green (`lint-and-typecheck` → `test` → `build`)
3. Smoke tests pass (auth, protected routes, route APIs, weather API, photo upload/fetch)
4. Production migrations are applied (`prisma migrate deploy`)
5. Runtime health/readiness checks pass (`/api/health`, `/api/ready`)

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth v4 (Google & GitHub OAuth) |
| Maps | Yandex Maps JS API |
| Photos | Server-side file storage |
| Weather | Yandex Weather API |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Tests | Vitest |

---

## Local development

### 1. Prerequisites

- Node.js ≥ 20
- PostgreSQL 14+ (local install or Docker)
- Minimum recommended machine: 2 CPU cores, 4 GB RAM

### 2. Clone and install

```bash
git clone https://github.com/1kuzz/Walkable.git
cd Walkable
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
# then fill in every variable — see comments in .env.example
```

The only externally required services for basic local work are:

| Service | Required for |
|---|---|
| PostgreSQL | All pages (data layer) |
| Google or GitHub OAuth app | Sign-in flow |
| Yandex Maps API key | Map pages and rerouting |
| Yandex Weather API key | Weather widgets |

Photo uploads are stored by the app on the server filesystem under `storage/photos`.

### Environment matrix

| Environment | Purpose | Minimum requirements |
|---|---|---|
| Local | Development | PostgreSQL + `.env.local` |
| CI | Quality gate for PRs/branches | Placeholder env vars + build/start smoke checks |
| Staging | Pre-production validation | Production-like secrets, domain, DB, and storage |
| Production | Live traffic | Managed Postgres, HTTPS, OAuth callbacks, persistent storage |

### 4. Initialise the database

```bash
# Apply migrations (creates tables on a fresh DB)
npx prisma migrate dev

# (Optional) seed parks from OpenStreetMap
npx ts-node scripts/import-osm.ts
```

### 5. Start the dev server

```bash
npm run dev
# → http://localhost:3000
```

---

## Workflow commands

| Command | What it does |
|---|---|
| `npm run lint` | ESLint (must pass before commit) |
| `npx tsc --noEmit` | TypeScript type-check |
| `npm test` | Unit tests with Vitest (run once) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests + coverage report |
| `npm run build` | Next.js production build |
| `npm run start` | Start built app in production mode |

**Recommended order before pushing:** lint → typecheck → test → prisma-generate → build.

```bash
npm run lint
npx tsc --noEmit
npm test
npx prisma generate
npm run build
```

> `npm run build` in this project runs only `next build` (it does not run `prisma generate`), so keep `npx prisma generate` as a separate explicit step locally and in CI.
>
> `npm run start` is a separate production-runtime smoke check step (run manually before release, not on every local pre-push cycle).

---

## CI pipeline

Three sequential jobs run on every push to `main` or `copilot/**` and on pull requests targeting `main`:

```
lint-and-typecheck → test → build
```

- **lint-and-typecheck** – ESLint + `tsc --noEmit`
- **test** – all Vitest unit tests
- **build** – `prisma generate` + `next build` + production boot smoke checks (`/api/health`, `/api/ready`)

---

## Deployment (Vercel)

The repo is configured for zero-config Vercel deployments via `vercel.json`.

### One-time setup

1. Import the repo in the [Vercel dashboard](https://vercel.com/new).
2. Create the following [Vercel secrets](https://vercel.com/docs/concepts/projects/environment-variables) (names must match `vercel.json`):

   | Secret name | Value |
   |---|---|
   | `database-url` | Production PostgreSQL connection string |
   | `nextauth-secret` | 32-char random string |
   | `nextauth-url` | `https://<your-domain>` |
   | `google-client-id` | Google OAuth client ID |
   | `google-client-secret` | Google OAuth client secret |
   | `github-client-id` | GitHub OAuth app client ID |
   | `github-client-secret` | GitHub OAuth app client secret |
   | `yandex-maps-api-key` | Yandex Maps JS API key |
   | `yandex-weather-api-key` | Yandex Weather API key |

3. Add your Vercel domain to the **Authorised redirect URIs** of both OAuth apps:
   - Google: `https://<domain>/api/auth/callback/google`
   - GitHub: `https://<domain>/api/auth/callback/github`

### Deployment checklist

- [ ] Branch merged only after CI is green
- [ ] Production secrets set in Vercel (all keys from `vercel.json`)
- [ ] OAuth callback URLs updated for production domain
- [ ] Production database reachable
- [ ] Photo storage strategy verified:
  - Vercel/self-host with ephemeral disk: use persistent volume or external object storage
  - Self-host with persistent disk: ensure `storage/photos` is writable and backed up
- [ ] `prisma migrate deploy` completed successfully
- [ ] Post-deploy smoke checks completed

### Database migrations in production

Run migrations against the production database **before** deploying:

```bash
DATABASE_URL=<prod-url> npx prisma migrate deploy
```

This is safe to run repeatedly — Prisma only applies unapplied migrations.

### Rollback / restore guidance

- **Application rollback:** redeploy previous known-good release.
- **Database rollback:** restore from backup/snapshot, or apply a corrective forward migration.
- Do not roll back schema manually without a tested restore plan.

---

## Health checks and observability

- `/api/health` — process-level liveness check
- `/api/ready` — readiness check
  - `?checkDb=1` enables database connectivity check
  - `?checkExternal=1` validates weather/maps API key presence

The server emits structured JSON logs for key failures:

- auth configuration warnings
- weather fetch failures
- photo upload failures
- route API DB failures

Minimum recommended alerts:

1. App startup failures / crash loops
2. Sustained 5xx error rate
3. DB readiness failures (`/api/ready?checkDb=1`)

---

## Staging and production verification

### Staging pre-release smoke tests

1. Sign in/out with OAuth
2. Access protected routes (`/profile`, `/routes/builder`)
3. Read route list/details
4. Call weather endpoint
5. Upload and fetch photo
6. Create route
7. Verify `/api/ready?checkDb=1&checkExternal=1`

### Production rollout runbook

1. Run `DATABASE_URL=<prod-url> npx prisma migrate deploy`
2. Deploy application
3. Run full smoke test pack
4. Monitor logs/alerts during observation window
5. If required, roll back app release and execute DB restore policy

---

## Project structure

```
app/
  (auth)/login|register/   – public auth pages
  api/                     – Next.js Route Handlers
    auth/[...nextauth]/    – NextAuth handler
    parks/                 – park listing
    routes/                – route CRUD
    photos/                – server-side upload
    weather/               – Yandex Weather proxy
  uploads/                 – stored photo delivery
  map/                     – interactive map page
  parks/[id]/              – park detail page
  routes/builder/          – route builder (protected)
  profile/                 – user profile (protected)
components/
  map/                     – MapContainer (Yandex Maps)
  routes/                  – RouteCard, FilterSidebar, …
  weather/                 – WeatherWidget
  ui/                      – shared shadcn components
lib/
  auth.ts                  – NextAuth config
  db.ts                    – Prisma client singleton
  weather/yandex.ts        – typed weather fetch + trail-status logic
  server/photo-storage.ts  – filesystem photo storage helpers
prisma/
  schema.prisma            – database schema
scripts/
  import-osm.ts            – seed parks from OpenStreetMap
__tests__/
  lib/weather.test.ts      – unit tests for trail-status logic
  proxy.test.ts            – unit tests for middleware route protection
```

---

## Troubleshooting

### `PrismaClientInitializationError` on startup

Ensure `DATABASE_URL` is set and the database is reachable. Run `npx prisma generate` if the Prisma client is out of sync with the schema.

### OAuth redirect mismatch

The callback URL registered with the provider must exactly match `NEXTAUTH_URL + /api/auth/callback/<provider>`. Update both the provider console and `NEXTAUTH_URL`.

### Map not loading

Confirm `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` is set and enabled for the Yandex Maps JS API.

### Photo upload fails

Confirm the app can write to `storage/photos` at runtime. Server-side filesystem uploads do not persist on read-only or ephemeral disks.

### Weather widget shows "Failed to fetch weather"

Confirm `YANDEX_WEATHER_API_KEY` is set and valid. The weather route proxies Yandex Weather responses into the app's existing weather shape.
