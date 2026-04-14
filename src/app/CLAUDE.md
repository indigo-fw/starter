# App Routes — CLAUDE.md

## i18n Routing

Proxy-rewrite with locale prefix — no `[locale]` route segment. Default locale (`en`) has no prefix; others get prefix (`/de/blog/post`). `src/proxy.ts` strips prefix and sets `x-locale` header.

**Link component:** `import { Link } from '@/components/Link'` — unified for all public links. Auto-detects: static routes, CMS slugs, `cms://` protocol, object hrefs, external URLs.
- Static: `href="/blog"`. Dynamic: `href={{ pathname: '/category/[slug]', params: { slug } }}`
- CMS: `href="/about-us"` (auto-resolved) or `href="cms://about-us?lang=de"`
- Passthrough (API, `/dashboard`, external): auto-detected, no locale prefix
- String URLs for computed paths: use `localePath()` from `@/core/lib/i18n/locale`
- Router hooks (`useRouter`, `redirect`): from `@/i18n/navigation`
- Core components: use `next/link` or `@/core/components/CmsLink` (can't import `@/components/Link`)
- **New public route:** add entry in `src/i18n/routing.ts` pathnames map
- **New locale:** add to `LOCALES` + `LOCALE_LABELS` in `src/lib/constants.ts`

**Tradeoff:** `x-locale` via `headers()` makes all public pages dynamic (no ISR/SSG). Acceptable for DB-driven CMS.

## Catch-All Route (`[...slug]`)

Renderer registry pattern: `renderer-registry.ts` + `register-renderers.tsx`. New content type = register a renderer, no if/else chains. Supports preview via `?preview=<token>`.

## Auth Proxy

`src/proxy.ts`: Dashboard auth paths (`/dashboard/login`, etc.) allowed without session. Other `/dashboard/*` redirects to login. `/account` requires session.

## PostForm Panels

Reorderable via dnd-kit, hideable via config. Draggable between main/sidebar columns. Definitions in `src/config/post-form-panels.ts`. Order/visibility in user preferences. Config-gated panels (`featuredImage`, `jsonLd`) controlled by `postFormFields` in `src/config/cms.ts`.
