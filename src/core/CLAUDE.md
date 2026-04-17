# Core — CLAUDE.md

`src/core/` is a git subtree from `indigo-fw/core`. Do not modify per-project.

```bash
git subtree pull --prefix=src/core git@github.com:indigo-fw/core.git main --squash
git subtree push --prefix=src/core git@github.com:indigo-fw/core.git main
```

## Core vs Project Boundary

**Core owns:** reusable CMS infrastructure — CRUD helpers, hooks, shared components, types, RBAC, storage, CSS tokens, lib utilities, MDX compiler, content sync, email engine, RSS/sitemap, search triggers, cron/maintenance registries, scheduled publishing, health check, cookie consent, web push.

**Project owns:** `src/config/`, `src/server/`, `src/app/`, `src/components/`, `content/`.

## Import Rules

- Project imports from `@/core/*`
- Core may only import from: `@/server/db`, `@/server/db/schema/*`, `@/lib/trpc/client`, `@/lib/trpc/server`, `@/lib/utils`, `@/lib/constants`, `@/lib/translations`, `@/config/plans`, `@/config/site`
- Core components needing project data accept it via **props** (not config imports)
- Feature-gate: `setPlanResolver()` DI — project calls once in `plans.ts`
- Module hooks: type-safe via `HookMap` interface + declaration merging. `registerHook(event, handler)` / `runHook(event, ...args)` / `runGuard(event, ...args)`. Modules extend `HookMap` in `types/hooks.ts`
- WS channel auth: `registerChannelAuthorizer(fn)`
- Schema overrides: modules declare `overridableSchema` in `module.config.ts`; project extends at `src/schema/overrides/`

## Shared Utilities — Use These, Don't Reinvent

**CRUD & queries:**
- `fetchOrNotFound(db, table, id, entityName)` — throws TRPCError NOT_FOUND
- `buildAdminList()` — conditions, sort, pagination, count in parallel
- `softDelete()` / `softRestore()` / `permanentDelete()` — soft-delete lifecycle
- `parsePagination()` + `paginatedResult()` — `{ results, total, page, pageSize, totalPages }`
- `updateWithRevision()` — wraps revision + slug redirect + update
- `updateContentStatus()` — handles auto-publishedAt
- `prepareTranslationCopy()` — group creation, unique slug, preview token
- `narrowRecoveredData(recovered, defaults)` — autosave recovery (from `@/core/hooks`)
- `serializeExport(items, headers, format)` — JSON/TSV bulk export

**Slugs:**
- `slugify()` / `slugifyFilename()` — never inline slug regex
- `ensureSlugUnique()` — DB-checked uniqueness
- `generateCopySlug()` — retry loop for "copy-of-" slugs

**Router Zod schemas:** `adminListInput`, `updateStatusInput`, `duplicateAsTranslationInput`, `exportBulkInput`

**Content:**
- `htmlToMarkdown()` / `markdownToHtml()` — preserves shortcodes via placeholder strategy
- `resolveContentVars()` — replaces `%VAR%` placeholders with `site.ts` values. Fast path skips if no `%` present
- `compileMdx()` + `registerMdxComponent()` — unified remark→rehype pipeline, LRU-cached
- `syncContentFiles()` — syncs `.md` from `content/{locale}/` to CMS DB
- `seedContentFiles()` — copies `core/_templates/content/` to `content/` on init
- `parseFrontmatter<T>()` — shared YAML parser for `.md`/`.mdx`

**Locale fallback:**
- `mergeWithLocaleFallback(localeItems, defaultItems)` — deduplicates by `translationGroup` (if present), includes all items without it. Used by `listPublished` endpoints
- `needsLocaleFallback(lang)` — returns true for non-default locales

**CMS links:** `cms://` protocol — `resolveCmsLink()`, `resolveCmsLinks(text, locale)`, `resolveRecordCmsLinks(record, locale)`. LRU + Redis pub/sub invalidation. Client: `<CmsLink>`, project wraps as `<Link>`

**Infrastructure:**
- `logAudit()` — fire-and-forget, logs errors via logger
- `dispatchWebhook()` — fire-and-forget, logs failures
- `enqueueTemplateEmail(to, template, vars, locale)` / `enqueueEmail({ to, subject, html })` — BullMQ queue
- `sendPushToUser(userId, payload)` — sends to all devices, auto-cleans 410 Gone
- `createLogger(namespace)` — structured logger
- `withApiRoute(request, handler)` — REST v1 wrapper (auth + rate-limit + try/catch)

**SEO:**
- `generateRssFeed(config, items)` + `createRssResponse(xml)` — RSS 2.0
- `generateSitemap(config, staticPages, fetchers)` — multilingual with hreflang
- `buildCanonicalUrl(path, locale)` + `buildAlternates(path, locales)` — locale-aware URLs
- `buildArticleJsonLd()` / `buildBreadcrumbJsonLd()` / `buildOrganizationJsonLd()` — JSON-LD builders

**Registries:**
- `registerCronJob({ name, pattern, handler })` + `startCronScheduler()` — BullMQ repeatable or DB-queue fallback
- `registerMaintenanceTask(name, fn)` — sequential execution, independent error handling
- `registerScheduledPublishTarget(target)` — auto-publishes scheduled content
- `createHealthHandler(checks)` — factory for `/api/health`

**Components:**
- `<ConsentProvider>` + `<CookieConsent>` + `<ConsentGate category="analytics">` — cookie consent
- `<PaginationNumbered>` / `<PaginationSimple>` / `<PaginationLoadMore>` / `<PaginationInfinite>` — 4 pagination variants
- `<Skeleton variant="line|circle|card">` / `<Avatar>` / `<StructuredData>` — UI primitives
- `useConfirm()` / `useAlert()` / `usePrompt()` — imperative dialog replacements for native confirm/alert/prompt

## Translations

```typescript
// Admin components:
const __ = useAdminTranslations();    // from '@/lib/translations'
// Public components (no admin messages):
const __ = useBlankTranslations();    // from '@/lib/translations'
// Server components:
const __ = await getServerTranslations(); // from '@/core/lib/i18n/translations-server'
// All user-visible text must be wrapped: {__('Users')}
```

## CSS Architecture

- **Token layers:** `tokens.css` → `tokens-public.css` → `tokens-admin.css`. All colors via design tokens
- **Class naming:** layout `app-*`, dashboard `dash-*`, module prefix (`support-chat-*`), components no prefix (`.btn`)
- **OKLCH:** `oklch(L C var(--brand-hue) / alpha)` works for custom CSS with hue variables. `oklch(from ...)` does NOT work (Lightning CSS limitation). Tailwind's `/80` opacity modifiers are fine (compile to `color-mix()` which works correctly)
- **Dark mode:** prefer tokens from `tokens.css` — avoid `html.dark` in component CSS (a few legacy exceptions exist in editor-styles.css)
- **Layout:** `.app-container` (80rem). Never use Tailwind's `container`
- **To rebrand:** change hues in `tokens.css` (`--brand-hue`, `--accent-hue`), override in public/admin token files
