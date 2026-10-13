# Content Directory — AGENTS.md

File-based content, pipeline chosen by extension:

## `.md` — synced to CMS database

Legal/static pages synced to `cms_posts` on server startup (`syncContentFiles()`; manual: `bun run content:sync`).

- File mtime > DB `updatedAt` → save revision + update. DB newer → skip
- Directory decides content type (not frontmatter): root `.md` → page, `blog/` → blog. Others skipped
- All frontmatter fields optional (catalog: the sync script); title auto-generated from filename

## `.mdx` — runtime MDX rendering

Rendered at request time with JSX components (registry + pipeline: `@/core/lib/markdown/mdx-compiler`). Takes priority over CMS DB content with the same slug; the admin CMS list shows an ".mdx" badge on overridden slugs.

## Co-located images (`cms://asset/`)

Commit an image next to its `.md` and reference it with a `cms://asset/<content-root-relative-path>` URI — content sync uploads it to storage (S3/CDN in prod, `uploads/` in dev) and it's served from there, no manual upload.

```
content/en/about.md
content/en/about-cover.png       ← beside the .md (any layout: flat prefix or subfolder)
```
```markdown
---
image: cms://asset/en/about-cover.png    # featured / OG image
---
Body… <img src="cms://asset/en/about-cover.png" alt="…">
```

- **Path + hash, mutable in place.** Edit an image keeping its filename → the next sync detects the changed bytes, uploads a new cache-busted URL (`about-cover.<hash8>.png`) and supersedes the old row — no CDN purge. Unchanged → skipped (idempotent).
- Resolved at render time in `src/app/(public)/[...slug]/data.ts`, so it works for every content type's detail page, OpenGraph metadata, and list cards. Deleting a source image never breaks the live site (object + row persist).
- **Storage/GC:** superseded objects are tombstoned and physically removed 30 days later by `bun run media:prune` (scoped to sync-managed rows via non-null `source_path`; hand-uploads untouched). Concurrency-safe via the `cms_post_attachments_source_path_active_uniq` partial unique index. Code: `src/core/lib/content/image-sync.ts` (upload) + `asset-link.ts` (resolver).

## Content variables

`%VAR%` resolved at render time by `resolveContentVars()`. Live catalog: `src/core/lib/content/vars.ts`; any `var.MY_THING` option in the DB becomes `%MY_THING%`. Defaults from `src/config/site.ts`, overridable via `cms_options` — applies immediately, no re-sync.

## Tailwind utility blocks (promo pages)

CMS bodies render inside `prose` (Tailwind Typography), which restyles child elements — wrap utility-class promo blocks in `not-prose` (`<div class="not-prose grid gap-4 md:grid-cols-2">…`). Visual-editor authors: write these blocks in **Source mode**. The `@source '../../content/**/*.md'` directive in `src/app/globals.css` makes Tailwind emit classes used inside content files.

## Seeding & ignored files

`bun run init` copies `src/core/_templates/content/{locale}/` → `content/{locale}/` verbatim (with `%VAR%` placeholders) — never overwrites existing files. ALL-CAPS filenames (`/^[A-Z][A-Z0-9_-]*\.(md|mdx)$/`, e.g. `AGENTS.md`) are skipped by both sync and loader.
