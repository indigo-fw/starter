---
title: Modules
section: Guides
order: 1
description: Install, remove, and manage Indigo modules
---

# Modules

Indigo uses a modular architecture. The core framework provides CMS, auth, organizations, notifications, real-time, storage, and AI infrastructure. Additional features are installable modules.

## Available Modules

| Module | Type | Description |
|--------|------|-------------|
| `core-payments` | free | Payment provider abstraction with Stripe |
| `core-subscriptions` | free | Plans, tokens, discounts, dunning |
| `core-docs` | free | Documentation system with LLM export |
| `core-support` | paid | AI support chat + ticket system |
| `core-affiliates` | paid | Referral tracking and attribution |
| `core-ai-writer` | paid | AI content generation and SEO |
| `core-import` | paid | WordPress/Ghost/CSV import |
| `core-store` | paid | E-commerce with EU VAT support |

## CLI Commands

```bash
# List all modules and their install status
bun run indigo list

# Install a module
bun run indigo add core-support

# Remove a module
bun run indigo remove core-support

# Update a module
bun run indigo update core-support

# Update all modules
bun run indigo update --all

# Regenerate glue files after manual config changes
bun run indigo sync
```

## How It Works

Each module has a `module.config.ts` that self-describes its routers, schema, jobs, widgets, and project files. When you run `bun run indigo:sync`, these are merged into generated glue files in `src/generated/`.

> [!NOTE]
> After installing or removing a module, always run `bun run db:generate` and `bun run db:migrate` to apply schema changes.

## Creating a Module

See the [Module Development](/docs/api/module-development) guide for creating your own modules.
