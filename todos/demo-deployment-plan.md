# Plan: indigo-fw.dev — Demo + Docs Deployment

## Goal

Public hosted instance of Indigo at `demo.indigo-fw.dev` for prospects to poke at, plus docs at `demo.indigo-fw.dev/docs` served from the same instance's `.mdx` files. Apex `indigo-fw.dev` reserved for a future marketing site. One VPS for now.

## Topology

### Phase 1 — now (demo+docs only)
```
Cloudflare DNS/CDN
        │
        ├── demo.indigo-fw.dev ─── Hetzner CX22 ──┐
        │                                         ├── Indigo container (app+ws)
        │                                         ├── Postgres container
        │                                         ├── Redis container
        │                                         └── Caddy/Traefik (TLS, host routing)
        └── indigo-fw.dev (apex) ── parked / "coming soon" static
```

### Phase 2 — when marketing site exists
Two paths, decide then:
- **A. Same VPS:** add second compose stack (separate DB), bump to CX32 (€6.81/mo, 4 vCPU / 8GB). Routes `indigo-fw.dev` to marketing stack, `demo.*` to demo stack.
- **B. Marketing on Cloudflare Pages:** free, static-first, calls demo's tRPC for any dynamic bits. CX22 stays.

Don't decide now. Build demo first.

## Decisions

| Concern | Choice | Why |
|---|---|---|
| Registrar | Cloudflare Registrar | At-cost (~$11/yr .dev), same dashboard as DNS, no upsells |
| DNS / CDN / SSL | Cloudflare | Free, fast, DDoS shield, integrates with Pages later |
| VPS | Hetzner CX22 (€3.79/mo, Falkenstein) | Matches deployment doc's blueprint; comfortable for low-traffic demo |
| OS / runtime | Ubuntu 24.04 + Docker Compose | Per `docs/en/guides/02-deployment.mdx` |
| Inbound email (`info@`) | Zoho Mail Free | Real inbox UI, IMAP/SMTP, 1 user / 5 GB, $0 forever |
| Outbound email (app) | Resend | Already in deployment doc; 3K emails/mo free; separate from `info@` inbox |
| CI/CD | GitHub Actions → GHCR → SSH deploy | Public repo = unlimited free minutes; SHA-pinned images = rollbackable |
| Demo reset | hourly `bun run init -- -y --reset` via cron | Already supported, see `src/scripts/init.ts:7` + README:220 |
| Docs | Same instance, served at `/docs` from existing `core-docs` module | `.mdx` is file-backed → reset never breaks docs |

## Domains & DNS

| Record | Type | Value | Notes |
|---|---|---|---|
| `indigo-fw.dev` | A | placeholder / Cloudflare Pages later | Marketing not built yet |
| `demo.indigo-fw.dev` | A | <hetzner-ipv4> | Proxied through Cloudflare |
| `demo.indigo-fw.dev` | AAAA | <hetzner-ipv6> | Proxied through Cloudflare |
| `indigo-fw.dev` | MX 10 | `mx.zoho.com` | Zoho mail |
| `indigo-fw.dev` | MX 20 | `mx2.zoho.com` | Zoho mail |
| `indigo-fw.dev` | MX 50 | `mx3.zoho.com` | Zoho mail |
| `indigo-fw.dev` | TXT | `v=spf1 include:zoho.com include:resend.com ~all` | SPF — Zoho receive + Resend send |
| `zmverify.indigo-fw.dev` | CNAME / TXT | per Zoho onboarding | Domain verification |
| `resend._domainkey.indigo-fw.dev` | TXT | per Resend onboarding | DKIM for outbound |
| `_dmarc.indigo-fw.dev` | TXT | `v=DMARC1; p=quarantine; rua=mailto:info@indigo-fw.dev` | Phishing protection |

Cloudflare proxy ON for the demo A/AAAA records; OFF for MX/TXT.

## Demo box config

`/opt/indigo/.env` (production, generated once):

```env
NODE_ENV=production
DATABASE_URL=postgresql://indigo:<gen>@postgres:5432/indigo
REDIS_URL=redis://redis:6379

BETTER_AUTH_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
POSTGRES_PASSWORD=<openssl rand -hex 16>

NEXT_PUBLIC_APP_URL=https://demo.indigo-fw.dev
NEXT_PUBLIC_SITE_NAME=Indigo Demo

# Outbound transactional (Resend)
RESEND_API_KEY=<from resend>
EMAIL_FROM="Indigo Demo <noreply@indigo-fw.dev>"

# Demo reset credentials (shown on login screen)
INIT_ADMIN_EMAIL=demo@indigo-fw.dev
INIT_ADMIN_PASSWORD=demo1234
INIT_ADMIN_NAME=Demo Admin
```

Hourly reset cron (on the VPS, `root` crontab):

```cron
0 * * * * cd /opt/indigo && docker compose -f docker-compose.prod.yml exec -T app bun run init -- -y --reset >> /var/log/indigo-reset.log 2>&1
```

## CI/CD shape

`.github/workflows/deploy-demo.yml`:

```yaml
name: deploy-demo
on:
  push: { branches: [main] }
  workflow_dispatch:
concurrency: { group: deploy-demo, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { packages: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ghcr.io/indigo-fw/starter:${{ github.sha }}
            ghcr.io/indigo-fw/starter:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEMO_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/indigo
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d
            docker image prune -f
```

Build runs on GitHub's runners (never on the VPS — CX22 can't spare 4 GB for `next build` while serving traffic).

## Rate limiting / abuse

