# Content Directory — CLAUDE.md

File-based content, pipeline chosen by extension:

## `.md` — synced to CMS database

Legal/static pages synced to `cms_posts` on server startup (`syncContentFiles()`; manual: `bun run content:sync`).

- File mtime > DB `updatedAt` → save revision + update. DB newer → skip
- Directory decides content type (not frontmatter): root `.md` → page, `blog/` → blog. Others skipped
- All frontmatter fields optional (catalog: the sync script); title auto-generated from filename

## `.mdx` — runtime MDX rendering

Rendered at request time with JSX components (registry + pipeline: `@/core/lib/markdown/mdx-compiler`). Takes priority over CMS DB content with the same slug; the admin CMS list shows an ".mdx" badge on overridden slugs.

## Content variables

`%VAR%` resolved at render time by `resolveContentVars()`. Live catalog: `src/core/lib/content/vars.ts`; any `var.MY_THING` option in the DB becomes `%MY_THING%`. Defaults from `src/config/site.ts`, overridable via `cms_options` — applies immediately, no re-sync.

## Tailwind utility blocks (promo pages)

CMS bodies render inside `prose` (Tailwind Typography), which restyles child elements — wrap utility-class promo blocks in `not-prose` (`<div class="not-prose grid gap-4 md:grid-cols-2">…`). Visual-editor authors: write these blocks in **Source mode**. The `@source '../../content/**/*.md'` directive in `src/app/globals.css` makes Tailwind emit classes used inside content files.

## Seeding & ignored files

`bun run init` copies `src/core/_templates/content/{locale}/` → `content/{locale}/` verbatim (with `%VAR%` placeholders) — never overwrites existing files. ALL-CAPS filenames (`/^[A-Z][A-Z0-9_-]*\.(md|mdx)$/`, e.g. `CLAUDE.md`) are skipped by both sync and loader.
