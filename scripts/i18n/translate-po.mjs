/**
 * Auto-translate PO files using DeepL API.
 *
 * Reads admin and public PO files, finds untranslated entries (msgstr === msgid),
 * translates them via DeepL, and writes the updated PO files.
 *
 * Usage:
 *   bun scripts/translate-po.mjs              # translate all non-EN locales
 *   bun scripts/translate-po.mjs de            # translate only German
 *   bun scripts/translate-po.mjs --dry-run     # show what would be translated
 *
 * Requires DEEPL_API_KEY in .env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse enabled locales from src/lib/constants.ts.
 * Only these locales are translated by default; explicit CLI target bypasses this.
 */
function parseEnabledLocales() {
  try {
    const configPath = path.resolve(__dirname, '../../src/lib/constants.ts');
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/export const LOCALES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
    if (!match) return null;
    const entries = [...match[1].matchAll(/^\s*'([a-z]{2,3})'/gm)];
    return entries.map((e) => e[1]);
  } catch {
    return null;
  }
}

const ENABLED_LOCALES = parseEnabledLocales();

const LOCALES_DIR = path.resolve(__dirname, '../../locales');
const ADMIN_DIR = path.resolve(LOCALES_DIR, 'admin');
const PUBLIC_DIR = path.resolve(LOCALES_DIR, 'public');

// DeepL config from env
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_FREE = process.env.DEEPL_API_FREE !== 'false';
const DEEPL_URL = DEEPL_FREE
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';

// Rate limiting
const BATCH_SIZE = 20; // texts per API call
const DELAY_MS = 200; // between batches

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetLocale = args.find((a) => !a.startsWith('--'));

if (!DEEPL_API_KEY) {
  console.error('Error: DEEPL_API_KEY not set in environment. Add it to .env');
  process.exit(1);
}

/**
 * Parse a PO file into an array of entries.
 */
function parsePo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const entries = [];
  const lines = content.split('\n');

  let currentEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('msgctxt "')) {
      currentEntry = currentEntry || {};
      currentEntry.msgctxt = line.substring(9, line.length - 1);
      continue;
    }

    if (line.startsWith('msgid "')) {
      currentEntry = currentEntry || {};
      currentEntry.msgid = line.substring(7, line.length - 1);
      continue;
    }

    if (line.startsWith('msgstr "')) {
      currentEntry = currentEntry || {};
      currentEntry.msgstr = line.substring(8, line.length - 1);

      // Capture references (comments before this block)
      const refs = [];
      for (let j = i - 1; j >= 0; j--) {
        const refLine = lines[j].trim();
        if (refLine.startsWith('#:')) {
          refs.unshift(refLine);
        } else if (refLine.startsWith('msgid ') || refLine.startsWith('msgctxt ')) {
          // part of current entry, skip
        } else {
          break;
        }
      }
      currentEntry.refs = refs;

      if (currentEntry.msgid) {
        entries.push(currentEntry);
      }
      currentEntry = null;
      continue;
    }
  }

  return entries;
}

/**
 * Rebuild PO file content from entries + header.
 */
