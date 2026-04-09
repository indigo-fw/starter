/**
 * Seed content — copies template .md files from core/seed-templates/{locale}/
 * to the project's content/{locale}/ directory with variable substitution.
 *
 * Called by `bun run init`. The runtime content sync (server.ts) then
 * picks up these files and inserts them into the CMS database.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

export interface SeedContentVars {
  SITE_NAME: string;
  SITE_URL: string;
  COMPANY_NAME: string;
  COMPANY_ADDRESS: string;
  COMPANY_ID: string;
  COMPANY_JURISDICTION: string;
  CONTACT_EMAIL: string;
  CURRENT_DATE: string;
}

const TEMPLATES_DIR = join(__dirname, '..', 'seed-templates');
const CONTENT_DIR = join(process.cwd(), 'content');

/**
 * Check if content files already exist in the target directory.
 */
export function contentFilesExist(): boolean {
  if (!existsSync(CONTENT_DIR)) return false;

  for (const localeDir of readdirSync(CONTENT_DIR)) {
    const localePath = join(CONTENT_DIR, localeDir);
    if (!statSync(localePath).isDirectory()) continue;
    const mdFiles = readdirSync(localePath).filter((f) => f.endsWith('.md'));
    if (mdFiles.length > 0) return true;
  }

  return false;
}

/**
 * Copy seed templates to content/{locale}/ with variable substitution.
 * Returns the number of files written.
 */
export function seedContentFiles(vars: SeedContentVars): number {
  if (!existsSync(TEMPLATES_DIR)) return 0;

  let count = 0;

  for (const localeDir of readdirSync(TEMPLATES_DIR)) {
    const sourcePath = join(TEMPLATES_DIR, localeDir);
    if (!statSync(sourcePath).isDirectory()) continue;

    const targetPath = join(CONTENT_DIR, localeDir);
    mkdirSync(targetPath, { recursive: true });

    count += copyDir(sourcePath, targetPath, vars);
  }

  return count;
}

function copyDir(sourceDir: string, targetDir: string, vars: SeedContentVars): number {
  let count = 0;

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      count += copyDir(sourcePath, targetPath, vars);
      continue;
    }

    if (extname(entry).toLowerCase() !== '.md') continue;

    let content = readFileSync(sourcePath, 'utf-8');

    // Replace all template variables
    for (const [key, value] of Object.entries(vars)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    writeFileSync(targetPath, content, 'utf-8');
    count++;
  }

  return count;
}
