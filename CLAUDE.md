# CLAUDE.md

## Overview

Indigo is an open-source, AI agent-driven T3 SaaS framework with integrated CMS: Next.js 16 (App Router) + tRPC + Drizzle ORM + Better Auth. PostgreSQL with UUID primary keys. Clone for each new SaaS/social/AI app project. CMS stays global (marketing site); SaaS primitives (orgs, billing, notifications, real-time) scope to organizations. Modular architecture — premium features available as installable modules via `bun run indigo add <module>`.

## Development

- **Package manager:** `bun`
- **Dev server:** `bun run dev` (custom server with Turbopack, port 3000)
- **First-time setup:** `bun run init` — creates DB, migrations, superadmin, seeds all content
- **Promote user:** `bun run promote <email>`
- **Change password:** `bun run change-password <email>`
- **Database:** `bun run db:generate` after schema changes, `bun run db:migrate` to apply, `bun run db:studio` for viewer
- **Type check:** `bun run typecheck`
- **Tests:** `bun test` — bun test runner (vitest-compatible, NOT vitest). Use `asMock(fn)` from `@/test-utils` instead of `vi.mocked()`. Avoid `vi.waitFor()`, `vi.stubGlobal()`, `vi.importActual()` — these are vitest-only APIs
- **Translations:** PO files in `locales/admin/*.po`. After editing: `bun run generate-po && bun run transform:po`
- **Environment:** Zod-validated env vars in `src/lib/env.ts`

## Coding Standards

- No `any` — use `unknown` and narrow, or generics/interfaces
- Use `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`
- No plain `Error` in server code — always `TRPCError` with proper code
- Constrain Zod inputs — `.max()` on strings, `.uuid()` on IDs, `.max(N)` on arrays
- Safety `limit` on all `.findMany()` / `.select()` queries
- `isNull(deletedAt)` on user-facing queries for soft-deleted tables
- Verify resource ownership — `protectedProcedure` must filter by `ctx.session.user.id`
- UUIDs everywhere — never `number` for primary keys
- DRY where it reduces bugs, but type-specific redundancy is OK when abstraction would obscure intent
- Open-closed principle — extend via registration/config, don't edit shared code for new types
- Config-driven over hardcoded — new content types, features, etc. should be addable without touching core logic
- Schema overrides — modules can declare overridable tables; projects extend by dropping a file in `src/schema/overrides/` and running `bun run indigo:sync`

### Plans

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions, if any.

## Troubleshooting

- **Port 3000 already in use:** Kill stale `bun` or `node` process
- **Type errors after schema change:** Run `bun run db:generate` then restart dev server
- **"Cannot find module" after branch switch:** Run `bun install`
- **Migration fails:** Check `DATABASE_URL` in `.env`, ensure PostgreSQL is running. The init script creates the database automatically
- **Tiptap editor not rendering:** Ensure `@tiptap/react` and `@tiptap/starter-kit` are installed. Run `bun install`
