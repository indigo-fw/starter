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

- `syncAuthorRelationships(db, objectId, contentType, authorIds)` — replace all authors for an object
- `getAuthorsForObject(db, objectId, contentType)` — author profiles for frontend display
- `batchGetAuthorsForObjects(db, objectIds, contentType)` — avoids N+1 on list pages
- `getAuthorIds(db, objectId, contentType)` — ordered IDs for admin form
- `generateNewsSitemap(config, articles)` — Google News sitemap (articles from last 2 days)

## Router Endpoints

| Endpoint | Access | Purpose |
|---|---|---|
| `authors.list` | content editors | Paginated list with search |
| `authors.get` / `create` / `update` / `delete` | content editors | CRUD |
| `authors.candidates` | content editors | Lightweight list for picker |
| `authors.syncRelationships` | content editors | Set authors on content object |
| `authors.getRelationships` | content editors | Get author IDs for content object |
| `authors.getBySlug` | public | Author profile page |
| `authors.getPostsByAuthor` | public | Author archive (paginated) |
| `authors.getForObject` | public | Authors for a content object |
| `authors.sitemapEntries` | public | All author slugs for sitemap |

## Wiring

`AuthorPickerPanel` manages its own state, saves via `trpc.authors.syncRelationships`. For new posts, buffers until parent form calls `onSaveRef.current(newPostId)`.

Seed: `seedAuthors()` creates 3 demo authors (Alex Rivera, Jordan Chen, Sam Patel) on `bun run init`.
