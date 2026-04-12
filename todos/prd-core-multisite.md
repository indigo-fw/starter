# PRD: core-multisite — Multi-Tenant Site Isolation for Indigo

## Problem Statement

Indigo is a single-tenant framework — one deployment serves one site. Agencies, SaaS builders, and multi-brand operators need to run multiple independent storefronts/sites from a single Indigo installation. Today, the only option is deploying separate instances per site, which multiplies infrastructure cost, maintenance burden, and deployment complexity.

WordPress solved this with Multisite in 3.0 by prefixing tables (`wp_2_posts`, `wp_3_posts`) — a retrofit that created years of technical debt. Indigo has the opportunity to design multi-tenancy correctly from the start, using PostgreSQL's native schema isolation, before the codebase grows further.

## Solution

A `core-multisite` premium module that enables running multiple independent sites from a single Indigo deployment, using PostgreSQL schema-per-site isolation.

**Architecture:**
- Each site gets its own PostgreSQL schema (`site_abc.cms_posts`, `site_def.cms_posts`) containing all content, customer, and commerce tables
- Shared tables (`user`, `session`, `sites`, `site_domains`, `site_members`) remain in the `public` schema
- The proxy resolves incoming domain to a site, sets request-scoped context via `AsyncLocalStorage`
- Core gets a minimal scope primitive (~15 lines) that caches, Redis keys, and job queues read from — zero overhead when multisite is not installed
- Staff users (dashboard) are shared across sites with per-site roles; customers are fully isolated per site
- Per-site theming via CSS token overrides from database config
- Network admin dashboard at `admin.yourdomain.com` for superadmins to manage all sites

**Key principle:** When `core-multisite` is not installed, everything works exactly as today — no scope checks, no schema switching, no performance cost. The module is purely additive.

## User Stories

1. As a superadmin, I want to create a new site from the network admin dashboard, so that I can onboard a new store without touching infrastructure
2. As a superadmin, I want to create a new site via CLI (`bun run site:create`), so that I can script site provisioning in CI/CD
3. As a superadmin, I want each new site to get a temporary subdomain (`my-store.yourdomain.com`) immediately, so that I can start building content before DNS is configured
4. As a superadmin, I want to add a custom domain to a site and verify it via DNS TXT record, so that the site can be served on the client's own domain
5. As a superadmin, I want to view and manage all sites from a network admin dashboard at `admin.yourdomain.com`, so that I have a single control plane
6. As a superadmin, I want to access any site's dashboard without being explicitly added as a member, so that I can troubleshoot or manage any site
7. As a superadmin, I want to delete a site (soft-delete first, hard-delete later), so that I can recover from mistakes and clean up permanently when ready
8. As a site admin, I want to switch between sites I have access to via a dropdown in the dashboard header, so that I can manage multiple stores without logging out
9. As a site admin, I want to configure my site's branding (name, logo, favicon, brand color, accent color) from settings, so that my site has its own visual identity
10. As a site admin, I want to configure which locales my site supports and set a default locale, so that my site serves content in the right languages
11. As a site admin, I want to manage my site's SEO defaults (OG image, meta description, site title), so that search engines and social platforms show correct information
12. As a site admin, I want to configure per-site API keys (Stripe, SMTP, AI providers) in settings, so that billing and services are isolated per site
13. As a site admin, I want my CMS content (posts, pages, categories, portfolio, showcase) to be completely isolated from other sites, so that there's no data leakage
14. As a site admin, I want my media uploads to be isolated per site, so that files from one site don't appear in another site's media library
15. As a site admin, I want my store products, orders, and customer data to be fully isolated, so that each store operates independently
16. As a customer, I want to register and shop on a specific store without my account existing on other stores, so that my data is private to the store I chose
17. As a customer, I want each store to have its own look and feel (colors, logo, branding), so that I know which store I'm on
18. As a staff user (editor), I want to only see sites I've been given access to in the site switcher, so that I don't see or accidentally modify sites I shouldn't
19. As a developer, I want multisite to work with zero changes to existing tRPC procedures, so that I don't have to refactor every query
20. As a developer, I want migrations to apply to all site schemas automatically when I run `bun run db:migrate`, so that schema changes are consistent across sites
21. As a developer, I want the scope primitive to be available in BullMQ job handlers, so that background jobs process data in the correct site's schema
22. As a developer, I want in-memory caches, Redis keys, and WebSocket channels to be automatically scoped by site, so that data never leaks between sites
23. As a developer, I want single-site installations (without core-multisite) to have zero overhead from multisite plumbing, so that the framework stays fast by default
24. As a developer, I want to run the same deployment across all sites with `SERVER_ROLE` for scaling, so that I can scale frontend, API, and worker processes independently
25. As a developer, I want RSS feeds and sitemaps to be per-site, so that search engines index each site independently
26. As a developer, I want email branding (templates, sender, logo) to be per-site, so that transactional emails match the site's brand
27. As an ops engineer, I want any instance to serve any site's requests (stateless routing), so that I can horizontally scale without sticky sessions

