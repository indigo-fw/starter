/**
 * Thin dispatch wrapper for `bun run indigo brand:generate`.
 *
 * Statically imported from scripts/indigo.ts — matches the existing pattern
 * of scripts/indigo/visualize.ts and scripts/indigo/codemap.ts. The actual
 * implementation lives in the module at src/core-brand/cli/generate.ts and
 * is loaded dynamically because:
 *
 *   (a) the module may not be installed in this project (graceful error)
 *   (b) dynamic load avoids pulling the rasterization deps into projects
 *       that don't use this command
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface BrandGenerateFlags {
  check?: boolean;
}

export async function brandGenerate(flags: BrandGenerateFlags): Promise<void> {
  const root = process.cwd();
  const modulePath = resolve(root, 'src/core-brand');

  if (!existsSync(modulePath)) {
    console.error('✗ core-brand module is not installed.');
    console.error('  Install it first: bun run indigo add core-brand');
    process.exit(1);
  }

  const cliPath = resolve(root, 'src/core-brand/cli/generate.ts');
  const mod = (await import(cliPath)) as {
    generateBrandAssets: (opts: { check?: boolean }) => Promise<void>;
  };
  await mod.generateBrandAssets({ check: flags.check });
}
