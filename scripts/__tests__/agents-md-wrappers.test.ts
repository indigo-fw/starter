/**
 * Guards the agent-docs convention: `AGENTS.md` is the canonical guide in
 * every documented folder and `CLAUDE.md` beside it is exactly the one-line
 * `@AGENTS.md` import. Codex, Cursor and Gemini read AGENTS.md directly;
 * Claude Code loads the same content through the wrapper. A folder that
 * gains one file without the other, or a wrapper that grows real content,
 * silently forks the guidance between agents — this test catches it.
 *
 * Exempt: `AGENTS.starter.md` / `AGENTS.dev.md` (sibling-file conventions of
 * sync-starter, not guides of their own).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.indigo',
  '.claude',
  '.agents',
  '.codex',
  'coverage',
  'uploads',
  'public',
  'locales',
  'drizzle',
]);

function findGuideDirs(dir: string, out = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.next')) continue;
      findGuideDirs(join(dir, entry.name), out);
    } else if (entry.name === 'AGENTS.md' || entry.name === 'CLAUDE.md') {
      out.add(dirname(join(dir, entry.name)));
    }
  }
  return out;
}

describe('AGENTS.md is canonical, CLAUDE.md is its wrapper', () => {
  const dirs = [...findGuideDirs(ROOT)].sort();

  it('finds the documented folders', () => {
    expect(dirs.length).toBeGreaterThan(20);
  });

  for (const dir of dirs) {
    const label = relative(ROOT, dir) || '(root)';
    it(`${label}: AGENTS.md + CLAUDE.md wrapper`, () => {
      expect(
        existsSync(join(dir, 'AGENTS.md')),
        `${label}: AGENTS.md missing`
      ).toBe(true);
      expect(
        existsSync(join(dir, 'CLAUDE.md')),
        `${label}: CLAUDE.md wrapper missing`
      ).toBe(true);
      const wrapper = readFileSync(join(dir, 'CLAUDE.md'), 'utf8').trim();
      expect(
        wrapper,
        `${label}: CLAUDE.md must be exactly "@AGENTS.md" — edit AGENTS.md instead`
      ).toBe('@AGENTS.md');
    });
  }
});
