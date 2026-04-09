# Content Directory — CLAUDE.md

File-based content for two pipelines, determined by file extension:

## `.md` files — Synced to CMS Database

Legal/static pages synced to `cms_posts` on server startup via `syncContentFiles()`.

- **Sync:** `bun run content:sync` (also runs automatically on `bun run dev`)
- **Rules:** file mtime > DB updatedAt → save revision + update. DB newer → skip
- **Directory mapping:** root `.md` → page type, `blog/` → blog type. Others skipped
- **Frontmatter required:** `title`, `type`, `description`, `noindex`

## `.mdx` files — Runtime MDX Rendering

Rich content rendered at request time with JSX components. Takes priority over CMS DB content with the same slug.

- **Components:** `<Callout>`, `<CodeTabs>/<Tab>`, `<Steps>/<Step>`, `<Badge>`
- **Compiled** via unified remark→rehype pipeline in `@/core/lib/mdx-compiler`
- **Admin badge:** shows ".mdx" in CMS list for overridden slugs

## Content Variables

`[[VAR]]` syntax — resolved at render time from `src/config/site.ts`:

| Variable | Source |
|----------|--------|
| `[[SITE_NAME]]` | `clientEnv.siteName` |
| `[[SITE_URL]]` | `clientEnv.appUrl` |
| `[[COMPANY_NAME]]` | `siteDefaults.companyName` |
| `[[COMPANY_ADDRESS]]` | `siteDefaults.companyAddress` |
| `[[COMPANY_ID]]` | `siteDefaults.companyId` |
| `[[COMPANY_JURISDICTION]]` | `siteDefaults.companyJurisdiction` |
| `[[CONTACT_EMAIL]]` | `siteDefaults.contactEmail` |

Changing values in `site.ts` takes effect immediately — no re-sync needed.

## Seeding

`bun run init` copies templates from `src/core/seed-templates/{locale}/` to `content/{locale}/`. Files are copied verbatim with `[[VAR]]` placeholders. Never overwrites existing files.

## Structure

```
content/
  en/
    terms-of-service.md      → synced to DB as page
    privacy-policy.md         → synced to DB as page
    about.mdx                 → runtime MDX render
    blog/
      building-with-indigo.mdx → runtime MDX render
```
