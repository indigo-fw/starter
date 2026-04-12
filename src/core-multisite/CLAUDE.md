# core-multisite — CLAUDE.md

Premium module. Multi-tenant site isolation using PostgreSQL schema-per-site.

## Architecture

- Each site gets its own PostgreSQL schema (`site_abc.cms_posts`, `site_abc.cms_categories`, etc.)
- Shared tables stay in `public` schema: `user`, `session`, `sites`, `site_domains`, `site_members`
- Per-site schema contains: all CMS content, customers, organizations, store, media, notifications
- Proxy resolves domain → site, sets `x-site-id` header
- Core's `AsyncLocalStorage` scope primitive (`withScope/getScope`) carries site context through the request
- All caches, Redis keys, WS channels, BullMQ jobs auto-scoped via `getScopedKey()`

## Key Files

- `schema/sites.ts` — `sites`, `site_domains`, `site_members` tables (public schema)
- `lib/site-resolver.ts` — domain/slug → site lookup with in-memory cache
- `lib/schema-manager.ts` — CREATE/DROP SCHEMA, migration runner, search_path switching

## Module Boundary

**core-multisite owns:** site management (CRUD), domain verification, schema lifecycle, site resolver, migration orchestration, site switcher component, network admin pages.

**Core provides:** scope primitive (`withScope`, `getScope`, `getScopedKey` from `@/core/lib/infra/scope`). Core caches are already scope-aware — they prefix keys with `getScope()` automatically.

**Project owns:** admin pages (network admin dashboard), site creation UI, domain management UI.

## How It Works

1. Request arrives at `cool-sneakers.com`
2. Proxy resolves domain → `site_abc` via `resolveSiteByDomain()`
3. Proxy sets `x-site-id: site_abc_uuid` and `x-site-schema: site_abc` headers
4. Request handler wraps processing with `withScope(siteId, ...)`
5. DB connection sets `search_path = site_abc, public`
6. All queries automatically hit `site_abc.*` tables
7. All caches key by `site_abc_uuid:...` via `getScopedKey()`
8. Response served with site-specific branding/content

## Single-Site Compatibility

When core-multisite is NOT installed:
- `getScope()` returns `null`
- `getScopedKey('foo')` returns `'foo'` (no prefix)
- `search_path` stays on `public` (default)
- Zero overhead, zero behavior change
