# core-activity -- CLAUDE.md

User-facing activity feed and timeline system. Records events from across the app and exposes them as public, user, org, and entity-scoped feeds.

**Project owns:** `config/deps/activity-deps.ts`, `app/dashboard/(panel)/activity/page.tsx`, dashboard widget integration in `config/dashboard-widgets.tsx`.

## DI (`setActivityDeps()`)

- `resolveOrgId` -- validates user belongs to org (from `@/server/lib/resolve-org`)

## Schema

Single table `activity_events`: actor (user/system), dotted action string, polymorphic target (type + id + label), JSONB metadata, org scope, public flag.

## `recordActivity()`

From `@/core-activity/lib/activity-service` -- **fire-and-forget**: never throws, logs errors via logger. Use `actorType: 'system'` (no `actorId`) for system events.

## Non-obvious semantics

- `orgFeed` validates membership via injected `resolveOrgId`; `adminFeed` is offset-paginated, all other feeds are cursor-paginated
- `DashboardActivityWidget` is self-contained (fetches via `activity.adminFeed`) and already wired as the `'activity-feed'` widget in `src/config/dashboard-widgets.tsx`
- `ActivityItem` maps action prefixes to icons/labels in-code, falling back to the last segment of the dotted action
- Styles: `styles/activity.css`, `.activity-*` classes in `@layer components`, dark mode via `:root.dark` overrides
- Seed: deterministic UUIDs (`00000000-0000-4000-c200-*`) + `onConflictDoNothing()` for idempotency

## Wiring

1. Create `config/deps/activity-deps.ts` (scaffolded from `_templates/`) → import in `server.ts` as side-effect
2. Routers auto-registered via `indigo:sync`
3. Call `recordActivity()` from any module; admin log at `/dashboard/activity` (scaffolded from `_templates/`)
