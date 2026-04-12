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
- `lib/context-helper.ts` — helper for proxy + tRPC integration (reduces boilerplate)
- `lib/site-config.ts` — per-site runtime config with cache + static fallback
- `lib/cli.ts` — CLI: create, delete, suspend, unsuspend, restore, list
- `seed/network-admin.ts` — auto-creates `__network__` admin site on `bun run init`
- `hooks/useSitesApi.ts` — typed React hook wrapping the dynamic tRPC router (eliminates `as any` casts)
- `jobs/dns-verification.ts` — background DNS TXT verification + `domain.verified` webhook

## Module Boundary

**core-multisite owns:** site management (CRUD + lifecycle), domain verification, schema lifecycle, site resolver, migration orchestration, site switcher component, network admin pages, context helper, seed.

**Core provides:** scope primitive (`withScope`, `getScope`, `getScopedKey` from `@/core/lib/infra/scope`). Core caches are already scope-aware — they prefix keys with `getScope()` automatically.

**Project owns:** admin pages (network admin dashboard), site creation UI, domain management UI, proxy.ts integration (use `applySiteHeaders()` from context-helper), tRPC context `siteId` injection (use `extractSiteContext()` + `applySiteSearchPath()`).

## How It Works

1. Request arrives at `cool-sneakers.com`
2. Proxy calls `applySiteHeaders(request)` → returns `x-site-*` headers
3. Headers forwarded to Next.js
4. tRPC `createContext` calls `extractSiteContext(headers)` → `{ siteId, schemaName }`
5. Calls `applySiteSearchPath(schemaName)` → sets `search_path = site_abc, public`
6. Request handler wraps processing with `withScope(siteId, ...)`
7. All queries automatically hit `site_abc.*` tables
8. All caches key by `site_abc_uuid:...` via `getScopedKey()`
9. Response served with site-specific branding/content

## Site Lifecycle

```
create → ACTIVE ←→ SUSPENDED → soft-delete (DELETED) → restore (ACTIVE) or hard-delete (permanent)
                                                           ↑
clone ────────────���─────────────────────────────────────────┘
```

- **Active:** normal operation, public requests resolved
- **Suspended:** site exists but blocked from public resolution (dashboard still accessible)
- **Deleted (soft):** marked for deletion, can be restored
- **Hard-deleted:** schema dropped, all data destroyed (irreversible)

## Audit & Webhooks

All mutations fire `logAudit()` and `dispatchWebhook()`:
- `site.created`, `site.updated`, `site.suspended`, `site.unsuspended`, `site.deleted`, `site.restored`, `site.hard_deleted`, `site.cloned`
- `domain.added`, `domain.removed`, `domain.verified`
- `member.added`, `member.removed`

## Single-Site Compatibility

When core-multisite is NOT installed:
- `getScope()` returns `null`
- `getScopedKey('foo')` returns `'foo'` (no prefix)
- `search_path` stays on `public` (default)
- Zero overhead, zero behavior change
