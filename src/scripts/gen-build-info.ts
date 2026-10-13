/**
 * Writes `build-info.json` at the repo root — deploy/build metadata read at
 * runtime by `/api/health` (`build` field). Run it in CI in the git checkout
 * BEFORE `docker build`, because the container image has no `.git`.
 * Idempotent and safe to run locally.
 *
 *   bun run build-info
 *
 * `branch` prefers a CI-provided env var because CI checkouts are usually a
 * detached HEAD (where `git rev-parse --abbrev-ref HEAD` just says "HEAD").
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function git(args: string): string {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const info = {
  deployedAt: new Date().toISOString(),
  commit: git('rev-parse HEAD'),
  commitShort: git('rev-parse --short HEAD'),
  branch:
    process.env.BUILD_BRANCH ||
    process.env.GITHUB_REF_NAME ||
    git('rev-parse --abbrev-ref HEAD'),
  commitMessage: git('log -1 --pretty=%s'),
  commitDate: git('log -1 --pretty=%cI'),
};

writeFileSync('build-info.json', `${JSON.stringify(info, null, 2)}\n`);
console.log('[build-info] wrote build-info.json:', info);
