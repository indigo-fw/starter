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
- Module hooks: type-safe via `HookMap` (`src/core/lib/module/module-hooks.ts` — signatures + JSDoc live there). Event ownership follows the *emitter* (see Module decoupling below)
- WS channel auth: `registerChannelAuthorizer(fn)`
- Schema overrides: modules declare `overridableSchema` in `module.config.ts`; project extends at `src/schema/overrides/`

### Signup & org lifecycle hooks

`user.created` (fired by `handleUserCreated` in `src/lib/auth-hooks.ts`) and `org.created` (auth-hooks + organizations router) let modules do per-signup/per-org setup from their deps files — auth/org code never imports module schemas. Signatures + JSDoc: `src/core/lib/module/module-hooks.ts`. Handler errors are logged and never fail signup (`Promise.allSettled`). Worked examples: `support-deps.ts` (guest-chat linking), `subscriptions-deps.ts` (reverse trial), `payments-deps.ts` (billing profile).

## Module decoupling (so `indigo remove <module>` stays clean)

Verified 2026-07 by a clean-room `init -- -y --modules recommended` run (10 modules removed): the pruned install typechecks clean and serves 200s. The mechanisms that make removal mechanical:

- **Header widgets**: modules contribute header-area components via `layoutWidgets: [{ slot: 'header', name, from }]` → generated `HEADER_WIDGETS` in `src/generated/module-widgets.ts` (e.g. core-store's `CartWidget`). Never hard-import module components in `layout.tsx`.
- **Sitemap fetchers**: modules declare `sitemapFetchers: [{ name, from }]` → generated `MODULE_SITEMAP_FETCHERS` in `src/generated/module-sitemap.ts`, spread into `src/app/sitemap.ts`'s `CONTENT_FETCHERS`. Never import module schemas in `sitemap.ts`.
- **Hook-event ownership rule**: an event belongs in the `HookMap` of whoever *emits* it. Events fired by always-present code (auth router, ws server, organizations router) but consumed by optional modules are **core-owned** — `attribution.capture`, `payment.conversion`, `ws.message`, `feature.require` live in core's `HookMap`. A module-owned declaration for a core-emitted event breaks typecheck the moment the module is removed.
- **`projectFiles` must be exhaustive**: every page/config/test a module scaffolds into project space (including client components next to pages, `__tests__`, and `config/*` files) must be listed, or removal orphans them with dangling imports. When adding a scaffolded file to a module, add it to `projectFiles` in the same commit.
- **Optional-module imports in scripts**: use computed specifiers + try/catch (see `scripts/indigo/personas.ts`, init's MCP-key minting) so typecheck passes on installs without the module.

- **Content slots**: modules contribute components to named slots via `contentSlots: [{ slot, name, from }]` → generated `src/generated/content-slots.tsx` (`CONTENT_SLOTS` + `<ContentSlot>`; special slot `showcase-comments` re-exports `useShowcaseComments` with an inert fallback). This is how core-comments reaches PostDetail/ShowcaseDetail/ShowcaseFeed without hard imports.
- **`org.created` hook**: fired by `auth-hooks.ts` (personal org at signup) and the organizations router; core-payments' handler in `payments-deps.ts` seeds the billing profile. No always-present file imports payment schemas.

### Remaining debt

- **core-payments + core-subscriptions are `required: true` primitives** (enforced in the init picker and `indigo remove`): core code still depends on them — `src/core/components/TokenBalance.tsx` uses `trpc.billing`, and `src/config/pricing.ts` is typed by subscription plan types. Making them truly optional means a token/billing DI seam in core; until then the picker keeps them automatically.

## Shared Utilities — Use These, Don't Reinvent

Before writing a helper, check whether core already ships it. The inventory is
the code, not this file — look it up live:

- **Where to look:** category barrels — `src/core/crud/index.ts` (CRUD, slugs,
  pagination, revisions, export), `src/core/lib/<area>/` (content, i18n, seo,
  email, infra, consent, mcp, module), `src/core/components/`, `src/core/hooks/`.
  Every export carries JSDoc; `bun run indigo map src/core` renders the full map.
- **Categories that exist** (so you know to look before reinventing): CRUD +
  admin-list helpers · slug utilities · shared router Zod schemas · content
  pipeline (markdown⇄html, MDX compile, `%VAR%` resolution, content sync) ·
  locale fallback · `cms://` link resolution · audit/webhook/email/push/logging
  infra · `withApiRoute` REST wrapper · RSS/sitemap/canonical/JSON-LD builders ·
  registries (cron, maintenance, scheduled publish, health checks) · consent,
  pagination, skeleton/avatar components · `useConfirm`/`useAlert`/`usePrompt`
  dialogs.

Non-obvious constraints (these *don't* live in JSDoc):
- Never inline a slug regex — `slugify()`/`ensureSlugUnique()` exist and are DB-aware.
- `resolveContentVars()` has a fast path that skips work when no `%` is present — don't pre-filter.
- CMS-link resolution is LRU + Redis pub/sub invalidated — never cache resolved links yourself.
- `logAudit()`/`dispatchWebhook()`/`sendNotification()` are fire-and-forget by design; they log their own errors.
- Use `enqueueEmail`/`enqueueTemplateEmail` — never a direct send.

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
