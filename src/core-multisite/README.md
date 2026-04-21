# core-multisite

Multi-tenant site isolation for Indigo. Run multiple independent sites from a single deployment using PostgreSQL schema-per-site isolation.

## What it does

- Each site gets its own PostgreSQL schema (`site_abc.cms_posts`, `site_abc.cms_categories`, etc.)
- Staff users (dashboard) are shared across sites with per-site roles
- Customers are fully isolated per site
- Per-site branding via CSS token overrides (brandHue, accentHue, grayHue, logo, favicon)
- Per-site locales, SEO config, API keys
- Custom domain support with DNS TXT verification (max 20 per site)
- Full lifecycle: create → suspend → restore → soft-delete → hard-delete
- Site cloning with content copy
- Network admin dashboard for superadmins (auto-seeded on init)
- Site switcher in dashboard header
- Audit logging + webhook events on all mutations

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
bun run init  # auto-creates network admin site
```

## Post-Install

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "site:create": "bun run src/scripts/site-create.ts",
    "site:delete": "bun run src/scripts/site-delete.ts",
    "site:suspend": "bun run src/scripts/site-suspend.ts",
    "site:unsuspend": "bun run src/scripts/site-unsuspend.ts",
    "site:restore": "bun run src/scripts/site-restore.ts",
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

The `config/deps/multisite-deps.ts` file is auto-scaffolded by `indigo add`. It's imported as a side-effect via `serverInit` in `module.config.ts` — no manual wiring needed.

Edit `src/config/deps/multisite-deps.ts` to customize if needed.

### 3. Integrate proxy middleware (REQUIRED)

**Option A: Use the context helper (recommended)**

```typescript
// proxy.ts
import { applySiteHeaders } from '@/core-multisite/lib/context-helper';

// Inside the proxy function, BEFORE locale detection:
const siteHeaders = await applySiteHeaders(request);
if (siteHeaders) {
  for (const [key, value] of Object.entries(siteHeaders)) {
    response.headers.set(key, value);
  }
}
```

Then in `src/server/trpc.ts`:

```typescript
import { extractSiteContext, applySiteSearchPath } from '@/core-multisite/lib/context-helper';

// In createTRPCContext:
const site = extractSiteContext(opts.headers);
if (site) {
  await applySiteSearchPath(site.schemaName);
}

return {
  session, db, headers: opts.headers,
  siteId: site?.siteId ?? null,
};
```

**Option B: Manual integration**

```typescript
// proxy.ts
import { resolveSiteFromRequest, resolveDashboardSite } from '@/core-multisite/lib/site-middleware';

const siteContext = await resolveSiteFromRequest(request);
if (siteContext) {
  const dashSite = pathname.startsWith('/dashboard')
    ? await resolveDashboardSite(request)
    : siteContext;
  const activeSite = dashSite ?? siteContext;

  response.headers.set('x-site-id', activeSite.id);
  response.headers.set('x-site-schema', activeSite.schemaName);
}

// trpc.ts
const siteSchema = opts.headers.get('x-site-schema');
if (siteSchema) {
  await db.execute(sql.raw(`SET search_path TO "${siteSchema}", public`));
}
```

> Without this integration, all requests are treated as single-site.

### 4. Create your first site

The network admin site (`__network__`) is auto-created by `bun run init`. For additional sites:

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

# Suspend a site (blocks public access, dashboard still works)
bun run site:suspend <slug>

# Unsuspend a site
bun run site:unsuspend <slug>

# Soft-delete a site (disables it, preserves data)
bun run site:delete <slug>

# Restore a soft-deleted site
bun run site:restore <slug>

# Hard-delete a site (drops schema, irreversible)
bun run site:delete <slug> --hard

# Run migrations on all site schemas
bun run db:migrate:sites
```

## Site Lifecycle