## Implementation Decisions

### Core Plumbing (in `src/core/`, minimal footprint)

**Request scope primitive** using `AsyncLocalStorage`:
- New file: scope provider with `withScope(scopeId, fn)` and `getScope()` functions
- Returns `null` when multisite is not installed (zero overhead)
- All existing in-memory caches (~15 instances) updated to prefix keys with `getScope() ?? ''`
- Not multisite-specific — it's a generic "request scope" that multisite gives meaning to

**Cache key scoping** across all core caches:
- CMS link LRU cache
- Content variables cache
- Email template cache
- MDX compile cache
- Stats cache
- Canonical URL config (becomes scope-aware singleton map)
- Content vars (scope-aware invalidation)

**Redis key scoping:**
- Rate limit keys: `rl:{scope}:public`, `rl:{scope}:chat:{userId}`
- Pub/sub channels: `ws:{scope}:broadcast`
- Cache invalidation channels: `cms-link-invalidation:{scope}`

**BullMQ job scoping:**
- All `enqueue*` functions embed `_scope: getScope()` in job data
- All workers wrap processing with `withScope(job.data._scope, ...)`
- Worker sets `search_path` before processing

**DB connection scoping:**
- Wrapper around the Drizzle `db` instance that executes `SET search_path TO {siteSchema}, public` at the start of each scoped request
- Falls back to `public` only when no scope is set (single-site mode)

### Module Tables (in `core-multisite/`)

**`sites`** (public schema):
- `id` (UUID PK), `name`, `slug` (unique), `defaultLocale`, `locales` (JSONB array), `settings` (JSONB — branding, theme config), `isNetworkAdmin` (boolean), `status` (active/suspended/deleted), `createdAt`, `updatedAt`, `deletedAt`

**`site_domains`** (public schema):
- `id` (UUID PK), `siteId` (FK → sites), `domain` (unique), `isPrimary` (boolean), `verified` (boolean), `verificationToken` (varchar), `verifiedAt` (timestamp), `createdAt`

**`site_members`** (public schema):
- `siteId` (FK → sites), `userId` (FK → user), `role` (varchar — admin/editor/viewer), `createdAt`
- Composite PK: `(siteId, userId)`

### Per-Site Schema Tables

When a new site is created, a PostgreSQL schema is created (e.g., `site_{slug}`) and all CMS/store/media tables are created within it by running the current migrations. Tables that move to per-site schemas:

- `cms_posts`, `cms_categories`, `cms_terms`, `cms_term_relationships`, `cms_post_attachments`, `cms_slug_redirects`, `cms_menus`, `cms_menu_items`, `cms_revisions`, `cms_options`
- `cms_portfolio`, `cms_showcase`
- `customer` (Better Auth customer table if applicable), `organization`, `member`
- `store_products`, `store_variants`, `store_orders`, `store_order_items`, `store_cart_items`, `store_categories`
- `media` (media records — actual files stored at `uploads/{siteId}/...` or S3 with site prefix)
- `notifications`, `audit_log` (per-site activity)
- All module-specific content tables (support tickets, chat conversations, etc.)

Tables that stay in `public` schema (shared):
- `user`, `session`, `account`, `verification` (Better Auth)
- `sites`, `site_domains`, `site_members`

