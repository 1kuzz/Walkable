# Contributing to MOPS Portal

## Start here

1. read [README.md](README.md) for the project overview
2. read [QUICKSTART.md](QUICKSTART.md) for setup
3. read [docs/RUNBOOK.md](docs/RUNBOOK.md) before changing production or operator behavior
4. read the relevant audience docs before editing user, admin, auth, or API behavior

## Local workflow

```bash
cd /home/runner/work/PortalReliability/PortalReliability
make doctor
./setup.sh --dev-full
```

## Existing validation commands

Run the existing checks before opening a pull request:

```bash
npm run lint
npm run check:i18n
npm run lint:md
npm run check:links
npm run docs:api
npm run build
npm run test
npm run test:e2e
cd backend && npm run build
```

Known baseline issues to keep in mind when validating docs:

- `npm run lint:md` has pre-existing `CHANGELOG.md` line-length warnings
- `npm run check:links` should pass after keeping repository links current

## Branching and commits

- branch from `develop`
- use Conventional Commits
- keep commit message body lines within the commitlint limits already enforced by the repo

Examples:

```text
feat: add readiness probe coverage to smoke tests
fix: tighten backend startup validation
chore: refresh runbook navigation
```

## Repository conventions

| Topic | Convention |
|---|---|
| CSS | CSS Modules per component or page |
| Env vars | frontend reads config through `src/config/index.ts`; avoid direct `import.meta.env` access |
| Services | frontend API calls go through `src/api/apiClient.ts` |
| Tests | service tests should isolate storage state in `beforeEach` |
| Types | keep interfaces close to the owning module unless broadly shared |
| Docs | update the audience-specific doc, not just the nearest file |
| i18n | add UI strings via `src/i18n/*` keys and validate with `npm run check:i18n` |

## Documentation source-of-truth map

Use the right document for the right audience:

| Audience | Canonical document |
|---|---|
| Product / repo overview | [README.md](README.md) |
| First local run | [QUICKSTART.md](QUICKSTART.md) |
| Operators / production | [docs/RUNBOOK.md](docs/RUNBOOK.md) |
| End users | [docs/user-guide.md](docs/user-guide.md) |
| Portal admins | [docs/admin-guide.md](docs/admin-guide.md) |
| Authentication / SSO | [docs/authentication.md](docs/authentication.md) |
| Backend routes / schema | [docs/backend-api.md](docs/backend-api.md) |
| Infrastructure deployment | [deploy/README.md](deploy/README.md) |

## Documentation maintenance checklist

Before merging, check every relevant item:

- [ ] route or screen changed -> update `README.md`, user docs, or admin docs as needed
- [ ] auth flow changed -> update `docs/authentication.md`, `docs/cbasts-oidc-setup.md`, and any
      login references
- [ ] env var changed -> update `.env.example`, `README.md`, and `QUICKSTART.md`
- [ ] backend route or response changed -> update `docs/backend-api.md` and `docs/api-integration.md`
- [ ] deployment flow changed -> update `docs/RUNBOOK.md` and `deploy/README.md`
- [ ] schema or migration changed -> update `docs/backend-api.md`
- [ ] security behavior changed -> update `SECURITY.md`
- [ ] operator automation changed -> update `docs/RUNBOOK.md`
- [ ] changed docs still pass markdown lint and link checks

## Pull request expectations

A good PR for this repository should:

- keep docs and implementation aligned
- preserve existing validation commands
- explain any remaining placeholders or operational limitations clearly
- avoid leaving route paths, env names, or Make targets inconsistent across docs
