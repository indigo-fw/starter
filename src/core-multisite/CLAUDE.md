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

Non-obvious: `lib/site-resolver.ts` caches domain→site lookups in-memory; domain verification is background DNS TXT checking (`jobs/dns-verification.ts`); site lifecycle ops have a CLI (`lib/cli.ts`, prints usage); client code uses `hooks/useSitesApi.ts` instead of `as any` casts.

## Single-Site Compatibility

Without this module: `getScope()` returns `null`, `getScopedKey('foo')` returns `'foo'`, `search_path` stays on `public`. Zero overhead.
