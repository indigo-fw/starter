# Indigo Module CLI — Remaining Work

## 1. Create GitHub Repos ✅

All repos created under `indigo-fw` org:
- core, starter (public)
- core-docs, core-payments (public)
- core-import, core-store, core-ai-writer, core-affiliates, core-support, core-payments-crypto, core-subscriptions (private)

## 2. Access Control for Paid Modules

Paid module repos (`core-support`, `core-affiliates`, `core-payments-crypto`, `core-store`, `core-ai-writer`, `core-import`) need gated access:

- **Simple (start here):** Private GitHub repos + manual collaborator invites after purchase
- **Automated:** Stripe webhook → GitHub API to grant/revoke repo access
- **Services:** Polar.sh or Keygen.sh handle license → repo access mapping

## 3. Cross-Module References in Project Code ✅

All cross-module imports eliminated. Modules communicate via two mechanisms:

**Runtime hooks** (`src/core/lib/module-hooks.ts`):
- Modules register handlers during serverInit (e.g., `registerHook('payment.conversion', recordConversion)`)
- Consuming code calls `runHook('payment.conversion', ...)` — no direct import needed
- core-affiliates registers: `payment.conversion`, `attribution.capture`
- Used by: Stripe webhook, NOWPayments webhook, auth router

**Generated page widgets** (`src/generated/module-page-widgets.ts`):
- Modules declare `pageWidgets` in module.config.ts with slot + component ref
- Sync generates a registry keyed by slot name
- Pages render from registry: `PAGE_WIDGETS.billing?.map(Widget => <Widget />)`
- core-affiliates registers: AffiliateOverview in `billing` slot

**Admin nav** (`src/generated/module-nav.ts`):
- Modules declare `navItems` in module.config.ts (groupId, name, href, icon)
- Sync generates nav item list; `admin-nav.ts` merges into nav groups
- Empty groups auto-hidden (no billing section if no billing modules)

## 4. `indigo add` Improvements ✅

- **Uncommitted changes:** CLI stashes changes before `git subtree add`, pops after (safe recovery on pop failure)
- **Update command:** `bun run indigo update <module>` wraps `git subtree pull --squash`
- **Offline/local mode:** Already supported — if `src/<module>` exists, subtree pull is skipped

## 5. `indigo remove` Improvements ✅

- **Empty directory cleanup:** After removing scaffolded files, empty parent dirs are pruned
- **Database tables:** `bun run indigo remove --drop-tables` generates a DROP migration from module schema
- **Confirmation prompt:** `remove` requires interactive confirmation (skip with `--yes`)

## 6. Module Template Versioning

When a module updates (subtree pull), its `_templates/` may have changed. The CLI should:
1. Detect template changes between old and new version
2. Show a diff of what changed
3. Let the user decide whether to update their project files or keep customizations

This is a v2 feature — not needed for launch.

## 7. Registry Alignment ✅

Fixed registry to match actual GitHub repos:
- Removed non-existent `core-billing` entry
- Added `core-payments`, `core-subscriptions`, `core-import` entries
- Fixed dependencies: `core-payments-crypto` and `core-store` now depend on `core-payments`

## 8. ModuleConfig Extensions ✅

New fields added to `ModuleConfig`:
- `pageWidgets: PageWidgetEntry[]` — components injected into specific dashboard pages by slot
- `navItems: NavItemEntry[]` — admin nav items (groupId, name, href, icon)
