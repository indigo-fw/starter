#!/usr/bin/env bun
/**
 * Indigo module CLI.
 *
 * Usage:
 *   bun run indigo add <module>      Install a module (subtree + scaffold + sync + migrate)
 *   bun run indigo remove <module>   Remove a module (config + sync + cleanup)
 *   bun run indigo list              Show installed and available modules
 *   bun run indigo sync              Regenerate glue files from indigo.config.ts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, cpSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { REGISTRY, getRegistryEntry } from './indigo/registry';

const root = process.cwd();
const configPath = resolve(root, 'indigo.config.ts');

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(cmd: string, label?: string) {
  console.log(`  ${label ?? cmd}`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
  } catch {
    console.error(`  ✗ Failed: ${cmd}`);
    process.exit(1);
  }
}

function getInstalledModules(): string[] {
  const content = readFileSync(configPath, 'utf-8');
  return REGISTRY
    .filter((entry) => content.includes(`./src/${entry.id}/module.config`))
    .map((e) => e.id);
}

function moduleExists(id: string): boolean {
  return existsSync(resolve(root, 'src', id));
}

function addToConfig(id: string, importName: string) {
  let content = readFileSync(configPath, 'utf-8');

  // Add import line before the modules array
  const importLine = `import ${importName} from './src/${id}/module.config';`;
  if (content.includes(importLine)) return;

  // Insert import after the last existing module import
  const lastImportIdx = content.lastIndexOf("from './src/");
  if (lastImportIdx !== -1) {
    const lineEnd = content.indexOf('\n', lastImportIdx);
    content = content.slice(0, lineEnd + 1) + importLine + '\n' + content.slice(lineEnd + 1);
  }

  // Add to array
  const arrayEnd = content.lastIndexOf('];');
  if (arrayEnd !== -1) {
    const beforeClose = content.slice(0, arrayEnd);
    const afterClose = content.slice(arrayEnd);
    // Check if array has entries (not empty)
    const lastEntry = beforeClose.trimEnd();
    const needsComma = lastEntry.endsWith(',') || lastEntry.endsWith('[') ? '' : ',';
    content = lastEntry + needsComma + '\n  ' + importName + ',\n' + afterClose;
  }

  writeFileSync(configPath, content);
}

function removeFromConfig(id: string, importName: string) {
  let content = readFileSync(configPath, 'utf-8');

  // Remove import line
  const importPattern = new RegExp(`import ${importName} from './src/${id}/module\\.config';\\n?`, 'g');
  content = content.replace(importPattern, '');

  // Remove from array
  const entryPattern = new RegExp(`\\s*${importName},?\\n?`, 'g');
  content = content.replace(entryPattern, '\n');

  // Clean up double newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  writeFileSync(configPath, content);
}

async function getModuleProjectFiles(id: string): Promise<string[]> {
  try {
    const configModule = await import(resolve(root, 'src', id, 'module.config.ts'));
    return configModule.default?.projectFiles ?? [];
  } catch {
    return [];
  }
}

function scaffoldTemplates(id: string) {
  const templatesDir = resolve(root, 'src', id, '_templates');
  if (!existsSync(templatesDir)) return;

  console.log('  Scaffolding template files...');
  // force: false = don't overwrite existing files (preserve user customizations)
  cpSync(templatesDir, resolve(root, 'src'), { recursive: true, force: false });
}

async function cleanupScaffoldedFiles(id: string) {
  const projectFiles = await getModuleProjectFiles(id);

  for (const relPath of projectFiles) {
    const targetPath = resolve(root, 'src', relPath);
    if (existsSync(targetPath)) {
      console.log(`  Removing: src/${relPath}`);
      rmSync(targetPath);
    }
  }
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function add(id: string) {
  const entry = getRegistryEntry(id);
  if (!entry) {
    console.error(`Unknown module: ${id}`);
    console.error('Available modules:', REGISTRY.map((e) => e.id).join(', '));
    process.exit(1);
  }

  const installed = getInstalledModules();
  if (installed.includes(id)) {
    console.error(`Module ${id} is already installed`);
    process.exit(1);
  }

  // Check dependencies
  if (entry.requires) {
    const missing = entry.requires.filter((dep) => !installed.includes(dep));
    if (missing.length > 0) {
      console.error(`Missing dependencies: ${missing.join(', ')}`);
      console.error(`Install them first: bun run indigo add ${missing.join(' && bun run indigo add ')}`);
      process.exit(1);
    }
  }

  console.log(`\nInstalling ${id}...`);

  // Step 1: Git subtree add (or skip if directory already exists)
  // TODO: Requires git repo to exist at entry.repo. Until indigo-fw GitHub repos
  // are created, this will fail. For local dev, manually place module in src/.
  if (!moduleExists(id)) {
    run(
      `git subtree add --prefix=src/${id} ${entry.repo} main --squash`,
      `Pulling ${id} from ${entry.repo}...`,
    );
  } else {
    console.log(`  Directory src/${id} already exists, skipping subtree pull`);
  }

  // Step 2: Scaffold template files
  scaffoldTemplates(id);

  // Step 3: Add to indigo.config.ts
  console.log('  Updating indigo.config.ts...');
  addToConfig(id, entry.importName);

  // Step 4: Run sync
  run('bun run indigo:sync', 'Regenerating glue files...');

  // Step 5: Database migrations
  console.log('  Running database migrations...');
  run('bun run db:generate', 'Generating schema...');
  run('bun run db:migrate', 'Applying migrations...');

  console.log(`\n✓ ${id} installed successfully`);

  // Post-install hints
  if (entry.id === 'core-support') {
    console.log('\n  Next steps:');
    console.log('  - Set AI_API_KEY in .env to enable AI responses');
    console.log('  - Set NEXT_PUBLIC_SUPPORT_CHAT_ENABLED=true in .env');
  }
  if (entry.id === 'core-billing') {
    console.log('\n  Next steps:');
    console.log('  - Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env');
    console.log('  - Configure plans in src/config/plans.ts');
  }
  if (entry.id === 'core-payments-crypto') {
    console.log('\n  Next steps:');
    console.log('  - Set NOWPAYMENTS_API_KEY + NOWPAYMENTS_IPN_SECRET in .env');
  }
}

async function remove(id: string) {
  const entry = getRegistryEntry(id);
  if (!entry) {
    console.error(`Unknown module: ${id}`);
    process.exit(1);
  }

  const installed = getInstalledModules();
  if (!installed.includes(id)) {
    console.error(`Module ${id} is not installed`);
    process.exit(1);
  }

  // Check if other modules depend on this one
  const dependents = REGISTRY.filter(
    (e) => e.requires?.includes(id) && installed.includes(e.id)
  );
  if (dependents.length > 0) {
    console.error(`Cannot remove ${id} — required by: ${dependents.map((d) => d.id).join(', ')}`);
    console.error(`Remove them first: bun run indigo remove ${dependents.map((d) => d.id).join(' && bun run indigo remove ')}`);
    process.exit(1);
  }

  console.log(`\nRemoving ${id}...`);

  // Step 1: Remove from config
  console.log('  Updating indigo.config.ts...');
  removeFromConfig(id, entry.importName);

  // Step 2: Run sync (regenerate without this module)
  run('bun run indigo:sync', 'Regenerating glue files...');

  // Step 3: Clean up scaffolded files
  await cleanupScaffoldedFiles(id);

  // Step 4: Remove module directory
  if (moduleExists(id)) {
    console.log(`  Removing src/${id}/...`);
    rmSync(resolve(root, 'src', id), { recursive: true });
  }

  // Step 5: Regenerate schema
  run('bun run db:generate', 'Regenerating schema...');

  console.log(`\n✓ ${id} removed successfully`);
  console.log('  Note: Database tables from this module still exist. Drop them manually if needed.');
}

function list() {
  const installed = getInstalledModules();

  console.log('\nIndigo Modules\n');

  for (const entry of REGISTRY) {
    const isInstalled = installed.includes(entry.id);
    const status = isInstalled ? '●' : '○';
    const tag = entry.free ? '(free)' : '(paid)';
    const deps = entry.requires ? ` [requires: ${entry.requires.join(', ')}]` : '';
    console.log(`  ${status} ${entry.id} ${tag}${deps}`);
    console.log(`    ${entry.description}`);
  }

  console.log(`\n  ● installed  ○ not installed`);
  console.log(`  ${installed.length}/${REGISTRY.length} modules installed\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'add':
    if (!args[0]) { console.error('Usage: bun run indigo add <module>'); process.exit(1); }
    await add(args[0]);
    break;
  case 'remove':
    if (!args[0]) { console.error('Usage: bun run indigo remove <module>'); process.exit(1); }
    await remove(args[0]);
    break;
  case 'list':
    list();
    break;
  case 'sync':
    run('bun run indigo:sync');
    break;
  default:
    console.log('Indigo Module Manager\n');
    console.log('Usage:');
    console.log('  bun run indigo add <module>      Install a module');
    console.log('  bun run indigo remove <module>   Remove a module');
    console.log('  bun run indigo list              Show modules');
    console.log('  bun run indigo sync              Regenerate glue files');
    break;
}
