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
| `core-chat` | paid | — | AI character chat — characters, conversations, messages, providers |

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
  - `module-widgets.ts` — layout widget components (injected into public layout)
  - `module-page-widgets.ts` — dashboard page widgets by slot (e.g. billing page)
  - `module-seeds.ts` — seed functions for `bun run init`
  - `module-nav.ts` — admin sidebar nav items (merged into nav groups)

### Dependency injection

Modules don't hard-import project-specific code. Instead, they define a `deps.ts` interface and the project provides implementations via `config/*-deps.ts` files. This keeps modules portable across different Indigo projects.

Framework conventions (`@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`) are imported directly — every Indigo project has them.

### Templates

Each module has a `_templates/` directory containing project-layer files (deps, admin pages, etc.) that are scaffolded during `indigo add`. These are starting points — users can customize them after installation.

### Cross-module hooks

Modules must never hard-import from other optional modules. Instead, use the runtime hook registry (`src/core/lib/module-hooks.ts`):

```ts
// In your deps file (runs at server startup):
import { registerHook } from '@/core/lib/module-hooks';
registerHook('payment.conversion', async (userId, refId, amount) => { ... });

// In consuming code (webhooks, routers, etc.):
import { runHook } from '@/core/lib/module-hooks';
await runHook('payment.conversion', userId, subscriptionId, amountCents);
// No-ops if no handler registered (module not installed)
```

Current hooks: `payment.conversion` (core-affiliates), `attribution.capture` (core-affiliates).

## Creating a New Module

1. Create `src/core-mymodule/` with the standard structure:
   ```
   src/core-mymodule/
     schema/          — Drizzle tables
     routers/         — tRPC routers
     lib/             — Service layer
     components/      — React components (optional)
     deps.ts          — Dependency interface (if needed)
     register.ts      — Re-exports everything
     module.config.ts — Self-description
     CLAUDE.md        — AI agent documentation
     _templates/      — Project files scaffolded on install
   ```
2. Write `module.config.ts` — declare routers, schema, serverInit, jobs, layoutWidgets, pageWidgets, seed, navItems, projectFiles
3. Add to `indigo.config.ts` and registry (`scripts/indigo/registry.ts`)
4. Run `bun run indigo:sync`
5. Create the GitHub repo and push: `bun run indigo push core-mymodule`

## Git Subtree Operations (Maintainer Guide)

Modules are git subtrees — each `src/core-*/` maps to its own GitHub repo under `indigo-fw/`.

### Push a new module to GitHub for the first time

```bash
# 1. Create the repo on GitHub (github.com/indigo-fw/core-mymodule)
# 2. Add it to the registry (scripts/indigo/registry.ts)
# 3. Push:
bun run indigo push core-mymodule
```

This extracts the commit history for `src/core-mymodule/` and pushes it as `main` to the remote repo. First push can be slow on large repos.

### Push all changes (release workflow)

```bash
bun run release
# equivalent to: git push && bun run indigo push --all
```

This pushes the starter repo, then pushes core + every installed module to their upstream repos.

### Pull updates from a module repo

```bash
bun run indigo update core-mymodule    # single module
bun run indigo update --all            # all modules
```

Wraps `git subtree pull --squash`. Auto-stashes uncommitted changes, runs sync + migrations after.

### Pull core engine updates

```bash
bun run core:pull
# or manually:
git subtree pull --prefix=src/core git@github.com:indigo-fw/core.git main --squash
```

### Push core engine changes

```bash
bun run indigo push core
# or: bun run core:push
```

### Add a module from someone else's repo

If a third-party module is available:
```bash
# Add to registry with their repo URL, then:
bun run indigo add core-theirmodule
```

### Common issues

- **Push is slow:** `git subtree push` rewrites history. Normal for first push or large repos.
- **"Working tree has modifications":** The CLI auto-stashes, but if that fails, commit or stash manually first.
- **Merge conflicts on pull:** Resolve normally, then `git add . && git commit`.
- **"Updates were rejected":** Someone else pushed to the module repo. Pull first: `bun run indigo update core-mymodule`
