// @vitest-environment node
/**
 * Boot guard for the Bun entry (`server.ts`).
 *
 * `bun server.ts` loads our modules directly — no Next.js webpack, so no
 * `react-server` export condition. Any module in that import graph that pulls
 * `import 'server-only'` throws at load ("This module cannot be imported from
 * a Client Component module") and the release dies at boot. Vitest can never
 * see this because vitest.config.ts aliases `server-only` to a stub, and
 * `next build` can't either — it only bundles the Next.js side.
 *
 * It already happened once: `scheduled-publish.ts` imported `cms-override.ts`
 * (server-only) and SERVER_ROLE=all crashed on start. The fix was a sync-only
 * split (`cms-override-sync.ts`, mirroring `cms-link-sync.ts`); this test is
 * what makes the next slip fail here instead of in production.
 *
 * Method: parse every `./src/...` specifier out of server.ts, then import them
 * all, in file order, inside ONE real `bun` child process with a hermetic env
 * (dummy DATABASE_URL on a dead port, no REDIS_URL, no .env) so a module that
 * needs a live service at import time also fails loudly.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const serverEntry = path.join(repoRoot, 'server.ts');

// Matches `import('./src/x')` and `from './src/x'` (either quote style).
// Deliberately narrow: only our own source — `next`, `http` etc. are not what
// this guard is about and would only add cold-start time.
const SPECIFIER_RE = /(?:import\(|from )\s*(['"])(\.\/src\/[^'"]+)\1/g;

function collectServerSpecifiers(source: string): string[] {
  const seen = new Set<string>();
  for (const match of source.matchAll(SPECIFIER_RE)) seen.add(match[2]);
  return [...seen];
}

const bunAvailable = (() => {
  const probe = spawnSync('bun', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
})();

// Hermetic child env: only what Bun needs to launch, plus inert app values.
// Nothing else is inherited, so a developer's shell (REDIS_URL, SMTP_*, real
// DATABASE_URL, ...) can never make this pass — or fail — by accident.
// DATABASE_URL points at a port nothing listens on: a module that connects
// at import time surfaces as a failure instead of silently using a real DB.
function childEnv(): NodeJS.ProcessEnv {
  const inherit = [
    'PATH',
    // Windows: CreateProcess + Bun need these to start at all.
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'HOME',
  ];
  const env: Record<string, string> = {};
  for (const key of inherit) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    NODE_ENV: 'test',
    SERVER_ROLE: 'worker',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/indigo_never',
    BETTER_AUTH_SECRET: 'bun-entry-imports-dummy-secret-0123456789abcdef',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  };
}

// Runs in the child. Specifiers stay exactly as written in server.ts and are
// resolved from the repo root — the same resolution `bun server.ts` performs.
function buildImportScript(specifiers: string[]): string {
  return `
    const specifiers = ${JSON.stringify(specifiers)};
    for (const spec of specifiers) {
      try {
        await import(spec);
        console.log('OK ' + spec);
      } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        console.log('FAIL ' + spec + ' ' + msg);
        process.exit(1);
      }
    }
    // Explicit exit: a module that leaves a handle open must not hang the test.
    process.exit(0);
  `;
}

describe('server.ts Bun entry imports', () => {
  const specifiers = collectServerSpecifiers(readFileSync(serverEntry, 'utf8'));

  it('finds the ./src modules server.ts loads (regex sanity)', () => {
    // A silent regex breakage would make the import test pass vacuously.
    expect(specifiers.length).toBeGreaterThanOrEqual(5);
    for (const spec of specifiers) expect(spec).toMatch(/^\.\/src\//);
  });

  it.skipIf(!bunAvailable)(
    'every module server.ts imports loads under bun without server-only (requires `bun` on PATH; skipped otherwise)',
    () => {
      // Bun auto-loads ./.env from cwd; an explicit empty --env-file disables
      // that, so the developer's local .env cannot leak into the child either.
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'indigo-bun-entry-'));
      const emptyEnvFile = path.join(tmpDir, 'empty.env');
      writeFileSync(emptyEnvFile, '');

      const startedAt = Date.now();
      let result: ReturnType<typeof spawnSync>;
      try {
        result = spawnSync(
          'bun',
          [`--env-file=${emptyEnvFile}`, '-e', buildImportScript(specifiers)],
          {
            cwd: repoRoot,
            env: childEnv(),
            encoding: 'utf8',
            timeout: 60_000,
            maxBuffer: 16 * 1024 * 1024,
          }
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
      const elapsedMs = Date.now() - startedAt;

      const stdout = String(result.stdout ?? '');
      const stderr = String(result.stderr ?? '');
      const report = [
        `exit status: ${result.status} (signal: ${result.signal ?? 'none'}, ${elapsedMs} ms)`,
        result.error ? `spawn error: ${result.error.message}` : null,
        `--- stdout ---\n${stdout.trim()}`,
        `--- stderr ---\n${stderr.trim()}`,
      ]
        .filter(Boolean)
        .join('\n');

      expect(result.error, report).toBeUndefined();
      expect(result.status, report).toBe(0);
      // Belt and braces: the message the real package throws, in case a module
      // catches and logs it instead of letting the import reject.
      const combined = `${stdout}\n${stderr}`;
      expect(combined, report).not.toMatch(/server-only/);
      expect(combined, report).not.toMatch(/Client Component module/);
      // Every specifier must have been reached (an early exit(0) in some module
      // would otherwise look like success).
      for (const spec of specifiers) {
        expect(stdout, report).toContain(`OK ${spec}`);
      }
    },
    90_000
  );
});
