# core-comments -- CLAUDE.md

Polymorphic threaded comment system that attaches to any content type.

## Module Boundary

**core-comments owns:** Comment schema (`targetType`/`targetId`/`content` fields), comments router with public + admin endpoints, DI deps, public components (CommentSection, CommentForm, CommentItem, CommentCount), styles, seed.

**Project owns:** Admin pages, `config/comments-deps.ts`, integration into page templates (e.g. PostDetail).

**Note:** There is an existing core router at `src/server/routers/comments.ts` using legacy field names (`contentType`/`contentId`/`body`). After `indigo:sync`, the module router overrides it via the `comments` key in the appRouter spread.

## DI (`setCommentsDeps()`)

- `sendNotification` -- notify users on reply

## Schema

`cms_comments` -- polymorphic via `targetType` + `targetId`. Threading via nullable `parentId` (self-reference). Soft-delete via `deletedAt`. Status: 0=pending, 1=approved, 2=rejected, 3=spam. Logged-in users auto-approved. Optional `authorName` display override.

## Router Endpoints

| Endpoint | Access | Purpose |
|---|---|---|
| `comments.list` | public | Approved comments for a target (cursor pagination) |
| `comments.count` | public | Approved comment count for a target |
| `comments.countMany` | public | Batch counts for grids (max 100 IDs) |
| `comments.create` | protected | Post comment (auto-approved) |
| `comments.update` | protected | Edit own comment |
| `comments.delete` | protected | Soft-delete own comment |
| `comments.adminList` | content editors | Paginated with status/type/search filters |
| `comments.updateStatus` | content editors | Moderate (approve/reject/spam) |
| `comments.adminDelete` | content editors | Permanent delete |
| `comments.statusCounts` | content editors | Counts per status for filter tabs |

## Components

| Component | Location | Purpose |
|---|---|---|
| `CommentSection` | `components/CommentSection.tsx` | Main public-facing component. Props: `targetType`, `targetId`. Renders comment form (if logged in), threaded comment list, and count header. Imports CSS. |
| `CommentForm` | `components/CommentForm.tsx` | Textarea + submit. Props: `targetType`, `targetId`, optional `parentId`, `onSubmitted`, `onCancel`, `autoFocus`. Uses `comments.create` mutation. Max 5000 chars. |
| `CommentItem` | `components/CommentItem.tsx` | Single comment with avatar, name, relative time, content, reply/edit/delete actions. Recursively renders replies up to depth 3. |
| `CommentCount` | `components/CommentCount.tsx` | Inline count badge. Props: `targetType`, `targetId`, optional `className`. |

## Styles

`styles/comments.css` -- all classes prefixed `comment-`. Uses CSS custom properties from design system (`--text-primary`, `--text-muted`, `--border-subtle`, `--surface-primary`, `--surface-secondary`, `--radius-md`, `--color-brand-600`, `--color-error-600`). Imported by `CommentSection`.

## Admin Page

`_templates/app/dashboard/(panel)/comments/page.tsx` -- Moderation queue with status filter tabs (All/Pending/Approved/Rejected/Spam with counts), search, table with author/comment/target/status/date/actions columns. Actions: approve, reject, spam, delete. Uses `ConfirmDialog` for delete confirmation, `toast` for success/error feedback.

## Seed

`seed/index.ts` -- `seedComments()` creates 8 demo comments (5 top-level + 3 threaded replies) on existing blog posts. `hasCommentsData()` skip check. Deterministic UUIDs (`00000000-0000-4000-c100-*`) for idempotent seeding.

## Key Features

- **Polymorphic** -- attach to any content type via `targetType` string
- **Threaded** -- `parentId` self-reference, flat API (client builds tree up to depth 3)
- **Moderation** -- pending/approved/rejected/spam statuses, admin queue with batch actions
- **Auto-approve** -- logged-in user comments approved immediately
- **Cursor pagination** -- efficient for real-time comment loading
- **Batch counts** -- `countMany` avoids N+1 on listing pages
- **User enrichment** -- joins user table for name/image on public, +email on admin
- **Edit/Delete** -- users can edit/delete their own comments inline

## Integration

To add comments to a page template, import and render `CommentSection`:

```tsx
import { CommentSection } from '@/core-comments/components/CommentSection';

<CommentSection targetType="post" targetId={post.id} />
```

For inline count badges on list pages:

```tsx
import { CommentCount } from '@/core-comments/components/CommentCount';

<CommentCount targetType="post" targetId={post.id} />
```

## Module Config

- Seed: `seedComments` with `hasCommentsData` check
- Nav: Comments item under `content` group (MessageSquare icon)
- Project files: `config/comments-deps.ts`, `app/dashboard/(panel)/comments/page.tsx`
