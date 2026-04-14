# Content Directory — CLAUDE.md

File-based content for two pipelines, determined by file extension:

## `.md` files — Synced to CMS Database

Legal/static pages synced to `cms_posts` on server startup via `syncContentFiles()`.

- **Sync:** `bun run content:sync` (also runs automatically on `bun run dev`)
- **Rules:** file mtime > DB updatedAt → save revision + update. DB newer → skip
- **Directory mapping:** root `.md` → page type, `blog/` → blog type. Others skipped
- **Frontmatter:** all fields optional — `title`, `description`, `seoTitle`, `date`, `image`, `imageAlt`, `noindex`. Title auto-generated from filename if missing. Content type determined by directory, not frontmatter

## `.mdx` files — Runtime MDX Rendering

Rich content rendered at request time with JSX components. Takes priority over CMS DB content with the same slug.

- **Components:** `<Callout>`, `<CodeTabs>/<Tab>`, `<Steps>/<Step>`, `<Badge>`
- **Compiled** via unified remark→rehype pipeline in `@/core/lib/markdown/mdx-compiler`
- **Admin badge:** shows ".mdx" in CMS list for overridden slugs

## Content Variables

`%VAR%` syntax — resolved at render time by `resolveContentVars()` from `src/core/lib/content/vars.ts`:

**Site:** `%SITE_NAME%`, `%SITE_URL%`

**Company:** `%COMPANY_NAME%`, `%COMPANY_ADDRESS%`, `%COMPANY_ID%`, `%COMPANY_JURISDICTION%`, `%COMPANY_VAT%`, `%COMPANY_PHONE%`, `%COMPANY_COUNTRY%`

**Contact:** `%CONTACT_EMAIL%`, `%SUPPORT_EMAIL%`, `%PRIVACY_EMAIL%`

**Social:** `%SOCIAL_TWITTER%`, `%SOCIAL_GITHUB%`, `%SOCIAL_FACEBOOK%`, `%SOCIAL_INSTAGRAM%`, `%SOCIAL_LINKEDIN%`, `%SOCIAL_YOUTUBE%`, `%SOCIAL_TIKTOK%`, `%SOCIAL_DISCORD%`, `%SOCIAL_MASTODON%`, `%SOCIAL_PINTEREST%`

**Auto-generated:** `%CURRENT_YEAR%`, `%CURRENT_DATE%`

**Custom:** any `var.MY_THING` option in DB becomes `%MY_THING%`

Values come from `src/config/site.ts` defaults, overridable via `cms_options` DB table. Changing values takes effect immediately — no re-sync needed.

## Seeding

`bun run init` copies templates from `src/core/_templates/content/{locale}/` to `content/{locale}/`. Files are copied verbatim with `%VAR%` placeholders. Never overwrites existing files.

## Structure

```
content/
  en/
    terms-of-service.md      → synced to DB as page
    privacy-policy.md         → synced to DB as page
    about.mdx                 → runtime MDX render
    blog/
      building-with-indigo.mdx → runtime MDX render
  CLAUDE.md                    → ignored (ALL-CAPS = meta file)
```

## Ignored Files

Files with ALL-CAPS names (e.g. `CLAUDE.md`, `README.md`) are skipped by both the sync script and the content loader. Regex: `/^[A-Z][A-Z0-9_-]*\.(md|mdx)$/`.
