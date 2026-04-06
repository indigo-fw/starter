# core-docs — CLAUDE.md

Documentation system supporting three content sources: CMS, .md files, and .mdx files.

## Module Boundary

**core-docs owns:** Docs schema (cms_docs table), docs tRPC router, file-based loader, unified docs service, DocRenderer + DocSidebar components, LLM export.

**Project owns:** `docs/content/` directory (file-based docs), docs page route (`app/docs/`), LLM API route (`app/api/docs/llms.txt/`).

## Three Content Sources

1. **CMS** — authored in admin dashboard, stored in `cms_docs` table. Rich text editor.
2. **.md files** — in `docs/content/` directory. Frontmatter for metadata. Git-tracked, AI-generatable.
3. **.mdx files** — same directory, supports JSX components inside markdown.

File-based docs take priority over CMS docs with the same slug.

## File Structure

```
docs/content/
  getting-started/
    installation.md
    configuration.md
  api/
    authentication.mdx
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

Slug derived from file path: `getting-started/installation.md` → `/docs/getting-started/installation`

## Key Endpoints

- `docs.getBySlug` — unified doc lookup (file → CMS fallback)
- `docs.getNavigation` — merged nav tree from all sources
- `docs.search` — full-text search across all docs
- `docs.llmExport` — all docs as single markdown (also at `/api/docs/llms.txt`)
- `docs.admin*` — CRUD for CMS-authored docs

## LLM-Friendly Export

`GET /api/docs/llms.txt` returns all documentation as plain markdown. Cached 1 hour. Designed for AI agents to consume entire documentation in one request.

## Wiring Into a Project

1. Add to `indigo.config.ts` and run `bun run indigo:sync`
2. Copy templates: `app/docs/[...slug]/page.tsx` and `app/api/docs/llms.txt/route.ts`
3. Create `docs/content/` directory for file-based docs
4. Run `db:generate` + `db:migrate` for the cms_docs table
