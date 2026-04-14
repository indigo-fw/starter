# core-multisite — CLAUDE.md

Multi-tenant site isolation using PostgreSQL schema-per-site.

## Architecture

- Each site gets its own PG schema (`site_abc.cms_posts`, etc.)
- Shared tables in `public`: `user`, `session`, `sites`, `site_domains`, `site_members`
- Proxy resolves domain → site → sets `x-site-id` header
- Core's `withScope`/`getScope`/`getScopedKey()` carries site context through request
- All caches, Redis keys, WS channels, BullMQ jobs auto-scoped

## Request Flow

1. Proxy calls `applySiteHeaders(request)` → `x-site-*` headers
2. tRPC `createContext` calls `extractSiteContext(headers)` → `{ siteId, schemaName }`
3. `applySiteSearchPath(schemaName)` → sets `search_path = site_abc, public`
4. `withScope(siteId, ...)` wraps handler — all queries hit site schema, all caches scoped

## Site Lifecycle

`create → ACTIVE ↔ SUSPENDED → soft-delete → restore or hard-delete (irreversible)`

## Key Files

- `lib/site-resolver.ts` — domain/slug → site lookup (in-memory cache)
- `lib/schema-manager.ts` — CREATE/DROP SCHEMA, migration runner
- `lib/context-helper.ts` — proxy + tRPC integration helper
- `lib/cli.ts` — CLI: create, delete, suspend, unsuspend, restore, list
- `hooks/useSitesApi.ts` — typed React hook (eliminates `as any` casts)
- `jobs/dns-verification.ts` — background DNS TXT verification

## Single-Site Compatibility

Without this module: `getScope()` returns `null`, `getScopedKey('foo')` returns `'foo'`, `search_path` stays on `public`. Zero overhead.
