# App Routes — CLAUDE.md

## i18n / Locale Routing

**Approach:** Proxy-rewrite with locale prefix — no `[locale]` route segment. Default locale (`en`) has no prefix; non-default locales get prefix (`/de/blog/post`). Dashboard is unaffected.

**How it works:** `src/proxy.ts` detects locale prefix, rewrites URL (strips prefix), sets `x-locale` header.

**Typed navigation:** `src/i18n/routing.ts` defines routing config with `pathnames` map; `src/i18n/navigation.ts` exports typed `Link`, `redirect`, `useRouter`, `usePathname` via `createNavigation()`. Link `href` is constrained to pathnames keys — typos are compile errors.

**Key rules:**
- **JSX links** (`<Link>`): import from `@/i18n/navigation`. Typed — href constrained to pathnames map. Static: `href="/blog"`. Dynamic: `href={{ pathname: '/category/[slug]', params: { slug } }}`. Query: `href={{ pathname: '/blog', query: { page: '2' } }}`
- **String URLs for known routes** (form actions, sidebarItems): use `getPathname({ locale, href })` from `@/i18n/navigation` — same type safety as Link
- **String URLs for DB-driven/computed paths** (PostCard hrefs, search results, sitemap): use `localePath()` from `@/lib/locale` — accepts any string
- **Non-locale links** (API routes, `/dashboard`, RSS): use `NextLink` from `next/link`
- **Client `useRouter`**: import from `@/i18n/navigation` (auto-prefixes, typed)
- All public queries must pass `lang: locale` (from `getLocale()` or `useLocale()`)
- hreflang alternates use `translationGroup` DB column for sibling lookup
- **To add a new public route:** add entry in `src/i18n/routing.ts` pathnames map. Forgetting → compile error on `<Link href="/new-route">`

**Tradeoff:** `x-locale` header via `headers()` makes all public pages dynamic (no ISR/SSG). Acceptable for DB-driven CMS. For static generation in single-locale deployments, set `LOCALES` to one entry.

**To add a locale:** Add to `LOCALES` + `LOCALE_LABELS` in `src/lib/constants.ts`. Optionally add DeepL mapping. No other code changes.

## Catch-All Route (`[...slug]`)

Uses **renderer registry** pattern (open-closed): `renderer-registry.ts` + `register-renderers.tsx`. Adding a content type = registering a renderer, no if/else chains.

Supports preview mode via `?preview=<token>`.

## Auth Proxy Rules

`src/proxy.ts`: Dashboard auth paths (`/dashboard/login`, etc.) allowed without session. All other `/dashboard/*` paths redirect to `/dashboard/login`. `/account` paths require session (redirect to `/login`).

## PostForm Panel System

Form panels (SEO, Categories, Tags, Featured Image, etc.) are reorderable via dnd-kit and hideable via config SlideOver. Panels draggable between main/sidebar columns. Panel definitions in `src/config/post-form-panels.ts`. Order/visibility persisted via user preferences.
