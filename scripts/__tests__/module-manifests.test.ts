import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { REGISTRY } from '../indigo/registry';
import type { ModuleConfig } from '../../src/core/lib/module/module-config';

/**
 * Guards the module-removal contract (see src/core/CLAUDE.md):
 *
 * 1. Every project-space file that imports a *removable* module must be in
 *    that module's `projectFiles`, so `indigo remove` deletes it and never
 *    leaves a dangling import. (Required primitives are exempt — they can't
 *    be removed.)
 * 2. The README module table must agree with the registry's free/paid flags.
 *
 * These are the two drift classes that hand-maintained manifests grow.
 */

const root = resolve(__dirname, '..', '..');

const PROJECT_DIRS = ['src/app', 'src/components', 'src/config', 'src/lib', 'src/server'];
const MODULE_REF = /['"]@\/(core-[a-z0-9-]+)\//g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

async function loadModuleConfigs(): Promise<Map<string, ModuleConfig>> {
  const configs = new Map<string, ModuleConfig>();
  for (const name of readdirSync(join(root, 'src'))) {
    if (!name.startsWith('core-')) continue;
    const configPath = join(root, 'src', name, 'module.config.ts');
    if (!existsSync(configPath)) continue;
    const mod = (await import(configPath)) as { default: ModuleConfig };
    configs.set(name, mod.default);
  }
  return configs;
}

describe('module manifests', () => {
  it('every project-space file importing a removable module is in its projectFiles', async () => {
    const configs = await loadModuleConfigs();
    const required = new Set(REGISTRY.filter((r) => r.required).map((r) => r.id));

    const violations: string[] = [];
    for (const dir of PROJECT_DIRS) {
      const abs = join(root, dir);
      if (!existsSync(abs)) continue;
      for (const file of walk(abs)) {
        const rel = relative(join(root, 'src'), file).replace(/\\/g, '/');
        if (rel.startsWith('generated/')) continue;

        const content = readFileSync(file, 'utf-8');
        // Guarded lazy imports (computed specifier + try/catch) opt out with
        // `// module-manifest-ignore: core-x` next to the guard.
        const ignored = new Set(
          [...content.matchAll(/module-manifest-ignore:\s*(core-[a-z0-9-]+)/g)].map((m) => m[1]!),
        );
        for (const match of content.matchAll(MODULE_REF)) {
          const moduleId = match[1]!;
          if (required.has(moduleId)) continue;
          if (ignored.has(moduleId)) continue;
          const config = configs.get(moduleId);
          if (!config) continue; // not installed — typecheck owns that case
          if (!config.projectFiles.includes(rel)) {
            violations.push(
              `${rel} imports @/${moduleId}/ but is not in ${moduleId}'s projectFiles — ` +
                `\`indigo remove ${moduleId}\` would leave a dangling import`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('projectFiles entries exist on disk and are src-relative', async () => {
    const configs = await loadModuleConfigs();
    const problems: string[] = [];
    for (const [id, config] of configs) {
      for (const f of config.projectFiles) {
        if (f.startsWith('src/')) {
          problems.push(`${id}: "${f}" must be src-relative (drop the src/ prefix)`);
        }
        // Valid locations: materialized in project space (src/<f> or <f> for
        // root-level paths like emails/), or as the module's template source.
        // Email templates install to emails/en/ but their source lives at
        // _templates/emails/ (locale added at scaffold time).
        const templateCandidates = [f, f.replace(/^emails\/en\//, 'emails/')];
        const materialized =
          existsSync(join(root, 'src', f)) || existsSync(join(root, f));
        const templated = templateCandidates.some((c) =>
          existsSync(join(root, 'src', id, '_templates', c)),
        );
        if (!materialized && !templated) {
          problems.push(`${id}: "${f}" exists neither in project space nor in _templates — stale entry?`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('README module table matches the registry', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf-8');
    const rows = new Map<string, string>();
    for (const m of readme.matchAll(/^\| `(core-[a-z0-9-]+)` \| (Free|Paid) \|/gm)) {
      rows.set(m[1]!, m[2]!);
    }

    const problems: string[] = [];
    for (const entry of REGISTRY) {
      const row = rows.get(entry.id);
      if (!row) {
        problems.push(`${entry.id} is in the registry but missing from the README module table`);
        continue;
      }
      const expected = entry.free ? 'Free' : 'Paid';
      if (row !== expected) {
        problems.push(`${entry.id}: README says ${row}, registry says ${expected}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
