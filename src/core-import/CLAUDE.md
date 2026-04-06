# core-import — CLAUDE.md

Paid module. Content import from WordPress, Ghost, CSV, and Indigo JSON. Also handles full CMS export.

## Module Boundary

**core-import owns:** Import parsers (WordPress WXR, Ghost JSON, CSV, Indigo JSON), import/export router, import types.

**Project owns:** Admin import page (`dashboard/settings/import/`).

## Import Rules

- Imports from `@/core/*` (slug, audit, types)
- Framework conventions: `@/server/trpc`, `@/server/db/schema`
- No dependency injection needed — parsers are pure functions
- Project imports from `@/core-import/*`

## Wiring Into a Project

1. **Router:** Auto-registered via `module.config.ts` → `indigo sync`
2. **Admin page:** Scaffolded from `_templates/` during `indigo add`

## Supported Formats

- **WordPress:** WXR (XML) export files
- **Ghost:** JSON export files
- **CSV:** Column-mapped CSV import
- **Indigo:** Native JSON backup format
- **Export:** Full CMS content as JSON (posts, categories, tags)
