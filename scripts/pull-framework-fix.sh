#!/usr/bin/env bash
# Cherry-pick framework-level fixes from the Indigo starter into a downstream app.
#
# Usage (run inside YOUR app, not the starter):
#   scripts/pull-framework-fix.sh <commit-sha> [<commit-sha> ...]
#
# Env:
#   INDIGO_STARTER  remote URL or local path of the starter
#                   (default: https://github.com/indigo-fw/starter.git)
#
# Why this exists: an app generated with `bunx degit indigo-fw/starter` (the
# recommended path) has no shared git history with the starter, so there's no
# `git pull`/`git merge` route for the occasional starter-level bug fix
# (something outside `src/core/`, which has its own `git subtree pull`). This
# wires the starter as a throwaway remote, cherry-picks the named commits, and
# removes the remote again. Conflicts stop you mid-way as usual — resolve, then
# `git cherry-pick --continue`.
#
# Only use this for *framework* fixes (root config, scripts/, src/scripts/,
# .gitattributes, etc.). Don't try to pull starter feature commits — your app
# has diverged and they will conflict with everything.

set -euo pipefail

STARTER="${INDIGO_STARTER:-https://github.com/indigo-fw/starter.git}"
REMOTE_NAME="indigo-starter-tmp"

if [ "$#" -lt 1 ]; then
  echo "usage: scripts/pull-framework-fix.sh <commit-sha> [<commit-sha> ...]" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ working tree is dirty — commit or stash first." >&2
  exit 1
fi

cleanup() { git remote remove "$REMOTE_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ adding temp remote $REMOTE_NAME → $STARTER"
git remote add "$REMOTE_NAME" "$STARTER"
git fetch "$REMOTE_NAME"

echo "→ cherry-picking: $*"
if ! git cherry-pick "$@"; then
  echo >&2
  echo "✗ cherry-pick stopped (conflict or empty commit). The temp remote was removed," >&2
  echo "  but the cherry-pick is mid-state. Either:" >&2
  echo "    • resolve the conflict, 'git add <files>', then 'git cherry-pick --continue'" >&2
  echo "    • or bail out entirely:  'git cherry-pick --abort'" >&2
  exit 1
fi

echo "✓ done. Temp remote removed. New commits:"
git log --oneline -"$#"
