#!/usr/bin/env bash
# resolve-divergence.sh
# Resolves the local/remote branch divergence on main.
#
# Situation:
#   - Local main has 3 feature commits (CodeMirror, AI Assist, Tailwind) not on remote
#   - Remote main has 7 deployment commits (robots.ts, proxy.ts, logger.ts etc.) not local
#   - Local working tree has uncommitted deployment changes (already on remote)
#
# Strategy: rebase local 3 commits on top of remote, discard redundant working tree changes.
#
# Usage (run from repo root on your machine):
#   bash scripts/resolve-divergence.sh

set -euo pipefail

echo "=== Indigo repo divergence resolver ==="
echo ""

# 1. Sanity checks
if [[ ! -f .git/HEAD ]]; then
  echo "❌ Must be run from the repo root"; exit 1
fi

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "❌ Expected branch 'main', got '$BRANCH'"; exit 1
fi

# 2. Remove stale index lock if present
if [[ -f .git/index.lock ]]; then
  echo "⚠️  Removing stale .git/index.lock ..."
  rm .git/index.lock
  echo "   Removed."
fi

# 3. Stash local working tree changes (deployment files already on remote)
echo "📦 Stashing uncommitted changes ..."
git stash push -m "wip: deployment changes (already on remote — will drop after rebase)" \
  -- src/app/robots.ts src/lib/env.ts src/proxy.ts todos/ \
     .github/workflows/deploy-demo.yml 2>/dev/null || true

# 4. Fetch latest remote
echo ""
echo "🌐 Fetching origin ..."
git fetch origin

# 5. Rebase local 3 commits onto remote main
echo ""
echo "⚙️  Rebasing local commits onto origin/main ..."
if git rebase origin/main; then
  echo "   ✅ Rebase succeeded cleanly"
else
  echo ""
  echo "⚠️  Conflicts detected. Resolve them, then run:"
  echo "     git add <resolved-files>"
  echo "     git rebase --continue"
  echo ""
  echo "   Or abort with: git rebase --abort"
  exit 1
fi

# 6. Drop the stash — those changes are already incorporated from remote
echo ""
echo "🗑️  Dropping stash (changes already merged from remote) ..."
git stash drop 2>/dev/null || true

# 7. Push to remote
echo ""
echo "🚀 Pushing to origin/main ..."
git push origin main

echo ""
echo "✅ Done! Local and remote are now in sync."
echo ""
echo "Next step — apply Cloudflare WAF rules:"
echo "  1. Create an API token at https://dash.cloudflare.com/profile/api-tokens"
echo "     Template: Edit zone DNS → customize → Firewall Services: Edit, Zone Settings: Edit"
echo "     Resource: indigo-fw.dev zone only"
echo "  2. Add it as GitHub secret: Settings → Secrets → CLOUDFLARE_API_TOKEN"
echo "  3. Run workflow: Actions → apply-cloudflare-rules → Run workflow"
