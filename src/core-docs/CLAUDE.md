# core-docs — CLAUDE.md

Documentation system supporting two content sources: CMS database and `.mdx` files.

## Module Boundary

**core-docs owns:** Docs schema (cms_docs table), docs tRPC router, file-based loader, docs service, DocRenderer + DocSidebar components, docs layout CSS, LLM export.

**core owns (shared):** MDX compiler (`@/core/lib/mdx-compiler`), MDX component registry, MDX component styles (`@/core/styles/mdx-components.css`), MdxTabsHydrator (`@/core/components/MdxTabsHydrator`), content variable resolution (`@/core/lib/content-vars` — `[[VAR]]` syntax), file-based content loader + sync, frontmatter parser.

**Project owns:** `docs/content/` directory (file-based docs), docs page route (`app/docs/`), LLM API route (`app/api/docs/llms.txt/`).

## Two Content Sources

1. **CMS** — authored in admin dashboard, stored in `cms_docs` table. Rich text editor (HTML body).
2. **.mdx files** — in `docs/content/` directory. YAML frontmatter for metadata. Supports JSX components. Git-tracked.

File-based docs take priority over CMS docs with the same slug.

## File Structure

```
docs/content/
  getting-started/
    01-installation.mdx
    02-configuration.mdx
  guides/
    01-modules.mdx
    02-deployment.mdx
  api/
    01-authentication.mdx
    02-module-development.mdx
```

Frontmatter:
```yaml
---
title: Installation
section: Getting Started
order: 1
description: How to install Indigo
---
```

Slug derived from file path. Numeric prefixes stripped: `01-installation.mdx` → slug `installation`.

Files with ALL-CAPS names (e.g. `CLAUDE.mdx`, `README.mdx`) are ignored by the loader.

## MDX Components

Available in all `.mdx` files (compiled to static HTML via rehype plugin in `@/core/lib/mdx-compiler`):

- `<Callout type="info|warning|tip|danger">` — styled callout box
- `<CodeTabs>` + `<Tab label="...">` — tabbed code blocks (hydrated client-side for switching)
- `<Steps>` + `<Step title="...">` — numbered step list with timeline
- `<Badge variant="default|success|warning|danger">` — inline badge

All components work both block-level and inline. Custom components can be registered via `registerMdxComponent()` from `@/core/lib/mdx-compiler`.

## Content Variables

`[[VAR]]` placeholders (e.g. `[[COMPANY_NAME]]`, `[[SITE_NAME]]`) are resolved at render time from `src/config/site.ts` via `resolveContentVars()`. Works in both CMS content and `.mdx` files.

## Architecture

- **Compiler:** `@/core/lib/mdx-compiler` — unified pipeline: remark-parse → remark-mdx → remark-gfm → remark-rehype → rehypeMdxComponents → rehype-slug → rehype-stringify. Resolves `[[VAR]]` before compilation. LRU-cached by slug + mtime.
- **Service:** `lib/docs-service.ts` — `getDocBySlug()` returns `RenderedDoc` (with compiled `renderedBody`). `getAllDocs()` returns `UnifiedDoc[]` (no compilation, used for nav/search/export).
- **Rendering:** Page is server-rendered (async RSC). `DocRenderer` outputs static HTML. `MdxTabsHydrator` (from core) adds tab switching via event delegation.
- **Progressive enhancement:** Tabs are all visible without JS. `js-tabs-ready` class added by hydrator enables tab switching.
- **CSS:** `@/core/styles/mdx-components.css` (callouts, tabs, steps, badges) + `styles/docs.css` (docs layout only).
- **Request dedup:** `data.ts` wraps fetchers with `React.cache()` so `generateMetadata` and page share one compilation.

## Key Endpoints

- `docs.getBySlug` — unified doc lookup (file → CMS fallback), returns compiled HTML
- `docs.getNavigation` — merged nav tree from all sources
- `docs.search` — full-text search (tsvector for CMS, substring for files)
- `docs.llmExport` — all docs as single markdown (also at `/api/docs/llms.txt`)
- `docs.admin*` — CRUD for CMS-authored docs

## Wiring Into a Project

1. Add to `indigo.config.ts` and run `bun run indigo:sync`
2. Copy templates: `app/docs/data.ts`, `app/docs/page.tsx`, `app/docs/[...slug]/page.tsx`, `app/api/docs/llms.txt/route.ts`
3. Create `docs/content/` directory with `.mdx` files
4. Add `/docs` and `/docs/[...slug]` to `src/i18n/routing.ts` pathnames
5. Run `db:generate` + `db:migrate` for the cms_docs table
