# Hardcoded Host Mappings

> Central registry of all hardcoded IP addresses used across the MOPS Portal
> infrastructure. These entries bypass DNS because Docker's internal DNS
> resolver cannot resolve corporate hostnames from within containers.

---

## Why DNS bypass is needed

Docker containers use an internal DNS resolver (`127.0.0.11`) that forwards
to the host's `/etc/resolv.conf`. In some corporate environments, certain
internal hostnames are not resolvable from within containers due to:

- Split-horizon DNS configurations
- VPN-only DNS servers not available to the Docker bridge network
- Docker DNS `SERVFAIL` on corporate hostnames

The workaround is to inject static host entries via `extra_hosts` in
compose files or `--add-host` in Docker build commands.

---

## Host Map

| Hostname | IP Address | Purpose | Used in |
|----------|-----------|---------|---------|
| `cbasts.kaspersky.com` | `10.88.83.82` | AD FS / OIDC identity provider | `docker-compose.prod.yml` (extra_hosts), `nginx.conf` (/adfs/ proxy_pass) |
| `confluence.kaspersky.com` | `10.68.197.18` | Confluence knowledge base API | `docker-compose.prod.yml` (extra_hosts), `docker-compose.staging.yml` (extra_hosts) |
| `repository.avp.ru` | `10.90.142.131` | Artifactory (npm + Docker registry) | `build-and-push.yml` (--add-host during Docker build) |

---

## When to update these IPs

Update the IPs if any of the following happen:

1. **Server migration** — the corporate service moves to a new IP
2. **DNS starts working** — if Docker DNS resolution is fixed, remove the
   `extra_hosts` entries entirely and rely on DNS
3. **Network reconfiguration** — VPN or firewall changes that affect routing

### Who to contact

- **AD FS (`cbasts.kaspersky.com`)**: ADFS-Administrators@kaspersky.com
- **Confluence**: Confluence admin team
- **Artifactory (`repository.avp.ru`)**: DevOps / infrastructure team

---

## Files that reference these IPs

```
docker-compose.prod.yml       → extra_hosts for cbasts + confluence
docker-compose.staging.yml    → extra_hosts for confluence
nginx.conf                    → proxy_pass for /adfs/ (cbasts IP)
build-and-push.yml            → --add-host for repository.avp.ru
scripts/upgrade.sh            → hardcoded REGISTRY variable
```

---

_Last updated: 2026-04-20_
