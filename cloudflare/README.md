# Cloudflare Configuration

Recommended Cloudflare settings for Indigo deployments. Rules in `rules.json` are API-ready for the [Cloudflare API](https://developers.cloudflare.com/api/).

## Quick Setup

1. **SSL/TLS:** Full (Strict) mode
2. **Always Use HTTPS:** On
3. **Brotli:** On
4. **Auto Minify:** Off (Next.js already minifies)

## Rate Limiting

Apply via **Security > WAF > Rate limiting rules** or API (`http_ratelimit` phase):

| Route | Limit | Window | Purpose |
|---|---|---|---|
| `/dashboard/login` | 5 req | 10s per IP | Brute force protection |
| `/dashboard/register` | 3 req | 60s per IP | Registration abuse |
| `/dashboard/forgot-password` | 3 req | 60s per IP | Reset flood protection |
| `/api/auth/*` | 10 req | 60s per IP | Better Auth endpoints |
| `/api/upload` | 20 req | 60s per IP | Upload abuse |
| `/api/forms/*/submit` | 5 req | 60s per IP | Form spam |

## WAF Custom Rules

Apply via **Security > WAF > Custom rules** or API (`http_request_firewall_custom` phase):

- Block bot user agents on `/dashboard/*`
- Block empty User-Agent on `/api/*`
- JS Challenge on `/dashboard/login` for suspicious traffic

## Cache Rules

Apply via **Caching > Cache Rules** or API:

- `/uploads/*` — cache 30 days (Edge TTL)
- Static assets (`.js`, `.css`, `.ico`, `.woff2`) — cache 1 year
- `/api/*` and `/dashboard/*` — bypass cache

## Applying via API

```bash
# Set zone ID
ZONE_ID="your-zone-id"
API_TOKEN="your-api-token"

# Create rulesets from rules.json
curl -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_ratelimit/entrypoint" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @rules.json
```

See `rules.json` for the full ruleset definitions.
