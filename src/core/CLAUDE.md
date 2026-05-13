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

### `user.created` hook — per-signup module setup

Fired by `handleUserCreated()` in `src/lib/auth.ts` right after a new user + their personal org are created (from Better Auth's `databaseHooks.user.create.after`). Replaces the old pattern of hard-importing module schemas into `auth.ts` — `auth.ts` doesn't know what modules are installed; modules opt themselves in via this hook.

**Signature** (from `src/core/lib/module/module-hooks.ts`):
```ts
'user.created': [user: { id: string; email: string; name: string | null }, orgId: string | null]
```
`orgId` is the personal org just created — `null` if that step failed (so handlers can decide whether to skip org-scoped work or fall back to user-scoped).

**Register a handler** in your module's deps file (runs once during `serverInit`):
```ts
// src/config/deps/<module>-deps.ts
import { registerHook } from '@/core/lib/module/module-hooks';

registerHook('user.created', async (user, orgId) => {
  if (!orgId) return;                       // org creation failed upstream
  // …link orphaned guest records, grant reverse trial, seed module data, etc.
});
```

Handler errors are caught + logged — they never fail signup. Multiple handlers run via `Promise.allSettled`, so one failing doesn't block the others.

**Worked examples in the repo:**
- `core-support` — links any guest chat sessions started before signup (`src/config/deps/support-deps.ts`)
- `core-subscriptions` — grants the reverse trial (`src/config/deps/subscriptions-deps.ts` → `grantReverseTrialOnSignup`)

**Adding a new hook event:** declare-merge `HookMap` in `src/core/lib/module/module-hooks.ts` (core-owned events) or in a module's `types/hooks.ts` (module-owned). Keep the tuple labels descriptive — they show up in IDE hover.

## Known decoupling debt (so `indigo remove <module>` stays clean)

`indigo remove <module>` regenerates `src/generated/*` but the **starter still hard-imports a few optional-module symbols in core files**, so removing a module leaves the build red until you hand-patch them. These should move to the registry/hook/widget pattern so removal is mechanical:

- `src/app/(public)/[...slug]/renderers/PostDetail.tsx` & `ShowcaseDetail.tsx` → `<CommentSection>` from `core-comments`. Should be a *content-slot widget*: modules contribute `{ slot: 'post-footer', from, export }` in `module.config.ts`, `indigo:sync` generates `src/generated/content-slots.tsx`, the renderer does `<ContentSlot name="post-footer" targetType="post" targetId={id} />`.
- `src/app/(public)/layout.tsx` → `<CartWidget>` from `core-store`. Same idea — a `headerWidgets` slot, or fold into the existing `PUBLIC_LAYOUT_WIDGETS`.
- `src/lib/auth.ts` → `billingProfiles` from `core-payments` (personal-org billing-profile creation). Move to a `'user.created'` hook in `payments-deps.ts` (like core-support's chat-linking already is).
- `src/app/sitemap.ts` → `cmsAuthors` from `core-authors`, dynamic `core-store/schema/products`. Sitemap fetchers should come from a `registerSitemapFetcher()` registry that modules populate in their deps files.
- `src/app/api/webhooks/stripe/route.ts` → dynamic `import('@/core-store/lib/webhook-handler')` for store-order events. Route provider events through a `registerWebhookEventRouter()` registry instead.
- `src/components/public/ShowcaseFeed.tsx` → `<CommentPanel>` + `trpc.comments.*`. Same content-slot pattern.
- `src/config/chat-presets/*` → `@/core-chat/*` — these are project files shipped *by* `core-chat`; `indigo remove core-chat` should delete them (it removes `projectFiles`, so this may already work — verify).
- `src/app/dashboard/(panel)/settings/chat/queue/page.tsx`, `store/orders/[id]/page.tsx`, etc. → `trpc.chatTaskQueue` / `trpc.storeOrders` — these are module dashboard pages; they should be `projectFiles` of their module so `indigo remove` deletes them.

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
