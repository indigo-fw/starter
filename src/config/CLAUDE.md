# Config — CLAUDE.md

Config files are the extension points for this template. Most new features are added here, not in core or server code.

## How to Add a New Content Type

1. Add config entry in `src/config/cms.ts`
2. Post-backed types: auto-registered via `cms_posts.type`. Others: create table + router
3. Add admin section page
4. Register renderer in `src/app/(public)/[...slug]/register-renderers.tsx`
5. Add sitemap fetcher in `src/app/sitemap.ts` (`CONTENT_FETCHERS` array)

## How to Add a New Taxonomy

1. Add declaration in `src/config/taxonomies.ts`
2. Simple (name+slug): reuse `cms_terms` table, create router scoped to new taxonomyId
3. Rich (custom fields): create dedicated table + router, set `customTable: true`
4. Add to `cms_term_relationships` with new taxonomyId discriminator
5. Add admin UI input component + wire into PostForm
6. Add content type entry in `cms.ts` if it has a public detail page
7. Update catch-all route + sitemap

## How to Add a New Shortcode

1. Create component in `src/core/components/shortcodes/` (or project-specific location)
2. Register in `src/config/shortcodes.ts` — add to `SHORTCODE_COMPONENTS` map
3. Core's `ShortcodeRenderer` accepts `components` prop (no core edit needed)

## How to Add a New Dashboard Widget

**Module-contributed (auto-registered):** Add `dashboardWidgets` entry in `module.config.ts` with id, name, from, label, colSpan, minSpan, maxSpan, defaultVisible. Run `bun run indigo:sync`. Component must accept `{ dragHandle?: ReactNode }`.

**Project-level (manual):** Add `DashboardWidgetDef` + component to `PROJECT_WIDGETS` / `PROJECT_WIDGET_COMPONENTS` in `src/config/dashboard-widgets.tsx`. Project entries override module entries with the same id.

## Infrastructure Config

`src/config/infra.ts` — DB pool size, audit log retention. Edit per project (no .env needed).

## How to Add a Custom Field Type

Core's `CustomFieldsEditor` accepts optional `fieldRenderers` prop — pass custom renderers to override/extend built-in types. No core edit needed.

## Email Branding

`src/config/email-deps.ts` — calls `setEmailDeps()` to wire DB branding lookup + template overrides to the core email engine. Imported as a side-effect in `server.ts` before starting the email worker. Customize branding by editing the `getBranding()` function (queries `cmsOptions` for site name, logo, brand color, etc.).

## SEO & Metadata

**Site config** (`src/config/site.ts`):
- `seo.defaultOgImage` — fallback OG image for pages without featured image (path relative to `public/` or absolute URL)
- `social.twitter` — Twitter/X handle for `twitter:site` meta tag (e.g. `'@indigo_fw'`). Empty = omitted.

**Content type fields** (`src/config/cms.ts` → `postFormFields`):
- `featuredImage: true` — show featured image picker
- `jsonLd: true` — show manual JSON-LD override field

**Canonical URLs:** `src/config/canonical-init.ts` wires `setCanonicalConfig()` with site URL + locale config. Imported as side-effect where canonical URLs are built.

## Sitemap

`CONTENT_FETCHERS` array in `src/app/sitemap.ts` + static pages pass into `generateSitemap()` from `@/core/lib/seo/sitemap`. Adding a content type = adding a fetcher entry. Sitemap includes x-default hreflang for multilingual sites.

## Maintenance Tasks

Register project-specific cleanup tasks in `src/server/jobs/maintenance/index.ts` via `registerMaintenanceTask()`. Core runs all registered tasks daily at 3 AM via the cron registry. Each task catches its own errors independently.

## Cron Jobs

Register in `server.ts` via `registerCronJob({ name, pattern, handler })` before calling `startCronScheduler()`. Core handles BullMQ repeatable jobs vs DB-queue fallback automatically.
