---
title: Deployment
section: Guides
order: 2
description: Deploy Indigo to production on a VPS with Docker
---

# Deployment

This guide covers deploying Indigo to a single VPS for ~$4/month.

## Stack Overview

| Component | Service | Cost |
|-----------|---------|------|
| VPS | Hetzner CX22 (2 vCPU, 4GB RAM) | ~$4/mo |
| CI/CD | GitHub Actions | Free |
| CDN + SSL | Cloudflare | Free |
| Email | Resend (3K emails/mo) | Free |

## Quick Deploy

```bash
# On your VPS
ssh root@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone and configure
mkdir -p /opt/indigo && cd /opt/indigo
git clone git@github.com:YOUR_USER/YOUR_REPO.git .
cp .env.example .env
# Edit .env with production values

# Start everything
docker compose -f docker-compose.prod.yml up -d --build

# Initialize (first time only)
docker compose -f docker-compose.prod.yml exec app bun run init
```

## Common Operations

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f app

# Restart
docker compose -f docker-compose.prod.yml restart app

# Run migrations
docker compose -f docker-compose.prod.yml exec app bun run db:migrate

# Promote a user
docker compose -f docker-compose.prod.yml exec app bun run promote user@example.com
```

> [!IMPORTANT]
> Always generate secrets with `openssl rand -hex 32` for `BETTER_AUTH_SECRET` and `openssl rand -hex 16` for `POSTGRES_PASSWORD`. Never use default values in production.

## Scaling Up

1. **Upgrade VPS** — CX32 (4 vCPU, 8GB) ~$7/mo doubles capacity
2. **Split roles** — `SERVER_ROLE=frontend` + `SERVER_ROLE=worker` on separate VPS
3. **Managed DB** — move PostgreSQL to Neon or Hetzner Managed Database
4. **S3 storage** — switch `STORAGE_BACKEND=s3` for uploads
