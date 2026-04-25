# CLAUDE.md

## Overview

Indigo is an open-source, AI agent-driven T3 SaaS framework with integrated CMS: Next.js 16 (App Router) + tRPC + Drizzle ORM + Better Auth. PostgreSQL with UUID primary keys. Clone for each new SaaS/social/AI app project. CMS stays global (marketing site); SaaS primitives (orgs, billing, notifications, real-time) scope to organizations. Modular architecture — premium features available as installable modules via `bun run indigo add <module>`.

## Development

- **Package manager:** `bun`
- **Dev server:** `bun run dev` (custom server with Turbopack, port 3000)
- **Custom server:** `server.ts` — Bun-direct entry. Initializes BullMQ workers, WebSocket, content sync. Cache + Redis pub/sub init for `cms-link` and `content vars` does NOT live here (see next bullet)
- **Next.js boot hook:** `src/instrumentation.ts` — Next.js's [`instrumentation`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) entry, runs once during `app.prepare()` in the Next.js server bundle context (same module instances as routers + SSR). Hosts `initCmsLinkSync`, `initContentVarsSync`, `preloadContentVars`. **Don't move these inits back to `server.ts`** — that creates separate module instances (Bun-side ≠ Next.js bundle), so the Redis subscription registers on a cache that nobody reads from, silently breaking cross-instance invalidation in multi-instance deploys
- **CMS link cache split:** `src/core/lib/content/cms-link.ts` (server-only DB resolver, has `import 'server-only'`) imports cache helpers from `src/core/lib/content/cms-link-sync.ts` (no `'server-only'`, safe for Bun + instrumentation to load). The split exists because the `'server-only'` package's index.js throws outside Next.js webpack's `react-server` export condition — Bun-direct imports of the resolver would crash at startup
- **First-time setup:** `bun run init` — creates DB, migrations, search triggers, superadmin, seeds content + email templates to `content/` and `emails/`
- **Content sync:** `bun run content:sync` — syncs `.md` files from `content/` to CMS database (also runs automatically on server start)
- **Promote user:** `bun run promote <email>`
- **Change password:** `bun run change-password <email>`
- **Database:** `bun run db:generate` after schema changes, `bun run db:migrate` to apply, `bun run db:studio` for viewer
- **Type check:** `bun run typecheck`
- **Tests:** `bunx vitest run` (CI uses vitest for proper mock isolation). Use `asMock(fn)` from `@/test-utils` instead of `vi.mocked()`
- **Translations:** PO files in `locales/admin/*.po`. After editing: `bun run generate-po && bun run transform:po`
- **Environment:** Zod-validated env vars in `src/lib/env.ts`
- **Project health:** `bun run indigo doctor` — validates env, DB, modules, generated files, deps
- **Visualize:** `bun run indigo visualize` — interactive architecture diagram → `.indigo/architecture.html`. `--mermaid` for `.mmd` files, `--imports` for dependency-cruiser reports + boundary violations, `--imports <module>` for single module deep dive
- **Architecture context:** Before cross-module or architectural work, run `bun run indigo visualize --mermaid` and read the `.indigo/*.mmd` files (deps, datamodel, startup, workers). Fast to generate, low-token, high-signal

## Coding Standards

- No `any` — use `unknown` and narrow, or generics/interfaces
- Use `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`
- No plain `Error` in server code — always `TRPCError` with proper code
- Constrain Zod inputs — `.max()` on strings, `.uuid()` on IDs, `.max(N)` on arrays
- Safety `limit` on all `.findMany()` / `.select()` queries
- `isNull(deletedAt)` on user-facing queries for soft-deleted tables
- Verify resource ownership — `protectedProcedure` must filter by `ctx.session.user.id`
- UUIDs everywhere — never `number` for primary keys
- DRY where it reduces bugs, but type-specific redundancy is OK when abstraction would obscure intent
- Open-closed principle — extend via registration/config, don't edit shared code for new types
- Config-driven over hardcoded — new content types, features, etc. should be addable without touching core logic
- Schema overrides — modules can declare overridable tables; projects extend by dropping a file in `src/schema/overrides/` and running `bun run indigo:sync`

### Plans

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions, if any.

## Internationalization (i18n)

Locale config in `src/lib/constants.ts`: `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_LABELS`, `IS_MULTILINGUAL`.

### Locale Routing

- `localeDetection: false` — no auto-redirect from Accept-Language header (SEO-safe)
- `proxy.ts` handles locale prefix stripping (`/de/blog/post` → `/blog/post` with `x-locale: de` header)
- `preferred_locale` cookie stores user's locale choice (set by proxy on locale-prefixed visits). Proxy redirects unprefixed URLs to preferred locale when cookie is set. Must be whitelisted as "Strictly Necessary" in cookie consent tool.
- `/en/xxx` (default locale prefix): proxy passes through (next-intl handles), sets cookie to `en`
- Anonymous users: cookie persists preference. Registered users: also saved to `user.lang` in DB via `auth.setPreferredLocale` mutation

### Content Locale Fallback

Per-type `fallbackToDefault` in `src/config/cms.ts` controls fallback behavior:
- `true` (page, blog, category, portfolio, showcase): missing locale content falls back to `DEFAULT_LOCALE` with `isFallback: true` + noindex metadata
- `false` (tag): returns 404 when content missing in requested locale

**Detail pages** (`getBySlug`): tries requested locale → falls back to DEFAULT_LOCALE if allowed → returns `isFallback` flag. `applyFallbackMetadata()` in `register-renderers.tsx` sets noindex + canonical to default locale URL.

**List pages** (`listPublished`): merges locale items + DEFAULT_LOCALE fallbacks via `mergeWithLocaleFallback()` from `@/core/lib/i18n/locale-fallback`. Deduplicates by `translationGroup` when available (items without it are included as-is). Sitemaps use separate direct DB queries — no fallback pollution.

**Content sync translation grouping** (`src/core/lib/content/sync.ts`):
- Same slug across locales → auto-grouped by `translationGroup` UUID on sync
- Different slugs → use `translationOf: en-slug` frontmatter in non-EN files
- Groups enable LanguageSwitcher cross-language slug mapping + hreflang tags

### Translation Workflow

PO files in `locales/admin/*.po` and `locales/public/*.po`. Pipeline: `bun run i18n` (extract → compile to JSON). `bun run i18n:translate` translates only enabled locales via DeepL (parsed from `LOCALES` in constants.ts). Explicit CLI target bypasses filter: `bun run i18n:translate fr`.

## Troubleshooting

- **Port 3000 already in use:** Kill stale `bun` or `node` process
- **Type errors after schema change:** Run `bun run db:generate` then restart dev server
- **"Cannot find module" after branch switch:** Run `bun install`
- **Migration fails:** Check `DATABASE_URL` in `.env`, ensure PostgreSQL is running. The init script creates the database automatically
- **Tiptap editor not rendering:** Ensure `@tiptap/react` and `@tiptap/starter-kit` are installed. Run `bun install`