```
create → ACTIVE ←→ SUSPENDED
            ↓
     soft-delete (DELETED)
         ↙       ↘
   restore      hard-delete
   (ACTIVE)     (permanent)
```

- **Active:** normal operation, public requests resolved
- **Suspended:** site exists but blocked from public resolution. Dashboard still accessible for admins. Use for maintenance or policy violations.
- **Deleted (soft):** marked for deletion, can still be restored
- **Hard-deleted:** schema dropped, all records destroyed (irreversible, requires prior soft-delete)

## Router API

| Procedure | Auth | Description |
|-----------|------|-------------|
| `sites.list` | staff | List sites (superadmin: all, staff: their own) |
| `sites.getById` | superadmin | Get site with domains + members |
| `sites.stats` | superadmin | Aggregate stats (active/suspended sites, domains, members) |
| `sites.create` | superadmin | Create site + schema + migrations |
| `sites.update` | superadmin | Update name, locales, settings |
| `sites.suspend` | superadmin | Suspend active site |
| `sites.unsuspend` | superadmin | Unsuspend suspended site |
| `sites.softDelete` | superadmin | Soft-delete site |
| `sites.restore` | superadmin | Restore soft-deleted site |
| `sites.hardDelete` | superadmin | Drop schema, permanent delete |
| `sites.clone` | superadmin | Clone site (settings + content) |
| `sites.addDomain` | superadmin | Add custom domain (max 20/site) |
| `sites.removeDomain` | superadmin | Remove domain |
| `sites.listDomains` | superadmin | List domains for site |
| `sites.addMember` | superadmin | Add/update site member |
| `sites.removeMember` | superadmin | Remove site member |
| `sites.setActive` | staff | Set active site for dashboard |

## Webhook Events

All lifecycle events dispatch webhooks (if configured):

- `site.created` — includes `clonedFrom` if cloned
- `site.updated`
- `site.suspended`, `site.unsuspended`
- `site.deleted`, `site.restored`, `site.hard_deleted`
- `domain.added`, `domain.removed`, `domain.verified`
- `member.added`, `member.removed`

## How it works

### Request flow

```
Request: https://cool-sneakers.com/blog/new-arrivals
  1. Proxy calls applySiteHeaders(request) → x-site-* headers
  2. tRPC context calls extractSiteContext(headers) + applySiteSearchPath()
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
  "grayHue": 240,
  "logoUrl": "/uploads/site_abc/logo.png",
  "faviconUrl": "/uploads/site_abc/favicon.ico",
  "contactEmail": "hello@cool-sneakers.com"
}
```

The root layout injects these as CSS custom properties, and the OKLCH token system derives the entire palette automatically. Edit branding from the dashboard at **Sites > [site] > Branding**.

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
| `routers/sites.ts` | Full CRUD + lifecycle + clone + stats |
| `lib/site-resolver.ts` | Domain/slug → site lookup (60s in-memory cache) |
| `lib/site-middleware.ts` | Proxy helper: Host header → site context |
| `lib/context-helper.ts` | tRPC + proxy integration helpers |
| `lib/schema-manager.ts` | CREATE/DROP SCHEMA, Drizzle migration runner |
| `lib/site-config.ts` | Runtime per-site config (replaces static siteConfig) |
| `lib/cli.ts` | CLI: create, delete, suspend, unsuspend, restore, list |
| `seed/network-admin.ts` | Auto-seeds `__network__` admin site |
| `components/SiteSwitcher.tsx` | Dashboard site picker dropdown |
| `hooks/useSitesApi.ts` | Typed React hook for sites router (no `as any`) |
| `jobs/dns-verification.ts` | Periodic DNS TXT checker + `domain.verified` webhook |
| `deps.ts` | Dependency injection interface |

## Validation

- **Locales:** validated against `LOCALES` from constants on create/update
- **Domains:** max 20 per site, uniqueness enforced globally
- **Slugs:** auto-generated from name, unique constraint enforced

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
