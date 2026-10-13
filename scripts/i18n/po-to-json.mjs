import { parsePoContent } from './po-parse.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '../../locales');
const ADMIN_DIR = path.resolve(LOCALES_DIR, 'admin');
const PUBLIC_DIR = path.resolve(LOCALES_DIR, 'public');
const BUILD_DIR = path.resolve(LOCALES_DIR, 'build');

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/** Parse a PO file into next-intl JSON messages (logic in po-parse.mjs). */
function parsePo(filePath) {
  return parsePoContent(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Deep merge source into target (source wins on conflict).
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Build JSON files for a given locale — separate public and admin.
 * - {locale}.json        — public translations only (served to public pages)
 * - {locale}.admin.json  — admin translations only (served to dashboard)
 */
function buildLocaleJson(language) {
  const publicMessages = {};
  const adminMessages = {};

  const publicPo = path.join(PUBLIC_DIR, `${language}.po`);
  const adminPo = path.join(ADMIN_DIR, `${language}.po`);

  if (fs.existsSync(publicPo)) {
    deepMerge(publicMessages, parsePo(publicPo));
  }

  if (fs.existsSync(adminPo)) {
    deepMerge(adminMessages, parsePo(adminPo));
  }

  return { publicMessages, adminMessages };
}

/**
 * Process a PO file change — rebuild the JSON for the affected locale.
 */
function processPoFile(filePath) {
  try {
    console.log(`Processing: ${filePath}`);

    const language = path.basename(filePath, '.po');
    if (!language) return;

    const { publicMessages, adminMessages } = buildLocaleJson(language);

    const publicPath = path.join(BUILD_DIR, `${language}.json`);
    const adminPath = path.join(BUILD_DIR, `${language}.admin.json`);

    fs.writeFileSync(publicPath, JSON.stringify(publicMessages, null, 2));
    fs.writeFileSync(adminPath, JSON.stringify(adminMessages, null, 2));

    console.log(`Generated: ${publicPath}`);
    console.log(`Generated: ${adminPath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

/**
 * Transform all PO files to JSON once.
 */
function transformPoFiles() {
  console.log('Transforming all PO files to JSON...');

  // Collect all unique locale codes from both admin and public dirs
  const locales = new Set();

  for (const dir of [ADMIN_DIR, PUBLIC_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.po')) {
        locales.add(path.basename(file, '.po'));
      }
    }
  }

  if (locales.size === 0) {
    console.log('No PO files found.');
    return;
  }

  for (const locale of locales) {
    const { publicMessages, adminMessages } = buildLocaleJson(locale);

    const publicPath = path.join(BUILD_DIR, `${locale}.json`);
    const adminPath = path.join(BUILD_DIR, `${locale}.admin.json`);

    fs.writeFileSync(publicPath, JSON.stringify(publicMessages, null, 2));
    fs.writeFileSync(adminPath, JSON.stringify(adminMessages, null, 2));

    console.log(`Generated: ${publicPath}, ${adminPath}`);
  }

  console.log('Transformation complete!');
}

/**
 * Watch PO files and transform them on changes.
 */
async function watchPoFiles() {
  console.log(`Watching for changes in ${ADMIN_DIR} and ${PUBLIC_DIR}...`);

  // chokidar is a devDependency; the production image (which runs the one-shot
  // compile via `bun run init`) doesn't ship it — load it only for watch mode.
  const { default: chokidar } = await import('chokidar');

  const watcher = chokidar.watch([ADMIN_DIR, PUBLIC_DIR], {
    ignored: (_path, stats) => stats?.isFile() && !_path.endsWith('.po'),
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  });

  watcher
    .on('add', (file) => {
      console.log(`File added: ${file}`);
      processPoFile(file);
    })
    .on('change', (file) => {
      console.log(`File changed: ${file}`);
      processPoFile(file);
    })
    .on('error', (error) => {
      console.error(`Watcher error: ${error}`);
    });

  console.log('Watcher started. Press Ctrl+C to stop.');
}

// Determine mode from CLI args
const mode = process.argv[2];

if (mode === 'watch') {
  await watchPoFiles();
} else {
  transformPoFiles();
}
