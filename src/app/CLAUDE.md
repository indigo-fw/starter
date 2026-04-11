# App Routes — CLAUDE.md

## i18n / Locale Routing

**Approach:** Proxy-rewrite with locale prefix — no `[locale]` route segment. Default locale (`en`) has no prefix; non-default locales get prefix (`/de/blog/post`). Dashboard is unaffected.

**How it works:** `src/proxy.ts` detects locale prefix, rewrites URL (strips prefix), sets `x-locale` header.

**Unified Link component:** `import { Link } from '@/components/Link'` — single component for all public links. Handles static routes, CMS content (slug/ID resolution), `cms://` protocol, object hrefs with params, and external URLs. Auto-detects what to do based on `href` value. Typed autocomplete for static routes from `src/i18n/routing.ts` pathnames map.

**Key rules:**
- **JSX links** (`<Link>`): import from `@/components/Link`. Static: `href="/blog"`. Dynamic: `href={{ pathname: '/category/[slug]', params: { slug } }}`. Query: `href={{ pathname: '/blog', query: { page: '2' } }}`. CMS slug: `href="/about-us"` (auto-resolved from DB). CMS protocol: `href="cms://about-us?lang=de"`. Explicit: `id="uuid"` or `slug="about-us"` props
- **Passthrough** (API routes, `/dashboard`, RSS, external): auto-detected — no locale prefix, no DB lookup. `<Link href="/dashboard">` and `<Link href="https://...">` just work
- **String URLs for computed paths** (form actions, sidebarItems, sitemap): use `localePath()` from `@/core/lib/i18n/locale`
- **Router hooks** (`useRouter`, `redirect`, `usePathname`): still from `@/i18n/navigation` — same as before
- **Core components** (`src/core/`): can't import `@/components/Link` (project layer). Use `next/link` or `@/core/components/CmsLink` directly
- All public queries must pass `lang: locale` (from `getLocale()` or `useLocale()`)
- hreflang alternates use `translationGroup` DB column for sibling lookup
- **To add a new public route:** add entry in `src/i18n/routing.ts` pathnames map. Static routes auto-detected by `<Link>` — no DB call

**CMS Link resolution:** `cms://` URIs in content strings are resolved server-side in the data layer (`data.ts` calls `resolveRecordCmsLinks()`). `<Link>` component resolves client-side via tRPC with React Query caching (1h stale time, batched via httpBatchLink). Cache invalidated on content save via Redis pub/sub.

**Tradeoff:** `x-locale` header via `headers()` makes all public pages dynamic (no ISR/SSG). Acceptable for DB-driven CMS. For static generation in single-locale deployments, set `LOCALES` to one entry.

**To add a locale:** Add to `LOCALES` + `LOCALE_LABELS` in `src/lib/constants.ts`. Optionally add DeepL mapping. No other code changes.

## Catch-All Route (`[...slug]`)

Uses **renderer registry** pattern (open-closed): `renderer-registry.ts` + `register-renderers.tsx`. Adding a content type = registering a renderer, no if/else chains.

Supports preview mode via `?preview=<token>`.

## Auth Proxy Rules

`src/proxy.ts`: Dashboard auth paths (`/dashboard/login`, etc.) allowed without session. All other `/dashboard/*` paths redirect to `/dashboard/login`. `/account` paths require session (redirect to `/login`).

## Cookie Consent

`<ConsentProvider>` wraps the public layout. `<CookieConsent />` renders the banner (auto-hides after user choice). Use `<ConsentGate category="analytics">` around GA4/marketing scripts to conditionally render based on consent. All from `@/core/components` and `@/core/lib/consent`.

## Health Check

`GET /api/health` — uses `createHealthHandler()` from `@/core/lib/api/health`. Project passes DB + Redis checks; modules contribute via `registerHealthCheck()` hooks. Returns `healthy` (200) / `degraded` / `unhealthy` (503).

## RSS Feeds

`/api/feed/blog` and `/api/feed/tag/[slug]` use `generateRssFeed()` + `createRssResponse()` from `@/core/lib/content/rss`. Project provides DB queries and URL builders; core generates XML.

## Sitemap

`src/app/sitemap.ts` uses `generateSitemap()` from `@/core/lib/seo/sitemap`. Project defines `STATIC_PAGES` + `CONTENT_FETCHERS` arrays. Adding a new content type = adding a fetcher entry with its DB query.

## SEO Metadata

Root layout (`src/app/layout.tsx`) provides defaults: OG type/siteName/locale/image, Twitter Card, `metadataBase`, Organization JSON-LD. Content renderers override per page: canonical URL (via `buildCanonicalUrl()`), `openGraph.locale`, hreflang alternates with x-default.

**Canonical init:** `src/config/canonical-init.ts` — side-effect that calls `setCanonicalConfig()`. Imported in `register-renderers.tsx` (catch-all tree) and home `page.tsx`.

**Auto JSON-LD in PostDetail:** If post has no manual `jsonLd`, auto-generates Article (pages) or BlogPosting (blog) with title, description, dates, image, publisher. Includes `author` array when `contentType.authorInJsonLd` is true and `cms_post_authors` has entries. BreadcrumbList auto-generated for hierarchical pages with ancestors.

**Web Vitals:** `src/components/WebVitals.tsx` — reports CLS/INP/LCP/FCP/TTFB to `NEXT_PUBLIC_VITALS_ENDPOINT` via `sendBeacon`. Console log in dev if no endpoint configured.

## PostForm Panel System

Form panels (SEO, Categories, Tags, Featured Image, Authors, etc.) are reorderable via dnd-kit and hideable via config SlideOver. Panels draggable between main/sidebar columns. Panel definitions in `src/config/post-form-panels.ts`. Order/visibility persisted via user preferences.

**Config-gated panels** (controlled by `postFormFields` in `src/config/cms.ts`):
- `featuredImage` — image picker (used in OG/Twitter Cards)
- `jsonLd` — manual JSON-LD override (auto-generated if blank)
- `authors` — multi-select author picker with debounced search. Auto-populates current user for new posts. Selected authors persist across searches via ref cache. Order preserved in `cms_post_authors` junction table.

**Author display:** Byline shown in PostDetail when `postFormFields.authors` is true. JSON-LD `author` field included when `authorInJsonLd` is also true. These are independent flags — a content type can show bylines without structured data.