### Proxy Changes (project-layer — manual integration required)

The module provides `resolveSiteFromRequest()` and `resolveDashboardSite()` helpers. The project must integrate them into `src/proxy.ts`:

- Call `resolveSiteFromRequest(request)` before locale detection
- Set `x-site-id`, `x-site-schema`, `x-site-name` headers on response
- For dashboard paths, also call `resolveDashboardSite(request)` to respect the site switcher cookie
- Per-site locale handling: read site's supported locales from resolved site config, validate locale prefix against site's locale list (not global `LOCALES`)

This is intentionally a manual step — proxy.ts is project-specific (auth gates, locale logic, CSP are custom per deployment). See README for integration code.

### tRPC Context (project-layer — manual integration required)

- Extract `siteId` and `siteSchema` from headers (set by proxy), add to context
- Set `search_path` to `"{siteSchema}", public` before queries
- Follow existing pattern used by `activeOrganizationId`
- All procedures automatically have site context available

### Site Switcher (Dashboard)

- Follow existing `OrgSwitcher` component pattern
- Store `activeSiteId` in user session (via Better Auth, same as `activeOrganizationId`)
- Dropdown in dashboard header showing sites the user has access to (via `site_members`)
- Superadmin sees all sites
- Selecting a site sets session value; all dashboard queries scope to that site's schema

### DNS Verification

- Admin adds custom domain in site settings
- System generates a random verification token
- Admin is shown: "Add a TXT record: `indigo-verify={token}` to your domain's DNS"
- Background cron job checks DNS TXT records periodically (every 5 minutes for pending verifications)
- On successful verification: mark domain as verified, update `verifiedAt`
- Verified domains are served by the proxy; unverified domains show a "pending verification" page

### Site Creation Flow

CLI (`bun run site:create <name>`):
1. Create `sites` row with auto-generated slug
2. `CREATE SCHEMA site_{slug}`
3. Run all migrations on the new schema
4. Seed default content (CMS pages, email templates, default options)
5. Create temporary subdomain entry in `site_domains`
6. Output: site URL and admin access instructions

Admin UI (network admin dashboard):
1. Form: site name, slug, default locale, initial admin user
2. Same backend flow as CLI
3. Redirect to new site's dashboard after creation

### Site Deletion

- Soft-delete: set `sites.status = 'deleted'`, `sites.deletedAt = now()`. Proxy returns 404 for deleted sites. Data preserved.
- Hard-delete (superadmin only, after soft-delete): `DROP SCHEMA site_{slug} CASCADE`, remove `sites` row and `site_domains` entries. Irreversible.

### Per-Site Theming

- Site's `settings` JSONB field stores: `brandHue`, `accentHue`, `grayHue`, `logoUrl`, `faviconUrl`, `defaultOgImage`
- Root layout reads site config and injects CSS custom properties: `<style>:root { --brand-hue: {value}; --accent-hue: {value}; }</style>`
- The existing OKLCH token system derives the entire palette from these hues — no additional CSS needed
- Per-site logo/favicon served from site's media uploads

### Per-Site Configuration (Runtime)

- `siteConfig` values (name, URL, SEO defaults, social handles) become runtime lookups from `cms_options` in the site's schema
- `site.ts` remains as fallback defaults for single-site mode (no multisite installed)
- Per-site API keys (Stripe, SMTP, AI providers) stored in site's `cms_options` with `site.stripe.*`, `site.smtp.*` keys
- Per-site locales stored in `sites.locales` (JSONB array) and `sites.defaultLocale`

### Migration Strategy

- `bun run db:migrate` iterates all site schemas and applies pending migrations to each
- New site creation: runs full migration history on the new schema
- Rollback: must also iterate all schemas
- Migration runner is a new utility in core-multisite that wraps Drizzle-kit's migration runner

### File Storage

- Upload paths prefixed with site ID: `uploads/{siteId}/filename.jpg`
- S3 uploads use site ID as key prefix: `s3://bucket/{siteId}/filename.jpg`
- Media API routes resolve site from context and scope file access

### WebSocket Channel Scoping

