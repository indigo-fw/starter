/**
 * PO → next-intl JSON message parser. Pure (no fs, no side effects) so it can
 * be unit-tested: scripts/__tests__/po-parse.test.ts. po-to-json.mjs does the
 * I/O.
 */

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
 * Convert one PO plural branch to ICU: %d / %1$d → `#`, %s → {value}.
 * `#` (not a plain {count} argument) so ICU formats the number with the
 * locale's grouping ("1,000 items", "1.000 Elemente"); a {count} argument
 * would print String(count). A literal `#` already in the text is quoted
 * first so it is not mistaken for the number.
 */
function pluralBranchToICU(text) {
  return text
    .replace(/#/g, "'#'")
    .replace(/%\d*\$?d/g, '#')
    .replace(/%\d*\$?s/g, '{value}');
}

/**
 * Convert PO plural msgstr[0]/msgstr[1] to ICU plural format.
 * Input:  singular = "%d Element", plural = "%d Elemente"
 * Output: "{count, plural, one {# Element} other {# Elemente}}"
 */
function toICUPlural(singularStr, pluralStr) {
  const one = pluralBranchToICU(singularStr);
  const other = pluralBranchToICU(pluralStr);
  return `{count, plural, one {${one}} other {${other}}}`;
}

/** Unescape a PO string value (`\"` → `"`). */
function unescapeValue(s) {
  return s.replace(/\\"/g, '"');
}

/** JSON key for a msgid: dots → @@@ (next-intl reads dots as nesting). */
function toKey(msgid) {
  return unescapeValue(msgid.replace(/\./g, '@@@'));
}

/**
 * Parse PO file content into `{ [namespace]: { [key]: message } }`.
 * Supports singular entries (msgid/msgstr) and plural entries
 * (msgid/msgid_plural/msgstr[0]/msgstr[1]) — converting plurals to ICU format.
 *
 * Empty msgstr = untranslated (gettext convention, see generate-po-files.js).
 * It resolves to the English msgid, so the UI never renders an empty string
 * between extraction (`bun run i18n`) and translation (`i18n:translate`).
 * next-intl treats "" as a present message, not a missing one, so this is the
 * only place the fallback can happen.
 *
 * Duplicate keys (msgctxt "General" and no msgctxt map to the same key): an
 * empty (untranslated) entry never overwrites a translated one, whichever
 * comes first in the file.
 *
 * @param {string} content
 * @returns {Record<string, Record<string, string>>}
 */
export function parsePoContent(content) {
  const result = {};
  // `${prefix}\u0000${key}` of every key holding a real (non-empty) translation.
  const translated = new Set();
  const lines = content.split('\n');

  let ctx = null; // msgctxt
  let msgid = null; // msgid
  let msgidPlural = null; // msgid_plural
  let msgstr = null; // msgstr (singular)
  let msgstrPlural = {}; // msgstr[0], msgstr[1], ...

  function flush() {
    if (!msgid) {
      reset();
      return;
    }

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
    const key = toKey(msgid) + ctxSuffix;

    if (!result[prefix]) result[prefix] = {};
    const slot = `${prefix}\u0000${key}`;

    if (msgidPlural && Object.keys(msgstrPlural).length >= 2) {
      // Plural entry → convert to ICU format. Untranslated branches fall back
      // to the English msgid / msgid_plural.
      const s = unescapeValue(msgstrPlural[0] || '');
      const p = unescapeValue(msgstrPlural[1] || '');
      const isTranslated = s !== '' || p !== '';
      if (isTranslated || !translated.has(slot)) {
        result[prefix][key] = toICUPlural(
          s || unescapeValue(msgid),
          p || unescapeValue(msgidPlural)
        );
        if (isTranslated) translated.add(slot);
      }
    } else if (msgstr !== null) {
      const value = unescapeValue(msgstr);
      if (value !== '') {
        result[prefix][key] = value;
        translated.add(slot);
      } else if (!translated.has(slot)) {
        result[prefix][key] = unescapeValue(msgid);
      }
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
    if (ctxVal !== null) {
      ctx = ctxVal;
      continue;
    }

    // msgid_plural (must check before msgid)
    const pluralVal = extractQuoted(trimmed, 'msgid_plural');
    if (pluralVal !== null) {
      msgidPlural = pluralVal;
      continue;
    }

    // msgid
    const idVal = extractQuoted(trimmed, 'msgid');
    if (idVal !== null) {
      if (msgid !== null) flush();
      msgid = idVal;
      continue;
    }

    // msgstr[N]
    const pluralMatch = trimmed.match(/^msgstr\[(\d+)\]\s+"(.*)"/);
    if (pluralMatch) {
      msgstrPlural[parseInt(pluralMatch[1])] = pluralMatch[2];
      continue;
    }

    // msgstr (singular)
    const strVal = extractQuoted(trimmed, 'msgstr');
    if (strVal !== null) {
      msgstr = strVal;
      continue;
    }
  }

  // Flush last entry
  flush();

  return result;
}
