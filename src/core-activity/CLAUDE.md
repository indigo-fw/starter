# core-activity -- CLAUDE.md

User-facing activity feed and timeline system. Records events from across the app and exposes them as public, user, org, and entity-scoped feeds. Includes admin page, dashboard widget, seed data, and reusable components.

## Module Boundary

**core-activity owns:** `activity_events` schema, activity router, `recordActivity()` service, DI deps, components (`ActivityFeed`, `ActivityItem`, `AdminActivityFeed`, `DashboardActivityWidget`), styles, seed.

**Project owns:** `config/deps/activity-deps.ts`, `app/dashboard/(panel)/activity/page.tsx`, dashboard widget integration in `config/dashboard-widgets.tsx`.

## DI (`setActivityDeps()`)

- `resolveOrgId` -- validates user belongs to org (from `@/server/lib/resolve-org`)

## Schema

Single table `activity_events`: actor (user/system), dotted action string, polymorphic target (type + id + label), JSONB metadata, org scope, public flag.

Indexes: org+created, actor+created, target type+id, action, public+created.

## `recordActivity()` API

```ts
import { recordActivity } from '@/core-activity/lib/activity-service';

// Fire-and-forget -- never throws, logs errors via logger
await recordActivity({
  actorId: userId,
  action: 'comment.created',
  targetType: 'post',
  targetId: postId,
  targetLabel: 'My Blog Post',
  organizationId: orgId,
  isPublic: true,
});

// System event (no actor)
await recordActivity({
  actorType: 'system',
  action: 'maintenance.completed',
  metadata: { duration: 42 },
});
```

## Router Endpoints

| Endpoint | Access | Purpose |
|---|---|---|
| `activity.publicFeed` | public | Public events, cursor-paginated |
| `activity.myFeed` | protected | Current user's events, cursor-paginated |
| `activity.orgFeed` | protected | Org-scoped events (validates membership via DI) |
| `activity.forTarget` | protected | Events for a specific entity (type + id) |
| `activity.adminFeed` | dashboard staff | All events with filters (action, actor, target type), offset-paginated |

## Components

| Component | Location | Purpose |
|---|---|---|
| `ActivityItem` | `components/ActivityItem.tsx` | Single event row -- icon, actor, action, target, time |
| `ActivityFeed` | `components/ActivityFeed.tsx` | Paginated list of ActivityItem -- empty state, loading, load more |
| `AdminActivityFeed` | `components/AdminActivityFeed.tsx` | Wrapper that fetches via `activity.adminFeed` and renders ActivityFeed |
| `DashboardActivityWidget` | `components/DashboardActivityWidget.tsx` | Compact self-contained widget fetching 8 recent events |

### Action icons

`ActivityItem` maps action prefixes to lucide icons and CSS color classes:
- `comment.*` -- MessageSquare, blue
- `post.*` -- FileText, green
- `order.*` -- ShoppingCart, amber
- `user.*` -- User, purple
- default -- Activity, muted (system)

### Action labels

`comment.created` -> "commented on", `post.published` -> "published", `order.placed` -> "placed an order for", etc. Falls back to last segment of dotted action.

## Styles

`styles/activity.css` -- prefixed `.activity-*` classes inside `@layer components`. Supports dark mode via `:root.dark` overrides on icon backgrounds.

## Seed

`seed/index.ts` -- 12 demo events across post/comment/order/user actions spread over 7 days. Deterministic UUIDs (`00000000-0000-4000-c200-*`). Uses `onConflictDoNothing()` for idempotency.

- `hasActivityData(db)` -- returns true if any events exist (skips seed)
- `seedActivity(db, superadminUserId)` -- inserts demo data

## Admin Page

`_templates/app/dashboard/(panel)/activity/page.tsx` -- full admin activity log at `/dashboard/activity`.

Features:
- Stat cards (total, posts, comments, users)
- Action category tabs (All, Posts, Comments, Orders, Users)
- Filter bar with search and target type dropdown
- Table: Actor (avatar + name), Action (badge), Target (label + type), Time (relative)
- Pagination

## Dashboard Widget

`DashboardActivityWidget` is self-contained (fetches 8 recent events via `activity.adminFeed`). Already integrated in `src/config/dashboard-widgets.tsx` as the `'activity-feed'` widget with a card wrapper and "View all" link to `/dashboard/activity`.

## Wiring

1. Create `config/deps/activity-deps.ts` (scaffolded from `_templates/`)
2. Import in `server.ts` as side-effect
3. Routers auto-registered via `indigo:sync`
4. Call `recordActivity()` from any module to log user-facing events
5. Admin page at `/dashboard/activity` (scaffolded from `_templates/`)
6. Optionally integrate dashboard widget (see above)
