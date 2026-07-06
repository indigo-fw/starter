import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';

import { describe, expect, it } from 'vitest';

/**
 * `.agents/skills/` ships the same skills as `.claude/skills/` for non-Claude
 * agents (Codex, Gemini). The pair is hand-maintained twins and drifts
 * silently otherwise — the setup skill's `.agents` copy once shipped without
 * the install-consent rule. Every `.agents` skill must be byte-identical to
 * its `.claude` original.
 */

const root = resolve(__dirname, '..', '..');
const claudeSkills = join(root, '.claude', 'skills');
const agentsSkills = join(root, '.agents', 'skills');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

describe('agent skill twins', () => {
  it('.agents/skills mirrors .claude/skills byte-for-byte', () => {
    const files = walk(agentsSkills);
    expect(files.length).toBeGreaterThan(0);

    for (const agentFile of files) {
      const rel = agentFile.slice(agentsSkills.length + 1);
      const claudeFile = join(claudeSkills, rel);
      expect(existsSync(claudeFile), `${rel} exists in .agents/skills but not .claude/skills`).toBe(true);
      expect(
        readFileSync(agentFile, 'utf-8'),
        `.agents/skills/${rel} drifted from its .claude twin — edit .claude and copy over`,
      ).toBe(readFileSync(claudeFile, 'utf-8'));
    }
  });
});
