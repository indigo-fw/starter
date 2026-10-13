import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Deploy/build metadata. In production it comes from `build-info.json`,
 * generated in CI (`bun run build-info`) and baked into the image — the
 * running container has no `.git`. In local dev the file usually isn't
 * present, so live git is read instead. See `src/scripts/gen-build-info.ts`.
 */
export interface BuildInfo {
  /** ISO timestamp the image was built (≈ deploy time). null in dev. */
  deployedAt: string | null;
  commit: string | null;
  commitShort: string | null;
  branch: string | null;
  /** Subject line of the last commit. */
  commitMessage: string | null;
  /** ISO commit date. */
  commitDate: string | null;
  source: 'file' | 'git' | 'unknown';
}

const EMPTY: BuildInfo = {
  deployedAt: null,
  commit: null,
  commitShort: null,
  branch: null,
  commitMessage: null,
  commitDate: null,
  source: 'unknown',
};

let cached: BuildInfo | null = null;

/** Dev fallback: the workspace has `.git`, the prod container does not. */
async function fromGit(): Promise<BuildInfo | null> {
  try {
    const { execSync } = await import('node:child_process');
    const g = (a: string): string =>
      execSync(`git ${a}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || '';
    const commit = g('rev-parse HEAD');
    if (!commit) return null;
    return {
      deployedAt: null,
      commit,
      commitShort: g('rev-parse --short HEAD') || null,
      branch: g('rev-parse --abbrev-ref HEAD') || null,
      commitMessage: g('log -1 --pretty=%s') || null,
      commitDate: g('log -1 --pretty=%cI') || null,
      source: 'git',
    };
  } catch {
    return null;
  }
}

/** Read once, cached for the process lifetime (the file never changes at runtime). */
export async function getBuildInfo(): Promise<BuildInfo> {
  if (cached) return cached;
  try {
    const raw = readFileSync(
      path.join(process.cwd(), 'build-info.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw) as Partial<BuildInfo>;
    // Ignore the Dockerfile placeholder ({"source":"unknown"}) — fall back to git.
    if (parsed.deployedAt || parsed.commit) {
      cached = { ...EMPTY, ...parsed, source: 'file' };
      return cached;
    }
  } catch {
    // No file (typical in dev) — fall through to live git.
  }
  cached = (await fromGit()) ?? EMPTY;
  return cached;
}