- All channel names prefixed with site scope: `{siteId}:support:ticket-123`, `{siteId}:chat:conv-456`
- Channel authorization checks include site membership validation
- Redis pub/sub channels include site prefix

### SEO Per-Site

- Each site generates its own `sitemap.xml` and `robots.txt` from its own content
- Canonical URLs use the site's primary domain
- Organization JSON-LD uses per-site name, URL, logo
- RSS feeds scoped to site content
- Per-site locales affect hreflang generation

### Email Per-Site

- Each site can configure its own SMTP credentials in `cms_options`
- Email branding (logo, colors, site name) from site's options
- Email templates from site's schema (fallback to default templates)
- `enqueueEmail` / `enqueueTemplateEmail` automatically embed site scope in job data

## Testing Decisions

Good tests verify external behavior, not implementation details. Tests should be runnable in isolation and not depend on global state.

**Modules to test:**

1. **Scope primitive** — Unit tests: `withScope` sets and clears context correctly, nested scopes work, `getScope` returns `null` outside scope. Pattern: similar to existing `locale.test.ts`.

2. **Site resolution** — Unit tests: domain lookup returns correct site, subdomain parsing works, unknown domains return null, cached lookups return stale data correctly. Mock the DB layer.

3. **Schema switching** — Integration tests: `SET search_path` correctly scopes queries. Create two test schemas, insert different data, verify queries return correct results per scope.

4. **Cache key scoping** — Unit tests: same key in different scopes doesn't collide, `null` scope produces backward-compatible keys.

5. **DNS verification** — Unit tests: TXT record parsing, verification token generation, status transitions. Mock DNS lookups.

6. **Site creation/deletion** — Integration tests: full lifecycle (create schema, run migrations, seed content, soft-delete, hard-delete). Verify schema exists/doesn't exist.

7. **Migration runner** — Integration test: apply migration to all schemas, verify table changes in each.

**Prior art:** Existing test patterns in `src/server/routers/__tests__/` (tRPC procedure tests with mocked DB), `src/core/lib/__tests__/` (pure unit tests), `src/lib/__tests__/locale.test.ts` (utility tests).

## Out of Scope

- **Cross-site content sharing** — Each site is fully isolated. No content syndication between sites.
- **Per-site code/plugins** — All sites run the same codebase. No per-site custom components or modules.
- **Layout variants** — Only CSS token theming (colors, branding). Layout customization (different header/footer styles) is a future enhancement.
- **Customer SSO across sites** — Customers are isolated per site. Cross-site customer authentication is a future feature.
- **Per-site module installation** — All installed modules are available on all sites. Per-site module toggling is a future feature.
- **Billing for sites** — Plan-based site limits (free = 1, pro = 10) would be handled by `core-subscriptions`, not by multisite.
- **Geographic routing** — No CDN or edge routing based on geography. The proxy handles domain routing only.
- **Database sharding** — All sites share one PostgreSQL instance. Sharding by site to separate DB servers is a future scaling concern.
- **Product schema (JSON-LD)** — Store product structured data belongs in `core-store`, not multisite.

## Further Notes

- The `AsyncLocalStorage` scope primitive is intentionally generic — it's not "multisite context," it's "request scope." This makes it reusable for other isolation patterns (e.g., testing, request tracing) and keeps core's dependency on multisite concepts to zero.
- PostgreSQL schemas provide true isolation: `DROP SCHEMA CASCADE` cleanly removes a site. Backup per-site with `pg_dump --schema=site_abc`. No orphaned rows, no dangling references.
- The existing `OrgSwitcher` component and `activeOrganizationId` session field prove the site-switching UX pattern works. The site switcher is a direct port of this pattern.
- Performance: `SET search_path` is a session-level setting with negligible overhead. PostgreSQL's query planner handles schema-qualified tables natively.
- The module's `module.config.ts` should declare which tables move to per-site schemas. The sync script generates the schema creation SQL from Drizzle's table definitions.
- Single-site installations should NEVER pay a performance tax for multisite plumbing. `getScope()` returns `null` in ~0ns when `AsyncLocalStorage` has no active store. Cache key prefixing with empty string is a no-op concatenation.
