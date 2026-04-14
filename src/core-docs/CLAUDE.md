# core-docs — CLAUDE.md

Documentation system with two content sources: CMS database and `.mdx` files.

## Two Sources

1. **CMS** — authored in admin, stored in `cms_docs` (with `locale`). Rich text editor
2. **.mdx files** — in `docs/{locale}/`. YAML frontmatter, JSX components, git-tracked

File-based docs take priority over CMS docs with same slug. Both locale-aware.

## Architecture

- **Compiler:** `@/core/lib/markdown/mdx-compiler` — remark → rehype pipeline with component registry, LRU-cached
- **Service:** `getDocBySlug()` returns compiled HTML, `getAllDocs()` returns metadata (nav/search/export)
- **Rendering:** server-rendered RSC. `MdxTabsHydrator` adds tab switching via event delegation
- **Dedup:** `data.ts` wraps fetchers with `React.cache()` — `generateMetadata` and page share one compilation

## MDX Components

`<Callout type="info|warning|tip|danger">`, `<CodeTabs>` + `<Tab>`, `<Steps>` + `<Step>`, `<Badge>`. Register custom via `registerMdxComponent()`.

## Key Endpoints

- `docs.getBySlug` — unified lookup (file → CMS fallback), compiled HTML
- `docs.getNavigation` — merged nav tree from all sources
- `docs.search` — tsvector for CMS, substring for files
- `docs.llmExport` — all docs as markdown (also at `/api/docs/llms.txt?lang=en`)

## Wiring

1. Add to `indigo.config.ts`, run `indigo:sync`
2. Copy templates from `_templates/` (data.ts, pages, API route)
3. Create `docs/en/` with `.mdx` files
4. Add routes to `src/i18n/routing.ts`
5. `db:generate` + `db:migrate`
