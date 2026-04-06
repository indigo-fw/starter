# Deployment Guide

> **Note:** This is the cheapest, no-frills deployment — not the best. It gets you running for ~$4/mo on a single VPS. For production apps with high traffic, stricter uptime requirements, or compliance needs, consider managed databases, multi-region setups, or a proper PaaS. This guide prioritizes simplicity and cost over everything else.

## Stack Overview

| Component | Service                                  | Cost       |
| --------- | ---------------------------------------- | ---------- |
| VPS       | Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) | ~$4/mo     |
| CI/CD     | GitHub Actions                           | Free       |
| CDN + SSL | Cloudflare                               | Free       |
| Email     | Resend (3K emails/mo) or Brevo (300/day) | Free       |
| **Total** |                                          | **~$4/mo** |

This setup handles ~100-200 concurrent users (~5,000-10,000 daily visitors). To scale up, upgrade to CX32 (4 vCPU, 8GB, ~$7/mo).

## 1. Provision the VPS

1. Create a [Hetzner Cloud](https://www.hetzner.com/cloud) account
2. Create a new server:
   - **Location:** closest to your users (e.g. Falkenstein for EU)
   - **Image:** Ubuntu 24.04
   - **Type:** CX22 (2 vCPU, 4GB RAM)
   - **SSH key:** add your public key
3. Note the server IP address

## 2. Server Setup

SSH into your server and install Docker:

```bash
ssh root@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin (if not included)
apt install -y docker-compose-plugin

# Create app directory
mkdir -p /opt/indigo
```

## 3. Configure Environment

Create the `.env` file on the server:

```bash
cat > /opt/indigo/.env << 'EOF'
# ─── Required ──────────────────────────────────────────────────────────────
POSTGRES_PASSWORD=GENERATE_WITH_openssl_rand_hex_16
BETTER_AUTH_SECRET=GENERATE_WITH_openssl_rand_hex_32
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_SITE_NAME=Your Site Name

# ─── Email (pick one free provider) ────────────────────────────────────────
# Resend (3K emails/mo free): https://resend.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_YOUR_API_KEY
FROM_EMAIL=noreply@yourdomain.com

# ─── Optional ──────────────────────────────────────────────────────────────
# STORAGE_BACKEND=filesystem
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
EOF
```

Generate secrets:

```bash
# Generate and paste into .env
openssl rand -hex 16  # for POSTGRES_PASSWORD
openssl rand -hex 32  # for BETTER_AUTH_SECRET
```

## 4. Copy Docker Files

Copy the production Docker Compose file and Dockerfile to the server. You can either `git clone` your repo or use `scp`:

```bash
# Option A: Clone the repo on the server
cd /opt/indigo
git clone git@github.com:YOUR_USER/YOUR_REPO.git .

# Option B: Copy files manually
scp docker-compose.prod.yml Dockerfile docker-entrypoint.sh root@YOUR_SERVER_IP:/opt/indigo/
```

## 5. Deploy

```bash
cd /opt/indigo
docker compose -f docker-compose.prod.yml up -d --build
```

First run automatically:

- Starts PostgreSQL and Redis
- Builds the app container
- Runs database migrations (via `docker-entrypoint.sh`)

Initialize the CMS (first time only):

```bash
# Create superadmin and seed default content
docker compose -f docker-compose.prod.yml exec app bun run init
```

Verify everything is running:

```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000/api/health
```

## 6. Cloudflare Setup (Free CDN + SSL)

1. Create a [Cloudflare](https://www.cloudflare.com) account
2. Add your domain and update nameservers at your registrar
3. Add DNS records:
   - **A record:** `@` -> `YOUR_SERVER_IP` (proxied, orange cloud)
   - **A record:** `www` -> `YOUR_SERVER_IP` (proxied, orange cloud)
4. SSL/TLS settings:
   - Set encryption mode to **Full (strict)**
   - Enable **Always Use HTTPS**
5. Install an origin certificate on the server (for encrypted Cloudflare -> server traffic):

```bash
# Install Nginx as reverse proxy
apt install -y nginx

# Create Nginx config
cat > /etc/nginx/sites-available/indigo << 'EOF'
server {
    listen 443 ssl;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}
EOF

ln -s /etc/nginx/sites-available/indigo /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

To get the origin certificate:

1. In Cloudflare dashboard -> SSL/TLS -> Origin Server -> Create Certificate
2. Save the certificate to `/etc/ssl/cloudflare/origin.pem`
3. Save the private key to `/etc/ssl/cloudflare/origin-key.pem`

## 7. GitHub Actions (Auto-Deploy)

Create `.github/workflows/deploy.yml` in your repo:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/indigo
            git pull origin main
            docker compose -f docker-compose.prod.yml up -d --build
            docker image prune -f
```

Add GitHub repository secrets:

1. Go to your repo -> Settings -> Secrets -> Actions
2. Add `VPS_HOST` = your server IP
3. Add `VPS_SSH_KEY` = your private SSH key (the one whose public key is on the server)

Now every push to `main` automatically deploys.

## 8. Backups

Set up a daily PostgreSQL backup with a cron job on the server:

```bash
mkdir -p /opt/backups

# Add daily backup cron (runs at 3 AM)
(crontab -l 2>/dev/null; echo '0 3 * * * docker compose -f /opt/indigo/docker-compose.prod.yml exec -T postgres pg_dump -U indigo indigo | gzip > /opt/backups/indigo-$(date +\%Y\%m\%d).sql.gz && find /opt/backups -mtime +7 -delete') | crontab -
```

This keeps the last 7 days of backups. For offsite backups, sync to an S3-compatible storage (Hetzner Object Storage is ~$1/mo for small amounts).

## Common Operations

```bash
cd /opt/indigo

# View logs
docker compose -f docker-compose.prod.yml logs -f app

# Restart the app
docker compose -f docker-compose.prod.yml restart app

# Run database migrations manually
docker compose -f docker-compose.prod.yml exec app bun run db:migrate

# Promote a user to superadmin
docker compose -f docker-compose.prod.yml exec app bun run promote user@example.com

# Change a user's password
docker compose -f docker-compose.prod.yml exec app bun run change-password user@example.com

# Open database shell
docker compose -f docker-compose.prod.yml exec postgres psql -U indigo

# Stop everything
docker compose -f docker-compose.prod.yml down

# Full rebuild (after major changes)
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

## Scaling Up

When you outgrow the single VPS:

1. **Upgrade VPS:** CX32 (4 vCPU, 8GB) ~$7/mo — doubles capacity
2. **Split roles:** Run `SERVER_ROLE=frontend` on one VPS and `SERVER_ROLE=worker` on another
3. **Managed database:** Move PostgreSQL to Hetzner Managed Database or Neon when DB load is the bottleneck
4. **S3 storage:** Switch `STORAGE_BACKEND=s3` and use Hetzner Object Storage or Cloudflare R2 for uploads
5. **Multiple instances:** Add Redis (`REDIS_URL`) for cross-instance WebSocket pub/sub and rate limiting
