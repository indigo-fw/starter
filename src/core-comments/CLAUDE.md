# core-comments -- CLAUDE.md

Polymorphic threaded comment system that attaches to any content type.

**Project owns:** Admin pages, `config/deps/comments-deps.ts`, integration into page templates (e.g. PostDetail).

## DI (`setCommentsDeps()`)

- `sendNotification` -- notify parent comment author on reply (skips self-replies)
- `onCommentCreated?` / `onCommentDeleted?` -- lifecycle callbacks (e.g. record activity events)

## Schema

`cms_comments` -- polymorphic via `targetType` + `targetId`. Threading via nullable `parentId` (self-reference); the API returns a flat list, the client builds the tree. Soft-delete via `deletedAt`. Status: 0=pending, 1=approved, 2=rejected, 3=spam. Optional `authorName` display override.

## Non-obvious semantics

- `create` auto-approves logged-in users; public endpoints return approved-only; users edit/delete their own comments inline
- `countMany` caps at 100 IDs -- use it for batch count badges on list pages (avoids N+1)
- Feeds are cursor-paginated; public reads join user name/image, admin adds email
- `CommentSection` imports the module CSS itself; `CommentItem` renders replies to depth 3; `CommentForm` caps content at 5000 chars
- Styles: `styles/comments.css`, all classes `comment-`-prefixed, themed via design-system CSS custom properties
- Seed: 12 demo comments, deterministic UUIDs (`00000000-0000-4000-c100-*`) for idempotency

## Integration

```tsx
import { CommentSection } from '@/core-comments/components/CommentSection';

<CommentSection targetType="post" targetId={post.id} />
```

`CommentCount` gives inline count badges on list pages. Admin moderation queue is scaffolded from `_templates/app/dashboard/(panel)/comments/page.tsx`.
