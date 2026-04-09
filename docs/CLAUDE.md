# docs/ — Documentation Content

Documentation `.mdx` files for the core-docs module.

## Structure

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

## Conventions

- **Only `.mdx` files** — no `.md` support in docs
- **Numeric prefixes** for sort order: `01-installation.mdx` → slug `installation`
- **Frontmatter:** `title`, `section`, `order`, `description`
- **MDX components:** `<Callout>`, `<CodeTabs>/<Tab>`, `<Steps>/<Step>`, `<Badge>`
- **Content variables:** `[[SITE_NAME]]`, `[[COMPANY_NAME]]`, etc. — resolved at render time from `site.ts`
- **File priority:** `.mdx` files override CMS `cms_docs` entries with the same slug
- **ALL-CAPS filenames** (`CLAUDE.md`, `README.md`, `LICENSE.md`, etc.) are ignored by the docs loader — convention: ALL-CAPS = documentation/meta, lowercase = content
