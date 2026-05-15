#!/usr/bin/env bash
# resolve-divergence.sh
# Resolves the local/remote branch divergence on main.
#
# Situation:
#   - Local main has 3 feature commits (CodeMirror, AI Assist, Tailwind) not on remote
#   - Remote main has deployment commits (robots.ts, proxy.ts, logger.ts, CF workflow) not local
#   - Local working tree has uncommitted deployment changes (already on remote)
#
# Strategy: rebase local feature commits on top of remote, drop redundant working tree changes.
#
# Usage (run from repo root on your machine):
#   bash scripts/resolve-divergence.sh

set -euo pipefail

echo "=== Indigo repo divergence resolver ==="
echo ""

# 1. Sanity checks
if [[ ! -f .git/HEAD ]]; then
  echo "ERR: Must be run from the repo root"; exit 1
fi

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "ERR: Expected branch 'main', got '$BRANCH'"; exit 1
fi

# 2. Remove stale index lock if present
if [[ -f .git/index.lock ]]; then
  echo "Removing stale .git/index.lock ..."
  rm .git/index.lock
fi

# 3. Stash local working tree changes (already committed on remote via web editor)
echo "Stashing uncommitted changes ..."
git stash push -m "wip: deployment files already on remote" || true

# 4. Fetch latest remote
echo "Fetching origin ..."
git fetch origin

# 5. Rebase local commits onto remote main
echo "Rebasing local commits onto origin/main ..."
if git rebase origin/main; then
  echo "Rebase succeeded"
else
  echo ""
  echo "Conflicts detected. Resolve them, then:"
  echo "  git add <resolved-files> && git rebase --continue"
  echo "  OR: git rebase --abort"
  exit 1
fi

# 6. Drop the stash — those changes are incorporated from remote
git stash drop 2>/dev/null || true

# 7. Push to remote
echo "Pushing to origin/main ..."
git push origin main

echo ""
echo "Done! Local and remote are now in sync."
echo ""
echo "Next: Apply Cloudflare WAF rules"
echo "  1. Create API token: https://dash.cloudflare.com/profile/api-tokens"
echo "     Permissions: Firewall Services: Edit, Zone Settings: Edit"
echo "     Resource: indigo-fw.dev zone only"
echo "  2. Add secret to GitHub: Settings > Secrets > CLOUDFLARE_API_TOKEN"
echo "  3. Run: Actions > apply-cloudflare-rules > Run workflow"
