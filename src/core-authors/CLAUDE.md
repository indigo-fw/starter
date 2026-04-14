# core-authors — CLAUDE.md

Multi-author system with profiles, author pages, and polymorphic content attribution. Decouples editorial identity from user accounts.

## What It Adds

- `cms_authors` table (name, slug, bio, avatar, social URLs, optional userId link)
- `cms_author_relationships` polymorphic junction (any content type can have authors)
- Admin CRUD at `/dashboard/authors`, `AuthorPickerPanel` for PostForm
- `/author/[slug]` profile page with post archive, Person JSON-LD
- `AuthorByline` server component, Google News sitemap, per-author RSS feed

## Content Type Integration

Enable in `src/config/cms.ts` per type: `postFormFields: { authors: true }`, `authorInJsonLd: true`.

## Key Helpers

- `syncAuthorRelationships(db, objectId, contentType, authorIds)` — replace all authors
- `getAuthorsForObject()` / `batchGetAuthorsForObjects()` — frontend (avoids N+1)
- `getAuthorIds()` — admin form
- `generateNewsSitemap()` — Google News sitemap (articles from last 2 days)

## Wiring

`AuthorPickerPanel` manages its own state, saves via `trpc.authors.syncRelationships`. For new posts, buffers until parent form calls `onSaveRef.current(newPostId)`.

Seed: `seedAuthors()` creates 3 demo authors on `bun run init`.
