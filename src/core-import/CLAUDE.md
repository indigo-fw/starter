# core-import — CLAUDE.md

Paid module. Content import from external platforms, plus full CMS export.

**Project owns:** Admin import page (`dashboard/settings/import/`). No DI — parsers are pure functions.

## Wiring Into a Project

1. **Router:** Auto-registered via `module.config.ts` → `indigo sync`
2. **Admin page:** Scaffolded from `_templates/` during `indigo add`

## Formats

Live list: `lib/importers/` (one parser per source; surface in `module.config.ts`). Non-obvious: WordPress means WXR (XML) export files; CSV is column-mapped; export emits the native Indigo JSON backup format, which the Indigo importer round-trips.
