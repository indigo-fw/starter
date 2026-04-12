# core-multisite

Multi-tenant site isolation for Indigo. Run multiple independent sites from a single deployment using PostgreSQL schema-per-site isolation.

## What it does

- Each site gets its own PostgreSQL schema (`site_abc.cms_posts`, `site_abc.cms_categories`, etc.)
- Staff users (dashboard) are shared across sites with per-site roles
- Customers are fully isolated per site
- Per-site branding via CSS token overrides
- Per-site locales, SEO config, API keys
- Custom domain support with DNS TXT verification
- Network admin dashboard for superadmins
- Site switcher in dashboard header

## Prerequisites

- Indigo project with `core` installed
- PostgreSQL (schema support required — not available on some managed providers)
- Redis (recommended for cross-instance cache invalidation)

## Installation

```bash
bun run indigo add core-multisite
bun run indigo:sync
bun run db:generate
bun run db:migrate
```

## Configuration

### 1. Set base domain

Add to `.env`:

```env
MULTISITE_BASE_DOMAIN=yourdomain.com
```

This is used for temporary subdomains (`my-store.yourdomain.com`) and the network admin (`admin.yourdomain.com`).

### 2. Wire dependencies

Create `src/config/multisite-deps.ts`:

```typescript
import { setMultisiteDeps } from '@/core-multisite/deps';

setMultisiteDeps({
  baseDomain: process.env.MULTISITE_BASE_DOMAIN!,
});
```

Import as side-effect in `server.ts`:

```typescript
import '@/config/multisite-deps';
```

### 3. Create the network admin site

```bash
bun run site:create "Network Admin" --slug=__network__
```

This creates the site that powers `admin.yourdomain.com`.

### 4. Create your first site

```bash
bun run site:create "Cool Sneakers" --slug=cool-sneakers --locale=en
```

The site is immediately available at `cool-sneakers.yourdomain.com`.

### 5. Add a custom domain

From the network admin dashboard, go to **Sites > Cool Sneakers > Domains** and add `cool-sneakers.com`. Follow the DNS TXT verification instructions shown.

## CLI Commands

```bash
# Create a new site
bun run site:create <name> [--slug=my-store] [--locale=en]

# List all sites
bun run site:list

# Soft-delete a site (disables it, preserves data)
bun run site:delete <slug>

# Hard-delete a site (drops schema, irreversible)
bun run site:delete <slug> --hard

# Run migrations on all site schemas
bun run db:migrate:sites
```

## How it works

### Request flow

```
Request: https://cool-sneakers.com/blog/new-arrivals
  1. Proxy reads Host header → resolves to site_cool_sneakers
  2. Sets x-site-id header + wraps request in withScope(siteId)
  3. DB connection sets search_path = site_cool_sneakers, public
  4. All queries automatically hit site_cool_sneakers.* tables
  5. Caches keyed by siteId:... via getScopedKey()
  6. Response served with site's branding
```

### Schema layout

```
public schema (shared):              site_cool_sneakers schema (per-site):
├── user (staff accounts)             ├── customer
├── session                           ├── organization
├── sites                             ├── member
├── site_domains                      ├── cms_posts
├── site_members                      ├── cms_categories
└── ...                               ├── cms_terms
                                      ├── cms_portfolio
                                      ├── cms_showcase
                                      ├── cms_options
                                      ├── store_products
                                      ├── store_orders
                                      ├── media
                                      └── ...
```

### Per-site theming

Each site stores branding in its `settings` JSONB field:

```json
{
  "brandHue": 210,
  "accentHue": 45,
  "logoUrl": "/uploads/site_abc/logo.png",
  "faviconUrl": "/uploads/site_abc/favicon.ico"
}
```

The root layout injects these as CSS custom properties, and the OKLCH token system derives the entire palette automatically.

### Single-site compatibility

When `core-multisite` is **not installed**, everything works exactly as before:

- `getScope()` returns `null`
- `getScopedKey('foo')` returns `'foo'` (no prefix)
- `search_path` stays on `public`
- Zero overhead, zero behavior change

## Architecture

### Core plumbing (in `src/core/`)

The only core change is a generic scope primitive:

- `withScope(scopeId, fn)` — run callback within a scope
- `getScope()` — get current scope ID (null = single-site)
- `getScopedKey(...parts)` — build scope-prefixed cache key

All core caches (CMS links, content vars, email templates, MDX compile, stats, canonical config) use `getScopedKey()` for cache keys. This is transparent — single-site mode produces identical keys to before.

### Module files

| File | Purpose |
|------|---------|
| `schema/sites.ts` | `sites`, `site_domains`, `site_members` tables |
| `routers/sites.ts` | Full CRUD: sites, domains, members, setActive |
| `lib/site-resolver.ts` | Domain/slug → site lookup (60s in-memory cache) |
| `lib/site-middleware.ts` | Proxy helper: Host header → site context |
| `lib/schema-manager.ts` | CREATE/DROP SCHEMA, Drizzle migration runner |
| `lib/site-config.ts` | Runtime per-site config (replaces static siteConfig) |
| `lib/cli.ts` | CLI commands for site management |
| `components/SiteSwitcher.tsx` | Dashboard site picker dropdown |
| `jobs/dns-verification.ts` | Periodic DNS TXT record checker |
| `deps.ts` | Dependency injection interface |

## DNS Verification

When a custom domain is added:

1. System generates a random verification token
2. Admin sees: "Add TXT record: `indigo-verify=<token>`"
3. Background job checks DNS every 5 minutes
4. On success: domain marked as verified, site accessible on that domain

## Scaling

```
Load Balancer
├── cool-sneakers.com  → any instance
├── my-store.org       → any instance
└── admin.yourdomain.com → any instance
         ↓
    Instance 1, 2, 3...  (stateless)
         ↓
    PostgreSQL (all schemas)
    Redis (shared cache + pub/sub)
```

Any instance can serve any site. No sticky sessions. Scale horizontally by adding instances. Use `SERVER_ROLE` to split frontend/API/worker processes independently.
