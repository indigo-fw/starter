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
- Module hooks: `registerHook(event, handler)` / `runHook(event, ...args)` for cross-module communication
- WS channel auth: `registerChannelAuthorizer(fn)`
- Schema overrides: modules declare `overridableSchema` in `module.config.ts`; project extends at `src/schema/overrides/`

## Shared Utilities — Use These, Don't Reinvent

**CRUD & queries:**
`fetchOrNotFound()`, `buildAdminList()`, `softDelete()` / `softRestore()` / `permanentDelete()`, `parsePagination()` + `paginatedResult()`, `updateWithRevision()`, `updateContentStatus()`, `prepareTranslationCopy()`, `narrowRecoveredData()`, `serializeExport()`

**Slugs:** `slugify()`, `slugifyFilename()`, `ensureSlugUnique()`, `generateCopySlug()`

**Router Zod schemas:** `adminListInput`, `updateStatusInput`, `duplicateAsTranslationInput`, `exportBulkInput`

**Content:** `htmlToMarkdown()` / `markdownToHtml()`, `resolveContentVars()` (`%VAR%` → site.ts values), `compileMdx()` + `registerMdxComponent()`, `syncContentFiles()`, `seedContentFiles()`, `parseFrontmatter<T>()`

**CMS links:** `cms://` protocol — `resolveCmsLink()`, `resolveCmsLinks(text, locale)`, `resolveRecordCmsLinks(record, locale)`. LRU + Redis pub/sub invalidation. Client: `<CmsLink>`, project wraps as `<Link>`

**Infrastructure:** `logAudit()`, `dispatchWebhook()`, `enqueueTemplateEmail()` / `enqueueEmail()`, `sendPushToUser()`, `createLogger()`

**API:** `withApiRoute(request, handler)` for REST v1

**SEO:** `generateRssFeed()` + `createRssResponse()`, `generateSitemap()`, `buildCanonicalUrl()` + `buildAlternates()`, `buildArticleJsonLd()`, `buildBreadcrumbJsonLd()`, `buildOrganizationJsonLd()`

**Registries:** `registerCronJob()` + `startCronScheduler()`, `registerMaintenanceTask()`, `registerScheduledPublishTarget()`, `registerHealthCheck()`, `createHealthHandler()`

**Components:** `<ConsentProvider>` + `<CookieConsent>` + `<ConsentGate>`, `<PaginationNumbered>` / `<PaginationSimple>` / `<PaginationLoadMore>` / `<PaginationInfinite>`, `<Skeleton>`, `<Avatar>`, `<StructuredData>`, `useConfirm()` / `useAlert()` / `usePrompt()`

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
- **OKLCH:** `oklch(L C var(--brand-hue) / alpha)` works. `oklch(from ...)` does NOT. `color-mix()` wrong for alpha
- **Dark mode:** prefer tokens from `tokens.css` — avoid `html.dark` in component CSS (a few legacy exceptions exist in editor-styles.css)
- **Layout:** `.app-container` (80rem). Never use Tailwind's `container`
- **Tailwind v4:** `/80` opacity compiles to `color-mix()` — use literal `oklch(L C H / alpha)` instead
- **To rebrand:** change hues in `tokens.css` (`--brand-hue`, `--accent-hue`), override in public/admin token files
