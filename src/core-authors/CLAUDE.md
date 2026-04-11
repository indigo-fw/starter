# core-authors — CLAUDE.md

Multi-author system with author profiles, author pages, and polymorphic content attribution. Decouples editorial identity from user accounts.

## What This Module Adds

- `cms_authors` entity table (name, slug, bio, avatar, social URLs, optional userId link)
- `cms_author_relationships` polymorphic junction (any content type can have authors)
- Admin: author CRUD at `/dashboard/authors`, author picker panel for PostForm
- Frontend: `/author/[slug]` profile page with post archive, Person JSON-LD
- `AuthorByline` server component (linked names, replaces core's plain text byline)
- `AuthorPickerPanel` client component (debounced search, persistent selection)

## Schema

| Table | Purpose |
|---|---|
| `cms_authors` | Author profiles — name, slug, bio, avatar, social URLs. Linked to `user` via optional `userId` FK |
| `cms_author_relationships` | Polymorphic M:N — `objectId` + `authorId` + `contentType` discriminator + `order` |

## Content Type Integration

Enable per content type in `src/config/cms.ts`:
```typescript
{
  id: 'blog',
  postFormFields: { authors: true },  // Show author picker in PostForm
  authorInJsonLd: true,               // Include authors in Article/BlogPosting JSON-LD
}
```

Works with any content type — blog, portfolio, showcase, custom types.

## PostForm Integration

The module provides `AuthorPickerPanel` — a self-contained client component. Add to PostForm panel renderers:

```typescript
import { AuthorPickerPanel } from '@/core-authors/components/AuthorPickerPanel';

// In panelRenderers:
authors: () => contentType.postFormFields?.authors
  ? <AuthorPickerPanel postId={postId} contentType={contentType.id} onSaveRef={authorSaveRef} />
  : null,
```

The panel manages its own state and saves via `trpc.authors.syncRelationships`. For new posts, it buffers state until the parent form calls `onSaveRef.current(newPostId)` after creation.

## Frontend Integration

Replace core's simple author byline in PostDetail:

```diff
- {authorName && <span>{authorName}</span>}
+ <AuthorByline postId={post.id} contentType="blog" />
```

`AuthorByline` is a server component that renders linked author names pointing to `/author/[slug]`.

## Key Helpers

- `syncAuthorRelationships(db, objectId, contentType, authorIds)` — replace all authors
- `getAuthorIds(db, objectId, contentType)` — ordered IDs for admin form
- `getAuthorsForObject(db, objectId, contentType)` — profiles for frontend
- `batchGetAuthorsForObjects(db, objectIds, contentType)` — avoids N+1 on list pages

## Router Endpoints

| Endpoint | Access | Purpose |
|---|---|---|
| `authors.list` | content editors | Paginated list with search |
| `authors.get` | content editors | Single author by ID |
| `authors.create` | content editors | Create author profile |
| `authors.update` | content editors | Update author profile |
| `authors.delete` | content editors | Delete author |
| `authors.candidates` | content editors | Lightweight list for picker |
| `authors.syncRelationships` | content editors | Set authors on content object |
| `authors.getRelationships` | content editors | Get author IDs for content object |
| `authors.getBySlug` | public | Author profile page |
| `authors.getPostsByAuthor` | public | Author archive (paginated posts) |
| `authors.getForObject` | public | Authors for a content object |
