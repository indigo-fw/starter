# docs/ — Documentation Content

`.mdx` files for the core-docs module, organized by locale (`docs/{locale}/`).

- Numeric prefixes for sort order: `01-installation.mdx` → slug `installation`
- Frontmatter: `title`, `section`, `order`, `description`
- Components: `<Callout>`, `<CodeTabs>/<Tab>`, `<Steps>/<Step>`, `<Badge>`
- Content variables: `%VAR%` resolved at render from `site.ts`
- File priority: `.mdx` overrides CMS `cms_docs` with same slug
- Locale fallback: missing locale dir falls back to `en`
- ALL-CAPS filenames ignored by loader

See `src/core-docs/CLAUDE.md` for full module docs.
