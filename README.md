# Indigo

**Describe what you want. Your agent ships it — and proves it's done.** Indigo is the open-source Next.js foundation for agent-built projects — a website, a blog, a shop, a full SaaS. Not a website builder, not a template: real, typed code you own. Point your coding agent at it — Claude Code, Codex, Gemini — and it shapes one pre-wired foundation to your description (auth, billing, CMS, i18n, real-time and a modular architecture come ready; the agent trims the modules you don't need and adds the ones you ask for), then loops until it's verifiably done. On Indigo, "done" isn't the agent's opinion — it's checks going green and seeded personas completing the journeys.

**[Live demo](https://demo.indigo-fw.dev)** · [Website](https://indigo-fw.dev) · [Docs](https://indigo-fw.dev/docs) · [Feature catalog](https://indigo-fw.dev/features)

![The Indigo loop, mid-flight — the agent builds, typecheck catches the miss, the fix lands, the test suite and health checks go green. Terminal output verbatim from real runs.](https://indigo-fw.dev/loop.gif)

**The loop, in four beats:**

1. **Describe** — say what the product should be, in plain language; the agent asks when a decision is yours.
2. **Build** — the agent orients from nested `CLAUDE.md` maps and `indigo visualize`, then extends through config and modules — never by editing shared core.
3. **Verify** — typecheck, tests and `indigo doctor` grade the pass; then the agent logs in through MCP as a seeded persona and uses the feature like a customer would.
4. **Improve** — failures feed the next pass automatically. Green means done — or the next thing you describe.

This is what makes goal-driven runs — `/loop`-style: describe the end state once, let the agent work until it's true — practical instead of reckless. Nothing blocks the loop: setup, installs, migrations and checks all run through non-interactive CLIs, and the agent asks its questions in chat. Because "done" is machine-checkable here, the cycle can even run on a schedule — see the [Improvement Loop guide](https://indigo-fw.dev/docs/guides/improvement-loop).

Every pass is covered: the agent gets a map (nested `CLAUDE.md`s, `indigo visualize`), a feedback signal (strict types, tests, `indigo doctor`) and hands on the app itself (an MCP endpoint that turns every tRPC procedure into a typed tool, plus seeded personas to use the app as a free, pro or admin user). Each iteration stays small — pointer-first docs and generated maps mean the agent orients from a map instead of re-reading the codebase every pass. You describe, review and decide; the code stays typed, tested and yours.

[![Watch Indigo build, restyle and translate a real product in about 80 seconds](https://indigo-fw.dev/story-poster.png)](https://indigo-fw.dev/#watch)

*[Watch the 80-second story](https://indigo-fw.dev/#watch) — one real install, reshaped live on request: recolour, gradient hero, dark mode, and a full translation pass.*

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Findigo-fw%2Fstarter&env=DATABASE_URL,REDIS_URL&envDescription=PostgreSQL%20and%20Redis%20connection%20strings&project-name=my-indigo-app)

> Vercel's serverless runtime doesn't run the custom server — real-time WebSocket features degrade gracefully (background jobs fall back to the DB queue). For full features, use the Docker/VPS path in the [deployment guide](https://indigo-fw.dev/docs/guides/deployment).

## What's Included

### Core (free, always present)

- **Next.js 16** App Router + React 19 + Turbopack
- **CMS** — config-driven content types, revision history, media library, shortcodes, SEO, sitemap, RSS
- **Auth** — Better Auth with RBAC (4 roles), organizations, social login
- **Real-time** — WebSocket via `ws` + Redis pub/sub
- **Background jobs** — BullMQ (Redis) or DB queue fallback
- **i18n** — multi-locale with proxy-rewrite routing
- **Admin panel** — full dashboard with content calendar, audit log, form builder, custom fields
- **tRPC** — end-to-end type-safe API
- **Drizzle ORM** — PostgreSQL, UUID primary keys
- **Tailwind CSS v4** — OKLCH design tokens
- **REST API v1** — OpenAPI 3.1 spec at `/api/v1/openapi`

### Modules

Modules are split into **primitives** (horizontal building blocks) and **products** (vertical domain apps).

#### Primitives

| Module | Status | Description |
|--------|--------|-------------|
| `core-payments` | Free | Payment provider abstraction (Stripe) |
| `core-subscriptions` | Free | Plans, tokens, discounts, dunning |
| `core-payments-crypto` | Free | NOWPayments crypto provider |
| `core-docs` | Free | Documentation system (CMS + MDX, LLM export) |
| `core-comments` | Free | Polymorphic threaded comments with moderation |
| `core-activity` | Free | User-facing activity feed and timeline |
| `core-brand` | Free | Brand asset generation — favicons, OG images, web manifest |
| `core-support` | Free | AI support chat + ticket system + live agent |
| `core-affiliates` | Free | Referral tracking, attribution, commissions |
| `core-ai-writer` | Paid | AI content generation, SEO, translation |
| `core-import` | Free | WordPress/Ghost/CSV migration tools |
| `core-authors` | Free | Multi-author profiles and bylines |
| `core-multisite` | Free | Multi-tenant site isolation, domain mapping |
| `core-api` | Free | Org-scoped REST API v2 with key management |

#### Products

| Module | Status | Description |
|--------|--------|-------------|
| `core-store` | Paid | E-commerce (products, cart, checkout, orders, EU VAT) |
| `core-chat` | Paid | AI character chat — characters, conversations, providers |
| `core-booking` | Free | Booking and appointment scheduling |

Modules are self-contained git subtrees. Install with `bun run indigo add <module>`, remove with `bun run indigo remove <module>`. Each module brings its own routers, schema, seeds, and admin pages.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- PostgreSQL + Redis (or `docker compose up -d`)
- [ffmpeg](https://ffmpeg.org) — only if you use `core-chat`'s video features (media optimization + seeding)

Missing something? Your agent handles it: `bun run init` detects what's unreachable and prints the exact fix for your OS — the agent relays the options and asks before installing anything.

### Setup with an agent (recommended)

Run this from wherever you keep your projects — the agent creates the folder, reads this README, installs everything, and asks *you* the setup questions in chat; nothing ever blocks on a terminal prompt:

```bash
claude "Set up a new project named my-app from https://github.com/indigo-fw/starter — ask me what you need"
```

The same one-liner works with other agents:

```bash
codex "Set up a new project named my-app from https://github.com/indigo-fw/starter — ask me what you need"
gemini "Set up a new project named my-app from https://github.com/indigo-fw/starter — ask me what you need"
```

When it finishes, open your next agent session **inside `my-app`** — the project's `CLAUDE.md`, `.mcp.json` and skills load automatically from there.

No terminal at all? The **Claude Code desktop app** works the same way: new session → choose an empty folder → "Set up a new project here from https://github.com/indigo-fw/starter — ask me what you need".

Already have the files? Open your agent in the folder and type `/setup`.

#### Instructions for agents

If you are a coding agent installing this starter, follow these steps:

1. Verify prerequisites: Bun v1.1+, PostgreSQL + Redis reachable. If they aren't: with Docker present, offer `docker compose up -d`; without Docker, present the options in chat (install Docker: `winget install Docker.DockerDesktop` / `brew install --cask docker` / distro guide — or use an existing PostgreSQL via `DATABASE_URL`) and **ask before installing anything**. When `bun run init` can't connect it prints an environment-diagnostics block with these exact options — relay it.
2. `bunx degit indigo-fw/starter <folder>` — degit creates the folder and copies files only, no git history. (Use `.` if the user already started you inside an empty project folder.) If degit fails, fall back to `bunx tiged indigo-fw/starter <folder>`, or `git clone --depth=1 https://github.com/indigo-fw/starter <folder>` followed by deleting `<folder>/.git`. Run everything below inside that folder.
3. `bun install`, then read `.claude/skills/setup/SKILL.md` and follow it: gather the user's choices **in chat** (modules to keep, site name, admin email, demo content or clean start).
4. Run init non-interactively — never without `-y`, the interactive prompts will block you:
   `bun run init -- -y --modules <ids|all|recommended> --admin-email <email>`
5. Verify with `bun run indigo doctor`, start `bun run dev`, and report the URL plus the generated admin password back to the user — and remind them to open future agent sessions inside the project folder.

### Set up by hand

No agent required — the classic path, fully supported.

```bash
bunx degit indigo-fw/starter my-app
cd my-app
bun install
cp .env.example .env    # edit DATABASE_URL if needed
bun run init            # git init + creates DB, runs migrations, seeds demo data
bun run dev             # http://localhost:3000
```

`bun run init` initializes a **fresh git repository** for you (so the project is yours from commit 1, and `bun run indigo add` can subtree-pull modules) and offers to set your own `origin`. It's interactive — it also asks what to seed. For non-interactive setup (agents, CI, Docker):

```bash
# Auto-accept all prompts (CI, Docker, demo deployments)
bun run init -- -y

# Answer the questions via flags instead of prompts
bun run init -- -y --modules core-payments,core-subscriptions --admin-email you@example.com

# Force reset + re-seed (demo server cron)
bun run init -- -y --reset
```

**Admin panel:** [localhost:3000/dashboard](http://localhost:3000/dashboard)

### Environment variables for auto mode

| Variable | Default | Description |
|----------|---------|-------------|
| `INIT_ADMIN_NAME` | Admin | Superadmin display name |
| `INIT_ADMIN_EMAIL` | admin@example.com | Superadmin email |
| `INIT_ADMIN_PASSWORD` | demo1234 | Superadmin password |

## Module System

Modules are managed via the Indigo CLI:

```bash
bun run indigo list              # show installed + available modules
bun run indigo add core-support  # install module (subtree + scaffold + migrate)
bun run indigo remove core-support  # remove module
bun run indigo sync              # regenerate glue files after manual config edits
bun run indigo doctor            # validate project health
bun run indigo visualize         # interactive architecture diagram in browser
bun run indigo visualize --mermaid   # export raw .mmd Mermaid files
bun run indigo visualize --imports   # dep-cruiser reports + boundary violations
```

Each module declares its integration in `module.config.ts`:
- **Routers** — auto-registered in tRPC
- **Schema** — auto-exported for Drizzle
- **Server init** — dependency injection at startup
- **Jobs** — background workers
- **Seeds** — demo data for `bun run init`
- **Layout widgets** — components injected into public layout

All wiring is auto-generated in `src/generated/` by `bun run indigo:sync`.

## Visualization

Generate architecture diagrams directly from your module configs — always in sync with code.

```bash
bun run indigo visualize              # interactive HTML (modules, data model, routers, workers)
bun run indigo visualize --mermaid    # raw .mmd files for docs, GitHub, AI context
bun run indigo visualize --imports    # dependency-cruiser per module + boundary violations
bun run indigo visualize --imports core-chat  # single module deep dive
```

| Mode | Output | What it shows |
|------|--------|---------------|
| (default) | `.indigo/architecture.html` | Module deps, ER diagram (real FKs), routers, workers, startup, module details |
| `--mermaid` | `.indigo/*.mmd` | Raw Mermaid files — paste into mermaid.live, GitHub, or feed to AI agents |
| `--imports` | `.indigo/imports/` | Per-module import graphs (dep-cruiser) + cross-module boundary violation scan |

The visualizer reads `indigo.config.ts`, every `module.config.ts`, the registry, and actual Drizzle schema files. Nothing is hardcoded — add a module and it appears in the next run.

## Architecture

```
src/
  core/                 Base framework (git subtree from indigo-fw/core)
  core-payments/        Free module: payments
  core-comments/        Free module: threaded comments
  core-activity/        Free module: activity feed
  core-store/           Paid module: e-commerce
  core-*/               Other modules...
  generated/            Auto-generated glue (DO NOT EDIT)
  config/               Project customization (plans, routes, deps)
  server/               DB schema, tRPC routers, jobs
  app/                  Next.js pages (public, dashboard, API)
  components/           Project-specific UI
```

### Module Dependency Injection

Modules don't hardcode project-specific behavior. Each module defines a `deps.ts` interface, and the project provides implementations at startup:

```typescript
// src/config/deps/payments-deps.ts
setPaymentsDeps({
  getPlans: () => plans,
  resolveOrgId: (activeOrgId, userId) => resolveOrgId(activeOrgId, userId),
  sendOrgNotification: (orgId, params) => sendOrgNotification(orgId, params),
});
```

### Content Types

Registered in `src/config/cms.ts`. Add new types by extending the array — no core code changes.

| Type | URL Pattern | Admin Path |
|------|-------------|------------|
| Page | `/{slug}` | `/dashboard/cms/pages` |
| Blog | `/blog/{slug}` | `/dashboard/cms/blog` |
| Portfolio | `/portfolio/{slug}` | `/dashboard/cms/portfolio` |
| Category | `/category/{slug}` | `/dashboard/cms/categories` |
| Tag | `/tag/{slug}` | `/dashboard/cms/tags` |

### Roles & Permissions

| Role | Dashboard | Content | Media | Users | Settings | Billing |
|------|-----------|---------|-------|-------|----------|---------|
| user | — | — | — | — | — | — |
| editor | yes | yes | yes | — | — | — |
| admin | yes | yes | yes | yes | yes | yes |
| superadmin | yes | yes | yes | yes | yes | yes |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Dev server (Turbopack + BullMQ + WebSocket) |
| `bun run build` | Production build |
| `bun run start` | Production server |
| `bun run init` | Initialize DB + seed (`-y` auto, `--reset` force, `--no-seed` skip seeding) |
| `bun run indigo <cmd>` | Module CLI (add, remove, list, sync, visualize, doctor) |
| `bun run promote <email>` | Promote user to superadmin |
| `bun run typecheck` | TypeScript type check |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Drizzle Studio |

## Production

### SERVER_ROLE

Scale with the same Docker image:

| Role | Next.js | tRPC | BullMQ | WebSocket |
|------|---------|------|--------|-----------|
| `all` (default) | yes | yes | yes | yes |
| `frontend` | yes | — | — | — |
| `api` | yes | yes | — | yes |
| `worker` | — | — | yes | — |

### Demo Deployment

Run a live demo that resets automatically:

```bash
# Cron every 60 minutes
bun run init -- -y --reset
```

Set `INIT_ADMIN_EMAIL` and `INIT_ADMIN_PASSWORD` in env for the demo login credentials.

## License

**Open core.** The framework and its free modules are open source under the
permissive **[Apache License 2.0](LICENSE)** — use them for anything, including
closed-source commercial SaaS, with no copyleft obligation and nothing to buy.

Three premium vertical modules — `core-store` (e-commerce), `core-chat` (AI
character chat) and `core-ai-writer` (AI content generation) — are sold under a
**[commercial license](COMMERCIAL-LICENSE.md)** and fund continued development
of the free core. [Contact us](mailto:info@indigo-fw.dev) for a quote.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor license agreement details.
