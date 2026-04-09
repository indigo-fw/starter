# core-docs — CLAUDE.md

Documentation system supporting three content sources: CMS, .md files, and .mdx files.

## Module Boundary

**core-docs owns:** Docs schema (cms_docs table), docs tRPC router, file-based loader, unified/remark/rehype MDX compiler, docs service, DocRenderer + DocSidebar + DocsTabsHydrator components, docs CSS, LLM export.

**Project owns:** `docs/content/` directory (file-based docs), docs page route (`app/docs/`), LLM API route (`app/api/docs/llms.txt/`).

## Three Content Sources

1. **CMS** — authored in admin dashboard, stored in `cms_docs` table. Rich text editor (HTML body).
2. **.md files** — in `docs/content/` directory. YAML frontmatter for metadata. Git-tracked.
3. **.mdx files** — same directory. Supports custom JSX components (compiled to HTML server-side).

File-based docs take priority over CMS docs with the same slug.

## File Structure

```
docs/content/
  getting-started/
    01-installation.md
    02-configuration.md
  guides/
    01-modules.md
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

Slug derived from file path. Numeric prefixes stripped: `01-installation.md` → slug `installation`.

## MDX Components

Available in `.mdx` files (compiled to static HTML via rehype plugin, no React runtime):

- `<Callout type="info|warning|tip|danger">` — styled callout box
- `<CodeTabs>` + `<Tab label="...">` — tabbed code blocks (hydrated client-side for switching)
- `<Steps>` + `<Step title="...">` — numbered step list with timeline
- `<Badge variant="default|success|warning|danger">` — inline badge

All components work both block-level and inline.

## Architecture

- **Compiler:** `lib/mdx-compiler.ts` — unified pipeline: remark-parse → remark-mdx → remark-gfm → remark-rehype → rehypeMdxComponents (custom plugin) → rehype-slug → rehype-stringify. Produces HTML strings.
- **Service:** `lib/docs-service.ts` — `getDocBySlug()` returns `RenderedDoc` (with compiled `renderedBody`). `getAllDocs()` returns `UnifiedDoc[]` (no compilation, used for nav/search/export).
- **Rendering:** Page is server-rendered (async RSC). `DocRenderer` outputs static HTML. `DocsTabsHydrator` (client) adds tab switching via event delegation.
- **Progressive enhancement:** Tabs are all visible without JS. `js-tabs-ready` class added by hydrator enables tab switching.
- **CSS:** `styles/docs.css` — callout variants, code tabs, steps, badges, admonitions. OKLCH colors with dark mode.

## Key Endpoints

- `docs.getBySlug` — unified doc lookup (file → CMS fallback), returns compiled HTML
- `docs.getNavigation` — merged nav tree from all sources
- `docs.search` — full-text search (tsvector for CMS, substring for files)
- `docs.llmExport` — all docs as single markdown (also at `/api/docs/llms.txt`)
- `docs.admin*` — CRUD for CMS-authored docs

## Wiring Into a Project

1. Add to `indigo.config.ts` and run `bun run indigo:sync`
2. Copy templates: `app/docs/[...slug]/page.tsx` and `app/api/docs/llms.txt/route.ts`
3. Create `docs/content/` directory for file-based docs
4. Add `/docs` and `/docs/[...slug]` to `src/i18n/routing.ts` pathnames
5. Run `db:generate` + `db:migrate` for the cms_docs table