Cloudflare WAF rules on `demo.indigo-fw.dev`:
- Rate-limit `/api/*` to 60 req/min per IP
- Block known bad ASNs (Cloudflare's threat score > 25)
- Challenge `/dashboard/*` from non-residential ASNs
- `robots.txt`: `Disallow: /` on `demo.*` (don't pollute search index — canonical docs live on apex eventually)

## Demo login surface

Login screen banner: "Demo resets every hour. Admin: `demo@indigo-fw.dev` / `demo1234`." (or just auto-login button — decide during build).

Disable on the demo:
- Real outbound email to user-provided addresses (signups). Either dry-run Resend (log only) or send-to-blackhole. **Don't** spam real signups.
- File uploads bigger than 1 MB
- Cron-triggered cleanups that could clash with the hourly reset

## Provisioning checklist

Order matters.

1. **Domain**
   - [ ] Register `indigo-fw.dev` via Cloudflare Registrar (~$11/yr)
   - [ ] Site enrolled in Cloudflare, nameservers point to CF (automatic when bought there)
2. **Email**
   - [ ] Zoho Mail Free account, add domain `indigo-fw.dev`
   - [ ] Add MX + TXT (verify) records per Zoho wizard
   - [ ] Create `info@indigo-fw.dev` mailbox
   - [ ] Send/receive smoke test
3. **Outbound mail**
   - [ ] Resend account, add domain
   - [ ] Add DKIM + return-path TXT records
   - [ ] Generate `RESEND_API_KEY`
   - [ ] Send test from CLI: `curl -X POST https://api.resend.com/emails …`
   - [ ] Update SPF TXT to include both Zoho + Resend
4. **VPS**
   - [ ] Hetzner Cloud project; provision CX22 in `fsn1` (Falkenstein) or `nbg1` (Nuremberg)
   - [ ] Ubuntu 24.04, add SSH key, disable password auth
   - [ ] `apt update && apt full-upgrade`; install `docker` (`curl -fsSL https://get.docker.com | sh`)
   - [ ] Create `deploy` user, add to `docker` group, paste deploy SSH pubkey
   - [ ] UFW: allow 22/80/443, deny rest
   - [ ] Point `demo.indigo-fw.dev` A/AAAA at the VPS in Cloudflare (proxy ON)
5. **App skeleton on box**
   - [ ] `mkdir -p /opt/indigo && cd /opt/indigo`
   - [ ] Pull `docker-compose.prod.yml` from the repo (or `scp` it)
   - [ ] Generate and write `.env` (see "Demo box config" above)
   - [ ] `docker compose -f docker-compose.prod.yml pull && up -d`
   - [ ] `docker compose exec app bun run init -- -y` — first-time DB + seed
   - [ ] Confirm `https://demo.indigo-fw.dev` resolves with valid TLS
6. **CI/CD**
   - [ ] Generate dedicated `deploy` SSH keypair, install pubkey on VPS
   - [ ] GitHub repo secrets: `DEMO_HOST`, `DEPLOY_SSH_KEY`
   - [ ] Commit `.github/workflows/deploy-demo.yml` (see "CI/CD shape")
   - [ ] Make any tiny commit on `main` → workflow runs → verify image lands at GHCR + box pulls
7. **Reset cron**
   - [ ] Install crontab line on VPS (`crontab -e`, see "Demo box config")
   - [ ] Wait one full hour → verify `/var/log/indigo-reset.log` shows clean reset + reseed
8. **Hardening**
   - [ ] Cloudflare WAF rules (rate limits, ASN scoring)
   - [ ] `robots.txt` `Disallow: /`
   - [ ] Banner on login screen with reset notice + creds
   - [ ] Disable outbound email to user-provided addresses (env flag or Resend allow-list)
9. **Smoke test**
   - [ ] Sign up as a user, navigate dashboard
   - [ ] Visit `/docs` — verify `.mdx` rendering
   - [ ] Manually trigger reset → re-check both demo data and docs still serve

## Costs (annual)

| Item | Cost |
|---|---|
| `.dev` domain | ~$11 |
| Hetzner CX22 | €3.79 × 12 ≈ €46 |
| Cloudflare (DNS/CDN/WAF basic) | $0 |
| Zoho Mail Free | $0 |
| Resend free tier (3K/mo) | $0 |
| GitHub Actions (public repo) | $0 |
| **Total** | **≈ $65 / year** |

## Risks / open questions

- **Demo abuse.** WAF rate limits + hourly reset cap the blast radius, but a determined actor could still burn Resend quota or fill `cms_media`. Mitigation: cap signup email sending at app layer (read-only Resend, or env flag `EMAIL_DRY_RUN=1`).
- **GHCR public vs private?** Public is fine for a public starter image; private if you want to keep the production image private. No strong reason for private — decide.
- **One `deploy` user vs separate per env?** For one box it doesn't matter; revisit when marketing box exists.
- **Cron drift on reset.** If a reset overlaps a long migration, future resets will queue. The current init flow is bounded (~30s on this seed set), so safe — but watch logs early.
- **Docs canonical URL.** Once marketing exists at apex, serve `/docs` from there *and* `demo.*`, with `<link rel="canonical">` on demo pointing to apex. Don't migrate URLs.
- **Should the apex parking page also be Indigo, or static HTML?** Probably static HTML / Cloudflare Pages until marketing exists — saves wasting the CX22 on idle marketing requests.
- **Backups.** Demo data is throwaway (reset hourly), but `.env` secrets and Hetzner snapshots aren't auto. Schedule weekly Hetzner snapshot (€0.0012/GB/h ≈ €0.50/mo) once provisioned.
