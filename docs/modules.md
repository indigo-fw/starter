# Indigo Modules

## Overview

Indigo uses a modular architecture. The base framework (`src/core/`) provides CMS, auth, orgs, notifications, real-time, storage, and AI infrastructure. Additional features are installable modules under `src/core-*/`.

## Available Modules

| Module | Type | Requires | Description |
|--------|------|----------|-------------|
| `core-payments` | free | — | Payment provider abstraction (Stripe integration) |
| `core-subscriptions` | free | core-payments | Subscription plans, tokens, discounts, dunning |
| `core-payments-crypto` | paid | core-payments | Cryptocurrency payments via NOWPayments |
| `core-support` | paid | — | AI support chat + ticket system with escalation |
| `core-affiliates` | paid | — | Referral tracking, attribution, affiliate management |
| `core-ai-writer` | paid | — | AI content generation, SEO optimization, translation |
| `core-import` | paid | — | Data import and migration tools |
| `core-docs` | free | — | Documentation system with LLM export |
| `core-store` | paid | core-payments | E-commerce — products, cart, checkout, orders, shipping, EU VAT |

## CLI Commands

```bash
# List all modules and their status
bun run indigo list

# Install a module
bun run indigo add core-support

# Remove a module
bun run indigo remove core-support
bun run indigo remove core-support --yes          # skip confirmation
bun run indigo remove core-support --drop-tables   # also generate DROP migration

# Update a module to latest version
bun run indigo update core-support
bun run indigo update --all

# Push module changes to upstream repos (maintainer only)
bun run indigo push core-support
bun run indigo push core              # push the core engine
bun run indigo push --all             # push core + all modules

# Regenerate glue files after manual config edit
bun run indigo sync

# Push starter repo + all subtrees in one command
bun run release
```

## How Modules Work

### For users (cloning the starter)

The starter ships with all modules pre-installed. Just clone, `bun install`, `bun run init`.

To remove a module you don't need:
```bash
bun run indigo remove core-affiliates
```

To pull updates for a module:
```bash
bun run indigo update core-support
```

### For the maintainer (you)

Modules are git subtrees. Each module directory (`src/core-*/`) maps to its own GitHub repo. Your workflow:

1. Work in the starter repo normally — edit files, commit, push
2. When ready to release module updates: `bun run release`
3. This pushes to the starter repo AND all module repos

### How it works under the hood

- `indigo.config.ts` declares installed modules (imports their `module.config.ts`)
- Each module's `module.config.ts` self-describes: routers, schema, jobs, widgets, project files
- `bun run indigo:sync` reads the config and generates glue files in `src/generated/`:
  - `module-routers.ts` — tRPC router assembly (spread into `_app.ts`)
  - `module-schema.ts` — Drizzle schema re-exports
  - `module-server.ts` — `initModuleDeps()` + `startModuleWorkers()`
  - `module-widgets.ts` — layout widget components
  - `module-seeds.ts` — seed functions for `bun run init`

### Dependency injection

Modules don't hard-import project-specific code. Instead, they define a `deps.ts` interface and the project provides implementations via `config/*-deps.ts` files. This keeps modules portable across different Indigo projects.

Framework conventions (`@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`) are imported directly — every Indigo project has them.

### Templates

Each module has a `_templates/` directory containing project-layer files (deps, admin pages, etc.) that are scaffolded during `indigo add`. These are starting points — users can customize them after installation.

## Creating a New Module

1. Create `src/core-mymodule/` with the standard structure:
   ```
   src/core-mymodule/
     schema/          — Drizzle tables
     routers/         — tRPC routers
     lib/             — Service layer
     deps.ts          — Dependency interface (if needed)
     register.ts      — Re-exports everything
     module.config.ts — Self-description
     CLAUDE.md        — AI agent documentation
     _templates/      — Project files scaffolded on install
   ```
2. Add to `indigo.config.ts` and registry (`scripts/indigo/registry.ts`)
3. Run `bun run indigo:sync`
4. Create the GitHub repo and push: `bun run indigo push core-mymodule`
