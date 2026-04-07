# Indigo

**The complete SaaS framework for Next.js** — CMS, billing, auth, real-time, AI chat, and modular architecture out of the box.

Clone, install modules, ship. Designed for professionals who know what they're building.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Findigo-fw%2Fstarter&env=DATABASE_URL,REDIS_URL&envDescription=PostgreSQL%20and%20Redis%20connection%20strings&project-name=my-indigo-app)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/indigo?referralCode=indigo)

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

| Module | Status | Description |
|--------|--------|-------------|
| `core-billing` | Free | Stripe subscriptions, tokens, discounts, dunning |
| `core-billing-crypto` | Paid | NOWPayments crypto provider |
| `core-support` | Paid | AI support chat + ticket system + live agent |
| `core-affiliates` | Paid | Referral tracking, attribution, commissions |
| `core-ai-writer` | Paid | AI content generation, SEO, translation |
| `core-import` | Paid | WordPress/Ghost/CSV migration tools |
| `core-docs` | Free | Documentation system (CMS + MDX, LLM export) |
| `core-store` | Paid | E-commerce (products, cart, checkout, orders, EU VAT) |

Modules are self-contained git subtrees. Install with `bun run indigo add <module>`, remove with `bun run indigo remove <module>`. Each module brings its own routers, schema, seeds, and admin pages.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- PostgreSQL + Redis (or `docker compose up -d`)

### Setup

```bash
git clone https://github.com/indigo-fw/starter.git my-app
cd my-app
bun install
cp .env.example .env    # edit DATABASE_URL if needed
bun run init            # creates DB, runs migrations, seeds demo data
bun run dev             # http://localhost:3000
```

The init script is interactive — it asks what to seed. For non-interactive setup:

```bash
# Auto-accept all prompts (CI, Docker, demo deployments)
bun run init -- -y

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
```

Each module declares its integration in `module.config.ts`:
- **Routers** — auto-registered in tRPC
- **Schema** — auto-exported for Drizzle
- **Server init** — dependency injection at startup
- **Jobs** — background workers
- **Seeds** — demo data for `bun run init`
- **Layout widgets** — components injected into public layout

All wiring is auto-generated in `src/generated/` by `bun run indigo:sync`.

## Architecture

```
src/
  core/                 Base framework (git subtree from indigo-fw/core)
  core-billing/         Free module: payments
  core-support/         Paid module: support chat
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
// src/config/payments-deps.ts
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
| `bun run indigo <cmd>` | Module CLI (add, remove, list, sync) |
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

## Agent-Driven Development

Indigo is designed for AI coding agents. Comprehensive `CLAUDE.md` files at every level (root, core, modules, server, config, app) enable agents to understand and extend the codebase autonomously.

## License

Dual-licensed:

- **Open Source:** [AGPL-3.0](LICENSE) — free for open-source use
- **Commercial:** [Commercial License](COMMERCIAL-LICENSE.md) — for proprietary use. [Contact us](mailto:peter@visual.sk)

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor license agreement details.
