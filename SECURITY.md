# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately to the MOPS security contacts:

- primary: `mops-team@kaspersky.com`
- secondary: the team contact configured through `VITE_TEAM_EMAIL`

Do not publish exploit details in public issues or pull requests.

## Disclosure expectations

After a report is received, the team aims to:

1. acknowledge receipt within 48 hours
2. assess impact and reproduction steps
3. provide mitigation guidance when possible
4. ship a fix and record it in `CHANGELOG.md`
5. coordinate disclosure timing with the reporter when needed

## Supported versions

| Version line | Status |
|---|---|
| `1.5.x` | supported |
| `1.0.x` to `1.4.x` | upgrade recommended |
| `< 1.0.0` | unsupported |

## Implemented controls

Current implemented controls include:

- OIDC Authorization Code + PKCE with `state` and `nonce` validation
- backend-issued `HS256` tokens for local accounts
- backend validation of signed OIDC tokens for SSO mode
- admin authorization resolved server-side instead of trusting JWT role claims
- `mops_session` HttpOnly cookie for auth-gated browser navigation and upload rendering
- rate limiting on auth and general API routes
- dedicated liveness and readiness health endpoints
- non-root runtime containers in production-style stacks
- read-only portal filesystem and `no-new-privileges` hardening in staging / prod compose files
- authenticated content rendering path for uploaded HTML
- backup, rollback, and secret-rotation operational tooling

## Operational limits and risks

Be explicit about current limits:

- uploaded content is access-controlled, but HTML / JS payloads are not malware-scanned before
  storage
- some portal feature areas still use placeholder datasets until connected to real upstream systems
- local / mock auth is for controlled environments only
- `VITE_*` values are public build-time configuration and must never contain secrets
- rotating `LOCAL_JWT_SECRET` invalidates active local sessions
- MFA enforcement depends on the configured corporate identity provider, not on portal code alone

## Operator recommendations

- set a unique strong `LOCAL_JWT_SECRET` in every environment
- set a strong `POSTGRES_PASSWORD` and keep backups recoverable
- keep `CORS_ORIGIN` restricted to the portal URL in production
- keep admin lists small and reviewed
- prefer OIDC / PKCE for production login
- use the runbook procedures for backup, restore, upgrade, smoke tests, and secret rotation
- review audit and usage data regularly

## Reference docs

- operations: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- authentication: [docs/authentication.md](docs/authentication.md)
- backend routes: [docs/backend-api.md](docs/backend-api.md)

_Last updated: 2026-04-20_
