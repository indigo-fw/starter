# docs/ — Documentation Content

Documentation `.mdx` files for the core-docs module. Organized by locale.

## Structure

```
docs/
  en/                              ← locale subdirectory
    getting-started/
      01-installation.mdx
      02-configuration.mdx
    guides/
      01-modules.mdx
      02-deployment.mdx
    api/
      01-authentication.mdx
      02-module-development.mdx
  de/                              ← translations (same slugs)
    getting-started/
      01-installation.mdx
      ...
```

## Conventions

- **Locale subdirectories** — `docs/{locale}/` mirrors `content/{locale}/` pattern
- **Only `.mdx` files** — no `.md` support in docs
- **Numeric prefixes** for sort order: `01-installation.mdx` → slug `installation`
- **Frontmatter:** `title`, `section`, `order`, `description`
- **MDX components:** `<Callout>`, `<CodeTabs>/<Tab>`, `<Steps>/<Step>`, `<Badge>`
- **Content variables:** `%SITE_NAME%`, `%COMPANY_NAME%`, etc. — resolved at render time from `site.ts`
- **File priority:** `.mdx` files override CMS `cms_docs` entries with the same slug
- **Fallback:** if a locale directory doesn't exist, falls back to default locale (`en`)
- **ALL-CAPS filenames** (`CLAUDE.md`, `README.md`, etc.) are ignored by the docs loader
