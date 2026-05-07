# 🌿 Walkable

Discover, build, and share walking routes in parks. Check weather and trail conditions, browse community photos, and track your walking history.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth v4 (Google & GitHub OAuth) |
| Maps | Mapbox GL JS |
| Photos | Cloudinary |
| Weather | Open-Meteo (free, no key needed) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Tests | Vitest |

---

## Local development

### 1. Prerequisites

- Node.js ≥ 20
- PostgreSQL 14+ (local install or Docker)

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
| Mapbox token | Map pages |
| Cloudinary account | Photo upload |

Open-Meteo is free and requires no key.

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

**Recommended order before pushing:** lint → typecheck → test → build.

---

## CI pipeline

Three sequential jobs run on every push to `main` or `copilot/**` and on pull requests targeting `main`:

```
lint-and-typecheck → test → build
```

- **lint-and-typecheck** – ESLint + `tsc --noEmit`
- **test** – all Vitest unit tests
- **build** – `prisma generate` + `next build` with placeholder env vars

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
   | `mapbox-token` | Mapbox public access token |
   | `cloudinary-cloud-name` | Cloudinary cloud name |
   | `cloudinary-api-key` | Cloudinary API key |
   | `cloudinary-api-secret` | Cloudinary API secret |

3. Add your Vercel domain to the **Authorised redirect URIs** of both OAuth apps:
   - Google: `https://<domain>/api/auth/callback/google`
   - GitHub: `https://<domain>/api/auth/callback/github`

### Database migrations in production

Run migrations against the production database **before** deploying:

```bash
DATABASE_URL=<prod-url> npx prisma migrate deploy
```

This is safe to run repeatedly — Prisma only applies unapplied migrations.

---

## Project structure

```
app/
  (auth)/login|register/   – public auth pages
  api/                     – Next.js Route Handlers
    auth/[...nextauth]/    – NextAuth handler
    parks/                 – park listing
    routes/                – route CRUD
    photos/                – Cloudinary upload
    weather/               – Open-Meteo proxy
  map/                     – interactive map page
  parks/[id]/              – park detail page
  routes/builder/          – route builder (protected)
  profile/                 – user profile (protected)
components/
  map/                     – MapContainer (Mapbox)
  routes/                  – RouteCard, FilterSidebar, …
  weather/                 – WeatherWidget
  ui/                      – shared shadcn components
lib/
  auth.ts                  – NextAuth config
  db.ts                    – Prisma client singleton
  weather/open-meteo.ts    – typed weather fetch + trail-status logic
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

`NEXT_PUBLIC_MAPBOX_TOKEN` must start with `pk.`. Verify the token has the **Styles: read** and **Tiles: read** scopes in your Mapbox account.

### Photo upload fails

Confirm all three Cloudinary variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) are set. The `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` client-side variable must equal `CLOUDINARY_CLOUD_NAME`.

### Weather widget shows "Failed to fetch weather"

Open-Meteo is a public API that requires no key. If the widget fails, the issue is likely a network restriction in your environment (e.g., corporate proxy). The app degrades gracefully — other features are unaffected.
