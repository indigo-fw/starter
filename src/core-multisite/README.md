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

## Post-Install

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "site:create": "bun run src/scripts/site-create.ts",
    "site:delete": "bun run src/scripts/site-delete.ts",
    "site:list": "bun run src/scripts/site-list.ts",
    "db:migrate:sites": "bun run src/scripts/migrate-sites.ts"
  }
}
```

## Configuration

### 1. Set base domain

Add to `.env`:

```env
MULTISITE_BASE_DOMAIN=yourdomain.com
```

This is used for temporary subdomains (`my-store.yourdomain.com`) and the network admin (`admin.yourdomain.com`).

### 2. Wire dependencies

The `config/multisite-deps.ts` file is auto-scaffolded by `indigo add`. It's imported as a side-effect via `serverInit` in `module.config.ts` — no manual wiring needed.

Edit `src/config/multisite-deps.ts` to customize if needed.

### 3. Integrate proxy middleware (REQUIRED)

Add site resolution to `src/proxy.ts`. This connects incoming domains to site schemas:

```typescript
// At the top of proxy.ts, add:
import { resolveSiteFromRequest, resolveDashboardSite } from '@/core-multisite/lib/site-middleware';
import { withScope } from '@/core/lib/infra/scope';
import { setSiteSearchPath, resetSearchPath } from '@/core-multisite/lib/schema-manager';

// Inside the proxy function, BEFORE locale detection:

// ── Multisite resolution ──
const siteContext = await resolveSiteFromRequest(request);
if (siteContext) {
  // For dashboard: check cookie-based site selection
  const dashSite = pathname.startsWith('/dashboard')
    ? await resolveDashboardSite(request)
    : siteContext;
  const activeSite = dashSite ?? siteContext;

  const url = request.nextUrl.clone();
  const response = NextResponse.rewrite(url);
  response.headers.set('x-site-id', activeSite.id);
  response.headers.set('x-site-schema', activeSite.schemaName);
  response.headers.set('x-site-name', activeSite.name);
  // Continue with locale detection using site's locales...
}
```

Then in your tRPC context (`src/server/trpc.ts`), read the site headers:

```typescript
// In createTRPCContext:
const siteId = opts.headers.get('x-site-id') ?? null;
const siteSchema = opts.headers.get('x-site-schema') ?? null;

// Set search_path if multisite
if (siteSchema) {
  await db.execute(sql.raw(`SET search_path TO "${siteSchema}", public`));
}

return {
  session, db, headers: opts.headers,
  activeOrganizationId: ...,
  siteId,     // NEW
  siteSchema, // NEW
};
```

> Without this integration, all requests are treated as single-site.

### 4. Create the network admin site

```bash
bun run site:create "Network Admin" --slug=__network__
```

This creates the site that powers `admin.yourdomain.com`.

### 5. Create your first site

```bash
bun run site:create "Cool Sneakers" --slug=cool-sneakers --locale=en
```

The site is immediately available at `cool-sneakers.yourdomain.com`.

### 6. Add a custom domain

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
