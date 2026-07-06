# CLAUDE.md

Indigo — agent-native T3 SaaS framework with integrated CMS. Next.js 16 (App Router) + tRPC + Drizzle (PostgreSQL, UUID PKs) + Better Auth, run with `bun`. Optional features are modules: `bun run indigo add|remove <id>`.

Work as a loop: extend via config/modules (never shared core) → typecheck + tests + `indigo doctor` → verify through MCP as a seeded persona → feed failures into the next pass until green.

## Orient — ask the code, not this file

| Need | Source |
| --- | --- |
| First-time setup | `README.md` (agent path + by hand) · `src/scripts/init.ts` header for flags |
| All commands | `bun run` (bare) · `bun run indigo` (CLI usage) · scripts print usage on bad args |
| Modules installed/available | `bun run indigo list` |
| Any tRPC procedure | MCP `search_tools` → `describe_tool` · offline: `src/generated/procedure-docs.ts` |
| REST API | `/api/v1/openapi` |
| Architecture / datamodel / workers / startup | `bun run indigo visualize --mermaid` → `.indigo/*.mmd` |
| Map of any folder or module | `bun run indigo map <dir\|module>` |
| Health, env, generated-file state | `bun run indigo doctor` |
| Core helpers (don't reinvent) | barrels: `src/core/crud/index.ts`, `src/core/lib/**` |
| A module's surface & rules | `src/core-X/module.config.ts` + its `CLAUDE.md` |
| Folder rules & feature docs | nearest `CLAUDE.md` (`src/app`, `src/server`, `src/config`, `src/core`, `content`, `locales`, each module) |
| Hard constraints at code sites | file headers — e.g. `src/instrumentation.ts`, `src/core/lib/content/cms-link.ts`, `server.ts` |
| Operate the running app / test as a user | `/llms.txt` · `bun run indigo personas` · docs → Guides → AI Agents & MCP (`.mcp.json` wires Claude Code automatically) |
| i18n routing/fallback | `src/app/CLAUDE.md` · translation pipeline: `locales/CLAUDE.md` |

Only invariants live in CLAUDE.md files; enumerable facts are fetched live from the sources above. Feature specifics belong to the owning folder's CLAUDE.md.

## Iron rules

- No `any` — use `unknown` and narrow, or generics/interfaces
- `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`
- No plain `Error` in server code — always `TRPCError` with proper code
- Constrain Zod inputs — `.max()` on strings, `.uuid()` on IDs, `.max(N)` on arrays
- Safety `limit` on all `.findMany()` / `.select()` queries
- `isNull(deletedAt)` on user-facing queries for soft-deleted tables
- Verify resource ownership — `protectedProcedure` must filter by `ctx.session.user.id`
- UUIDs everywhere — never `number` for primary keys
- DRY where it reduces bugs; type-specific redundancy is OK when abstraction would obscure intent
- Comments explain *why*, never *what* — step narration belongs in function names; CLI usage in `--help`
- Open-closed — extend via registration/config, never edit shared code for new types
- Schema overrides: drop a file in `src/schema/overrides/` + `bun run indigo:sync`
- Tests: `bunx vitest run`; use `asMock(fn)` from `@/test-utils`, not `vi.mocked()`
- `db:generate` needs a real TTY (drizzle rename prompts); commit `drizzle/NNNN_*.sql` **and** `drizzle/meta/`
- MCP: `.meta({ mcp: { description } })` promotes a procedure to `tools/list`; `.meta({ mcp: false })` hides it; JSDoc becomes searchable on `indigo:sync`

### Plans

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- End each plan with unresolved questions, if any.

## Parallel work (git worktrees)

Each running instance needs its **own `PORT` and its own database** (suffix the DB with the port, e.g. `myapp_3001`; own Redis DB index if `REDIS_URL` is set) — the server syncs `content/` into the DB at boot and runs workers, so shared state corrupts. Worktrees live as **siblings** of the repo (`git worktree add ../my-app-wt1`), then `bun install`, copy + edit `.env`, `bun run init`. Use one when tasks run in parallel or need their own server/DB; a plain branch is enough otherwise.

## Troubleshooting

- **Port already in use:** kill stale `bun`/`node` processes
- **Type errors after schema change:** `bun run db:generate`, restart dev server
- **"Cannot find module" after branch switch:** `bun install`
- **Migration fails:** check `DATABASE_URL` in `.env`, ensure PostgreSQL runs (init creates the DB itself)
- **Tiptap editor not rendering:** `bun install` (`@tiptap/react` + `@tiptap/starter-kit`)

## Project notes

<!-- Add your project-specific context here: custom modules, domain decisions, team conventions, etc. -->
