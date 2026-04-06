# Indigo Module CLI — Remaining Work

## 1. Create GitHub Repos

Create these repos under `indigo-fw` org and push initial content from `src/` directories:

```bash
# For each module:
git subtree push --prefix=src/core-billing git@github.com:indigo-fw/core-billing.git main
git subtree push --prefix=src/core-billing-crypto git@github.com:indigo-fw/core-billing-crypto.git main
git subtree push --prefix=src/core-support git@github.com:indigo-fw/core-support.git main
git subtree push --prefix=src/core-affiliates git@github.com:indigo-fw/core-affiliates.git main
```

Once repos exist, `bun run indigo add <module>` will work for fresh installations.

## 2. Access Control for Paid Modules

Paid module repos (`core-support`, `core-affiliates`, `core-billing-crypto`) need gated access:

- **Simple (start here):** Private GitHub repos + manual collaborator invites after purchase
- **Automated:** Stripe webhook → GitHub API to grant/revoke repo access
- **Services:** Polar.sh or Keygen.sh handle license → repo access mapping

## 3. Cross-Module References in Project Code

These project-layer files reference modules directly and will break if the module is removed:

**Webhook routes reference multiple modules:**
- `src/app/api/webhooks/stripe/route.ts` — imports from core-billing AND core-affiliates (`recordConversion`)
- `src/app/api/webhooks/nowpayments/route.ts` — same

**Fix:** Make `recordConversion` optional via a registry. Billing webhook checks if affiliates registered a conversion handler. No affiliates = no conversion tracking. No import error.

**Auth router references affiliates:**
- `src/server/routers/auth.ts` line ~201 — dynamic import of `captureAttribution` from core-affiliates

**Fix:** Move the `captureAttribution` call behind a registry check or optional dynamic import with try/catch.

**Seed script references affiliates:**
- `src/scripts/seed/billing.ts` — imports affiliate schema for seed data

**Fix:** Split seed into per-module seed files. Each module's `_templates/` includes its seed. The main seed script discovers and runs them.

**Admin nav references module sections:**
- Sidebar links to `/dashboard/settings/support`, `/dashboard/settings/affiliates`, etc.

**Fix:** Modules register their nav items via the existing admin-nav registry. No module = no nav item.

## 4. `indigo add` Improvements

Current limitations to address:

- **Uncommitted changes:** `git subtree add` fails if working tree is dirty. The CLI should stash changes, add subtree, then pop stash.
- **Update command:** Need `bun run indigo update <module>` that wraps `git subtree pull`.
- **Offline/local mode:** For development without GitHub repos, support adding from a local directory path instead of git URL.

## 5. `indigo remove` Improvements

- **Empty directory cleanup:** After removing scaffolded files, parent directories may be empty. The CLI should prune empty dirs.
- **Database tables:** Currently warns "tables still exist." Could offer `bun run indigo remove --drop-tables` that generates a DROP migration.
- **Confirmation prompt:** `remove` should require `--yes` flag or interactive confirmation before deleting.

## 6. Module Template Versioning

When a module updates (subtree pull), its `_templates/` may have changed. The CLI should:
1. Detect template changes between old and new version
2. Show a diff of what changed
3. Let the user decide whether to update their project files or keep customizations

This is a v2 feature — not needed for launch.
