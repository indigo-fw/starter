/**
 * Seed content — copies template .md files from core/seed-templates/{locale}/
 * to the project's content/{locale}/ directory.
 *
 * Files are copied verbatim — template variables like [[COMPANY_NAME]] stay
 * as-is in the files. The [[VAR]] placeholders are resolved at render time
 * by resolveContentVars (from content-vars.ts) using values from site.ts.
 *
 * This means:
 *   - Devs can freely edit the .md files (variables stay as placeholders)
 *   - Changing company info in site.ts takes effect immediately
 *   - No file overwrites on re-init
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed-templates');
const CONTENT_DIR = join(process.cwd(), 'content');

/**
 * Check if any seed template files already exist in content/.
 */
export function templateFilesExist(): boolean {
  if (!existsSync(TEMPLATES_DIR) || !existsSync(CONTENT_DIR)) return false;

  const templateNames = getTemplateFilenames();
  if (templateNames.length === 0) return false;

  for (const localeDir of readdirSync(CONTENT_DIR)) {
    const localePath = join(CONTENT_DIR, localeDir);
    if (!statSync(localePath).isDirectory()) continue;
    for (const name of templateNames) {
      if (existsSync(join(localePath, name))) return true;
    }
  }

  return false;
}

/**
 * Copy seed templates to content/{locale}/ without variable substitution.
 * Skips files that already exist — dev edits are never overwritten.
 * Returns the number of new files written.
 */
export function seedContentFiles(): number {
  if (!existsSync(TEMPLATES_DIR)) return 0;

  let count = 0;

  for (const localeDir of readdirSync(TEMPLATES_DIR)) {
    const sourcePath = join(TEMPLATES_DIR, localeDir);
    if (!statSync(sourcePath).isDirectory()) continue;

    const targetPath = join(CONTENT_DIR, localeDir);
    mkdirSync(targetPath, { recursive: true });

    count += copyDir(sourcePath, targetPath);
  }

  return count;
}

function copyDir(sourceDir: string, targetDir: string): number {
  let count = 0;

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      count += copyDir(sourcePath, targetPath);
      continue;
    }

    if (extname(entry).toLowerCase() !== '.md') continue;

    // Never overwrite existing files — dev edits are preserved
    if (existsSync(targetPath)) continue;

    // Substitute [[CURRENT_DATE]] at copy time (one-time value, not a live variable).
    // All other [[VAR]] placeholders stay as-is — resolved at render time from site.ts.
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const content = readFileSync(sourcePath, 'utf-8').replace(/\[\[CURRENT_DATE\]\]/g, currentDate);
    writeFileSync(targetPath, content, 'utf-8');
    count++;
  }

  return count;
}

function getTemplateFilenames(): string[] {
  if (!existsSync(TEMPLATES_DIR)) return [];

  for (const localeDir of readdirSync(TEMPLATES_DIR)) {
    const localePath = join(TEMPLATES_DIR, localeDir);
    if (!statSync(localePath).isDirectory()) continue;
    // Filter out documentation/meta files (ALL-CAPS names like CLAUDE.md, README.md, etc.)
    return readdirSync(localePath).filter((f) => f.endsWith('.md') && !/^[A-Z][A-Z0-9_-]*\.md$/.test(f));
  }

  return [];
}
