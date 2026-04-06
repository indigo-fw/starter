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

Fixed: module-specific nav items, webhook imports, and billing page references now handle missing modules gracefully.

**What was done:**
- Added `navItems` field to `ModuleConfig` — modules declare their admin nav items
- Sync script generates `src/generated/module-nav.ts`
- `admin-nav.ts` merges module nav items dynamically (empty groups auto-hidden)
- NOWPayments webhook: `recordConversion` import converted to dynamic import with `.catch()`
- Billing page: `AffiliateOverview` converted to `React.lazy` with catch fallback
- Auth router: already had dynamic import with try/catch (no change needed)
- Stripe webhook: already had dynamic import with `.catch()` (no change needed)

## 4. `indigo add` Improvements ✅

- **Uncommitted changes:** CLI now stashes changes before `git subtree add`, pops after
- **Update command:** `bun run indigo update <module>` wraps `git subtree pull --squash`
- **Offline/local mode:** Already supported — if `src/<module>` exists, subtree pull is skipped

## 5. `indigo remove` Improvements ✅

- **Empty directory cleanup:** After removing scaffolded files, empty parent dirs are pruned
- **Database tables:** `bun run indigo remove --drop-tables` generates a DROP migration from module schema
- **Confirmation prompt:** `remove` now requires interactive confirmation (skip with `--yes`)

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
- Fixed dependencies: `core-payments-crypto` and `core-store` now depend on `core-payments` (not `core-billing`)
