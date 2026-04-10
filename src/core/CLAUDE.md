# Core — CLAUDE.md

`src/core/` is a git subtree from `indigo-fw/core` repo. Do not modify per-project.

```bash
# Pull updates
git subtree pull --prefix=src/core git@github.com:indigo-fw/core.git main --squash
# Push changes
git subtree push --prefix=src/core git@github.com:indigo-fw/core.git main
```

## Core vs Project Boundary

**Core owns:** reusable CMS infrastructure — CRUD helpers, hooks, shared components, types, RBAC policy, storage, payment services, CSS tokens, lib utilities, MDX compiler, content sync, content variables, seed templates. Browse `src/core/` subdirectories to see what's available.

**Project owns:** `src/config/` (content types, taxonomies, plans, nav, widgets, shortcodes), `src/server/` (DB schema, tRPC routers), `src/app/` (routes), `src/components/` (forms, list views, sidebar, public UI), `content/` (file-based content). Customize freely.

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
- **Content variables:** `resolveContentVars()` — replaces `[[VAR]]` placeholders with `site.ts` values at render time. Fast path skips if no `[[` present
- **MDX compiler:** `compileMdx()` — unified remark→rehype pipeline with component registry (`registerMdxComponent()`). LRU-cached
- **Content sync:** `syncContentFiles()` — syncs `.md` files from `content/{locale}/` to CMS DB. File mtime vs DB updatedAt, revision on update
- **Seed content:** `seedContentFiles()` — copies `core/seed-templates/` to `content/` on init (skips existing)
- **Frontmatter:** `parseFrontmatter<T>()` — shared YAML parser for `.md`/`.mdx` files
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

## File-Based Content System

Two pipelines for file-based content, determined by file extension:

| Extension | Pipeline | DB synced? | Editable in admin? | Use case |
|-----------|----------|------------|---------------------|----------|
| `.md` | `content:sync` → DB on startup | Yes | Yes | Legal pages (ToS, privacy policy) |
| `.mdx` | Runtime compile, file-first | No | Shows ".mdx" badge | Docs, technical guides |

**Content variables:** `[[COMPANY_NAME]]`, `[[SITE_NAME]]`, `[[CONTACT_EMAIL]]`, etc. Stored as-is in DB, resolved at render time by `resolveContentVars()` using values from `site.ts`. Works in both `.md` (via ShortcodeRenderer) and `.mdx` (via MDX compiler).

**Seed templates:** `core/seed-templates/{locale}/*.md` → copied to `content/{locale}/` on `bun run init`. Never overwrites existing files. Variables stay as `[[VAR]]` placeholders.

**Directory structure:**
```
content/{locale}/              → synced to cms_posts (page type)
content/{locale}/blog/         → synced to cms_posts (blog type)
docs/content/                  → runtime .mdx docs (core-docs module)
```

## CSS Conventions

- **Class naming:** layout → `app-*` prefix. Components → no prefix (`.btn`, `.card`, `.icon-btn`). Dashboard → `dash-*`. Modules → module prefix (`support-chat-*`). All kebab-case.
- **App layout:** `.app-wrapper[data-page]` > `.app-header` > `.app-toolbar` + `.app-main` + `.app-footer`. Compose from lego components: `<AppNav />`, `<AppFooter />`, `<AppSidebar />`. See `app-layout.css`.
- **Layout utilities:** `.app-container` (80rem, centered, padded — `globals.css`), `.app-container-narrow` (48rem), `.app-section` / `.app-section-alt` (vertical rhythm). Never use Tailwind's `container`.
- **Component CSS co-location:** layout components have CSS next to their TSX (AppNav.css, AppFooter.css, AppSidebar.css, MobileMenu.css). CSS loads only when the component renders.
- **Component-level CSS variables:** `var(--component-var, var(--token))` pattern. Override just one component without affecting the global token. Vars don't exist by default — set in page CSS or tokens.css. Full API documented in `app-layout.css` header comment.
- **Dark mode tokens:** centralized in `tokens.css`. Component CSS files have NO `html.dark` blocks — they use tokens that change in dark mode. Force dark per route: `data-theme="dark"` on `.app-wrapper`.
- **Per-page overrides:** `data-page` attribute on `.app-wrapper`. Target in co-located CSS: `.app-wrapper[data-page="showcase"] { --page-bg: oklch(0 0 0); }`
- **Shared components:** `shared-components.css` (loaded globally) owns `.btn`, `.btn-primary`, `.btn-secondary`, `.icon-btn`, `.input`, `.select`, `.textarea`, `.label`. Route-specific variants in `admin.css` (`.btn-danger`) or `frontend/forms.css` (`.btn-ghost`).
- **Modifiers:** separate class (`.btn-primary`, `.btn-sm`), not BEM (`--primary`). State via `IS_ACTIVE` constant + `activeAria(isActive, role)` from `@/core/lib/active-props`.
- **Table classes:** prefixed `.table-th`, `.table-td`, `.table-tr`.
- **Tokens:** all colors via design tokens — never hardcode oklch values in component CSS. `tokens.css` → `tokens-public.css` → `tokens-admin.css`.

## CSS Gotchas

- **OKLCH traps:** `oklch(L C var(--brand-hue) / alpha)` works. `oklch(from ...)` does NOT work with Lightning CSS. `color-mix()` is wrong for alpha tints
- **Tailwind v4 opacity:** `/80` modifier compiles to `color-mix()` — use literal `oklch(L C H / alpha)` instead
- **Layer order:** `@layer theme, base, components, utilities;` — every CSS file must declare this
- **Dark mode in component CSS:** don't add `html.dark` blocks — use tokens from `tokens.css` that already change in dark mode. Only `tokens.css` and `globals.css` (scrollbars) have `html.dark` selectors
- **Admin CSS isolation:** loaded only in dashboard route — no scoping needed, class names can match content CSS

**To rebrand:** (1) In `tokens.css`: replace hue `350` (brand) and `303` (accent); update `--brand-hue`, `--accent-hue`, `--gradient-brand`. (2) Public overrides in `tokens-public.css`. (3) Admin overrides in `tokens-admin.css`. (4) Update hardcoded `260` in dark surface tokens and `admin.css`.
