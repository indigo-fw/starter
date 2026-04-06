import chokidar from 'chokidar';
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

/**
 * Extract a quoted string value from a PO line like: msgid "hello"  →  hello
 */
function extractQuoted(line, prefix) {
  const trimmed = line.trim();
  if (!trimmed.startsWith(prefix)) return null;
  // Format: prefix "value" — skip prefix, space, and opening quote
  return trimmed.substring(prefix.length + 2, trimmed.length - 1);
}

/**
 * Convert PO sprintf placeholders (%d, %s) to ICU {count} / {value} format.
 * %d → {count}, %s → {value}, %1$d → {count}, etc.
 */
function sprintfToICU(text) {
  // Replace %d / %1$d with {count}
  return text
    .replace(/%\d*\$?d/g, '{count}')
    .replace(/%\d*\$?s/g, '{value}');
}

/**
 * Convert PO plural msgstr[0]/msgstr[1] to ICU plural format.
 * Input:  singular = "1 Element", plural = "%d Elemente"
 * Output: "{count, plural, one {1 Element} other {{count} Elemente}}"
 */
function toICUPlural(singularStr, pluralStr) {
  const one = sprintfToICU(singularStr);
  const other = sprintfToICU(pluralStr);
  return `{count, plural, one {${one}} other {${other}}}`;
}

/**
 * Parse a single PO file and return structured JSON object.
 * Supports singular entries (msgid/msgstr) and plural entries
 * (msgid/msgid_plural/msgstr[0]/msgstr[1]) — converting plurals to ICU format.
 */
function parsePo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  const lines = content.split('\n');

  let ctx = null;       // msgctxt
  let msgid = null;     // msgid
  let msgidPlural = null; // msgid_plural
  let msgstr = null;    // msgstr (singular)
  let msgstrPlural = {}; // msgstr[0], msgstr[1], ...

  function flush() {
    if (!msgid) { reset(); return; }

    // Handle context separator: msgctxt "General::verb" → namespace "General", key "Post::verb"
    const rawCtx = ctx || 'General';
    let prefix, ctxSuffix;
    if (rawCtx.includes('::')) {
      const sepIdx = rawCtx.indexOf('::');
      prefix = rawCtx.substring(0, sepIdx);
      ctxSuffix = rawCtx.substring(sepIdx); // includes the "::"
    } else {
      prefix = rawCtx;
      ctxSuffix = '';
    }
    const key = msgid.replace(/\./g, '@@@').replace(/\\"/g, '"') + ctxSuffix;

    if (!result[prefix]) result[prefix] = {};

    if (msgidPlural && Object.keys(msgstrPlural).length >= 2) {
      // Plural entry → convert to ICU format
      const s = (msgstrPlural[0] || '').replace(/\\"/g, '"');
      const p = (msgstrPlural[1] || '').replace(/\\"/g, '"');
      result[prefix][key] = toICUPlural(s, p);
    } else if (msgstr !== null) {
      // Singular entry
      result[prefix][key] = msgstr.replace(/\\"/g, '"');
    }

    reset();
  }

  function reset() {
    ctx = null;
    msgid = null;
    msgidPlural = null;
    msgstr = null;
    msgstrPlural = {};
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line = end of entry
    if (trimmed === '') {
      flush();
      continue;
    }

    // Comments
    if (trimmed.startsWith('#')) continue;

    // msgctxt
    const ctxVal = extractQuoted(trimmed, 'msgctxt');
    if (ctxVal !== null) { ctx = ctxVal; continue; }

    // msgid_plural (must check before msgid)
    const pluralVal = extractQuoted(trimmed, 'msgid_plural');
    if (pluralVal !== null) { msgidPlural = pluralVal; continue; }

    // msgid
    const idVal = extractQuoted(trimmed, 'msgid');
    if (idVal !== null) { if (msgid !== null) flush(); msgid = idVal; continue; }

    // msgstr[N]
    const pluralMatch = trimmed.match(/^msgstr\[(\d+)\]\s+"(.*)"/);
    if (pluralMatch) { msgstrPlural[parseInt(pluralMatch[1])] = pluralMatch[2]; continue; }

    // msgstr (singular)
    const strVal = extractQuoted(trimmed, 'msgstr');
    if (strVal !== null) { msgstr = strVal; continue; }
  }

  // Flush last entry
  flush();

  return result;
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
function watchPoFiles() {
  console.log(`Watching for changes in ${ADMIN_DIR} and ${PUBLIC_DIR}...`);

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
  watchPoFiles();
} else {
  transformPoFiles();
}