function buildPo(filePath, entries) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract the header (everything up to the first real entry)
  const headerMatch = content.match(
    /^(msgid ""\nmsgstr ""\n(?:"[^"]*\\n"\n)*)\n/m
  );
  const header = headerMatch ? headerMatch[0] : '';

  const lines = [header];

  for (const entry of entries) {
    if (entry.refs?.length) {
      lines.push(entry.refs.join('\n'));
    }
    if (entry.msgctxt) {
      lines.push(`msgctxt "${entry.msgctxt}"`);
    }
    lines.push(`msgid "${entry.msgid}"`);
    lines.push(`msgstr "${entry.msgstr}"`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Translate a batch of texts via DeepL.
 */
async function translateBatch(texts, targetLang) {
  const response = await fetch(DEEPL_URL, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: texts,
      target_lang: targetLang.toUpperCase(),
      source_lang: 'EN',
      // Preserve ICU placeholders like {count} by treating them as XML tags.
      // Using 'xml' instead of 'html' to avoid &amp; encoding of plain-text ampersands.
      tag_handling: 'xml',
      ignore_tags: ['x'],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepL API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.translations.map((t) => t.text);
}

/**
 * Escape ICU placeholders before sending to DeepL, restore after.
 * Converts {name} → <x>{name}</x> so DeepL preserves them.
 */
function escapeICU(text) {
  return text.replace(/\{([^}]+)\}/g, '<x>{$1}</x>');
}

function unescapeICU(text) {
  return text.replace(/<x>\{([^}]+)\}<\/x>/g, '{$1}');
}

/**
 * Process a single PO file — find untranslated entries and translate them.
 */
async function processPoFile(filePath, lang) {
  const entries = parsePo(filePath);
  const untranslated = entries.filter(
    (e) => e.msgid && e.msgstr === e.msgid // msgstr equals msgid = not translated
  );

  if (untranslated.length === 0) {
    console.log(`  ✓ ${path.basename(filePath)} — all ${entries.length} entries translated`);
    return 0;
  }

  console.log(
    `  ${path.basename(filePath)} — ${untranslated.length} of ${entries.length} entries need translation`
  );

  if (dryRun) {
    for (const entry of untranslated.slice(0, 5)) {
      console.log(`    → "${entry.msgid}"`);
    }
    if (untranslated.length > 5) {
      console.log(`    ... and ${untranslated.length - 5} more`);
    }
    return untranslated.length;
  }

  // Translate in batches
  let translated = 0;
  for (let i = 0; i < untranslated.length; i += BATCH_SIZE) {
    const batch = untranslated.slice(i, i + BATCH_SIZE);
    const texts = batch.map((e) => escapeICU(e.msgid));

    try {
      const results = await translateBatch(texts, lang);

      for (let j = 0; j < batch.length; j++) {
        // Escape quotes for PO format
        batch[j].msgstr = unescapeICU(results[j])
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\\"/g, '"')
          .replace(/"/g, '\\"');
        translated++;
      }

      process.stdout.write(
        `\r    Translated ${translated}/${untranslated.length}...`
      );
    } catch (err) {
      console.error(`\n    Error translating batch: ${err.message}`);
      break;
    }

    if (i + BATCH_SIZE < untranslated.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (translated > 0) {
    console.log(`\r    Translated ${translated}/${untranslated.length} entries`);

    // Write updated PO file
    const newContent = buildPo(filePath, entries);
    fs.writeFileSync(filePath, newContent);
    console.log(`    ✓ Written ${filePath}`);
  }

  return translated;
}

/**
 * Main
 */
async function main() {
  console.log(
    dryRun
      ? '🔍 Dry run — showing untranslated entries without calling DeepL'
      : '🌐 Auto-translating PO files via DeepL...'
  );
  console.log('');

  // Find locale files to process — only enabled locales by default
  const locales = new Set();
  for (const dir of [ADMIN_DIR, PUBLIC_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.po')) {
        const locale = path.basename(file, '.po');
        if (locale === 'en') continue; // Skip English (source)
        // Only translate enabled locales (from src/lib/constants.ts)
        if (ENABLED_LOCALES && !ENABLED_LOCALES.includes(locale)) continue;
        locales.add(locale);
      }
    }
  }

  if (ENABLED_LOCALES) {
    console.log(`Enabled locales: ${ENABLED_LOCALES.join(', ')}`);
  } else {
    console.log('Warning: Could not read LOCALES from config — translating all locales');
  }

  if (targetLocale) {
    // Explicit CLI target bypasses the enabled-locales filter
    const hasFile = [ADMIN_DIR, PUBLIC_DIR].some(
      (dir) => fs.existsSync(path.join(dir, `${targetLocale}.po`))
    );
    if (!hasFile) {
      console.error(`Locale "${targetLocale}" not found — no PO file found`);
      process.exit(1);
    }
    locales.clear();
    locales.add(targetLocale);
  }

  let totalTranslated = 0;

  // DeepL requires specific target language codes for some locales
  const DEEPL_LANG_MAP = {
    pt: 'PT-PT',
    nb: 'NB',
  };

  for (const locale of locales) {
    const deeplLang = DEEPL_LANG_MAP[locale] || locale.toUpperCase();
    console.log(`📦 ${locale.toUpperCase()}:`);

    for (const dir of [ADMIN_DIR, PUBLIC_DIR]) {
      const filePath = path.join(dir, `${locale}.po`);
      if (!fs.existsSync(filePath)) continue;
      totalTranslated += await processPoFile(filePath, deeplLang);
    }

    console.log('');
  }

  if (dryRun) {
    console.log(`Total: ${totalTranslated} entries need translation.`);
    console.log('Run without --dry-run to translate.');
  } else if (totalTranslated > 0) {
    console.log(`✅ Translated ${totalTranslated} entries total.`);
    console.log('Run `bun run transform:po` to rebuild JSON files.');
  } else {
    console.log('✅ All entries are already translated.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
