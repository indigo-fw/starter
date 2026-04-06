# Core — CLAUDE.md

`src/core/` is a git subtree from `indigo-fw/core` repo. Do not modify per-project.

```bash
# Pull updates
git subtree pull --prefix=src/core git@github.com:indigo-fw/core.git main --squash
# Push changes
git subtree push --prefix=src/core git@github.com:indigo-fw/core.git main
```

## Core vs Project Boundary

**Core owns:** reusable CMS infrastructure — CRUD helpers, hooks, shared components, types, RBAC policy, storage, payment services, CSS tokens, lib utilities. Browse `src/core/` subdirectories to see what's available.

**Project owns:** `src/config/` (content types, taxonomies, plans, nav, widgets, shortcodes), `src/server/` (DB schema, tRPC routers), `src/app/` (routes), `src/components/` (forms, list views, sidebar, public UI). Customize freely.

## Import Rules

- Project imports from `@/core/*`
- Core may only import from: `@/server/db`, `@/server/db/schema/*`, `@/lib/trpc/client`, `@/lib/trpc/server`, `@/lib/utils`, `@/lib/constants`, `@/config/plans`
- Core components that need project-specific data accept it via **props** (not config imports). Examples: `NotificationBell.notificationsHref`, `OrgSwitcher.manageOrgsHref`, `ContentCalendar.editUrlBuilder`, `MediaPickerButton` wraps `MediaPickerDialog` as `value`/`onChange`
- Feature-gate uses `setPlanResolver()` DI — project calls it once in `plans.ts`
- Module hooks: `registerHook(event, handler)` / `runHook(event, ...args)` for cross-module communication (fire-and-forget). `runGuard()` for blocking checks.
- WS channel auth: `registerChannelAuthorizer(fn)` — modules claim channel prefixes (returns `true`/`false`/`null` for skip)
- Schema overrides: modules declare `overridableSchema` in `module.config.ts`; sync script detects project overrides at `src/schema/overrides/`; generated `module-schema.ts` auto-resolves

## Shared Utilities — Use These, Not Manual Alternatives

- **Slugs:** `slugify()` / `slugifyFilename()` — never inline slug regex
- **Slug uniqueness:** `ensureSlugUnique()` — never inline
- **Pagination:** `parsePagination()` + `paginatedResult()` → `{ results, total, page, pageSize, totalPages }`
- **Admin lists:** `buildAdminList()` — conditions, sort, pagination, count in parallel
- **Soft-delete:** `softDelete()`, `softRestore()`, `permanentDelete()`
- **CMS updates:** `updateWithRevision()` — wraps revision + slug redirect + update
- **Fetch or 404:** `fetchOrNotFound(db, table, id, entityName)` — never inline
- **Copy slug:** `generateCopySlug()` — never inline the retry loop
- **Status update:** `updateContentStatus()` — handles auto-publishedAt
- **Translation copy:** `prepareTranslationCopy()` — handles group creation, unique slug, preview token
- **Bulk export:** `serializeExport(items, headers, format)` for JSON/TSV
- **Router Zod schemas:** `adminListInput`, `updateStatusInput`, `duplicateAsTranslationInput`, `exportBulkInput` — never inline
- **Autosave recovery:** `narrowRecoveredData(recovered, defaults)` — never manually cast
- **Markdown:** `htmlToMarkdown()` / `markdownToHtml()` — preserves shortcodes through placeholder strategies
- **Audit:** `logAudit()` — fire-and-forget, logs errors via logger. Never silently swallow fire-and-forget errors
- **Webhooks:** `dispatchWebhook()` — fire-and-forget, logs failures
- **API routes:** `withApiRoute(request, handler)` for REST v1 — wraps auth + rate-limit + try/catch
- **Tokens:** `addTokens()`, `deductTokens()` — race-safe atomic deduction (UPDATE WHERE balance >= amount)

## Translations

```typescript
// Admin / core components (dashboard layout provides next-intl messages):
import { useAdminTranslations } from '@/lib/translations';
const __ = useAdminTranslations();

// Public / shared components (outside dashboard — no admin messages):
import { useBlankTranslations } from '@/lib/translations';
const __ = useBlankTranslations();

// Server components:
import { getServerTranslations } from '@/core/lib/translations-server';
const __ = await getServerTranslations();

// All user-visible text must be wrapped:
<h1>{__('Users')}</h1>  // RIGHT
<h1>Users</h1>           // WRONG
```

## CSS Gotchas

- **OKLCH traps:** `oklch(L C var(--brand-hue) / alpha)` works. `oklch(from ...)` does NOT work with Lightning CSS. `color-mix()` is wrong for alpha tints
- **Tailwind v4 opacity:** `/80` modifier compiles to `color-mix()` — use literal `oklch(L C H / alpha)` instead
- **Layer order:** `@layer theme, base, components, utilities;` — every CSS file must declare this
- **Hues:** brand `350` (pink), accent `303` (purple), gray `260`/`265` (cool blue-violet) — all independent
- **Token inheritance:** `tokens.css` (global defaults) → `tokens-public.css` (public overrides) → `tokens-admin.css` (admin overrides)
- **Admin CSS isolation:** loaded only in dashboard route — no scoping needed, class names can match content CSS

**To rebrand:** (1) In `tokens.css`: replace hue `350` (brand) and `303` (accent); update `--brand-hue`, `--accent-hue`, `--gradient-brand`. (2) Public overrides in `tokens-public.css`. (3) Admin overrides in `tokens-admin.css`. (4) Update hardcoded `260` in dark surface tokens and `admin.css`.
