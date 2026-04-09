#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const ts = require('typescript');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

const NAMESPACE_DELIMITER = '###__$$$';

// Locales — keep in sync with src/lib/constants.ts
const LOCALES = ['en', 'de', 'es', 'fr', 'pt', 'it', 'nl', 'pl', 'cs', 'tr', 'ja', 'ko', 'sv', 'da', 'nb', 'fi'];

// Paths that classify a file as "admin" (everything else → public)
const ADMIN_PATH_PREFIXES = [
  'src/app/dashboard/',
  'src/components/admin/',
  'src/config/',
  'src/engine/',
];

function isAdminFile(filePath) {
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return ADMIN_PATH_PREFIXES.some((prefix) =>
    rel.startsWith(prefix.replace(/\\/g, '/'))
  );
}

// Create .po file header
function createPoHeader(locale, timestamp) {
  const now = timestamp || new Date().toISOString();
  return `msgid ""
msgstr ""
"Project-Id-Version: indigo\\n"
"Report-Msgid-Bugs-To: \\n"
"POT-Creation-Date: ${now}\\n"
"PO-Revision-Date: ${now}\\n"
"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"
"Language-Team: ${locale}\\n"
"Language: ${locale}\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
`;
}

// Convert a translation entry to .po format with context
function formatPoEntryWithContext(key, value = '', context = '', plural = null) {
  const escapedKey = key.replace(/"/g, '\\"');
  const escapedValue = value.replace(/"/g, '\\"');
  const contextLine = context ? `msgctxt "${context}"\n` : '';

  if (plural) {
    const escapedPlural = plural.replace(/"/g, '\\"');
    return `${contextLine}msgid "${escapedKey}"
msgid_plural "${escapedPlural}"
msgstr[0] "${escapedValue}"
msgstr[1] "${escapedPlural}"
`;
  }

  return `${contextLine}msgid "${escapedKey}"
msgstr "${escapedValue}"
`;
}

// Format a commented-out translation entry with context
function formatCommentedOutEntryWithContext(key, value = '', context = '') {
  const escapedKey = key.replace(/"/g, '\\"');
  const escapedValue = value.replace(/"/g, '\\"');
  const contextLine = context ? `#~ msgctxt "${context}"\n` : '';

  return `
#. REMOVED FROM CODE - PRESERVED FOR REFERENCE
${contextLine}#~ msgid "${escapedKey}"
#~ msgstr "${escapedValue}"
`;
}

// Parse existing PO file to extract current translations.
async function readExistingTranslations(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const content = await readFileAsync(filePath, 'utf8');
    const entries = {};
    const commentedEntries = {};

    const activeRegex =
      /(?:msgctxt "((?:\\.|[^"\\])*)"\r?\n)?msgid "((?:\\.|[^"\\])*)"\r?\nmsgstr "((?:\\.|[^"\\])*)"/gs;
    const commentedRegex =
      /(?:#~ msgctxt "((?:\\.|[^"\\])*)"\r?\n)?#~ msgid "((?:\\.|[^"\\])*)"\r?\n#~ msgstr "((?:\\.|[^"\\])*)"/gs;

    function compositeKey(context, msgid) {
      return context ? `${context}${NAMESPACE_DELIMITER}${msgid}` : msgid;
    }

    let match;
    while ((match = activeRegex.exec(content)) !== null) {
      const context = match[1] ? match[1].replace(/\\"/g, '"') : '';
      const msgid = match[2].replace(/\\"/g, '"');
      const msgstr = match[3].replace(/\\"/g, '"');

      if (msgid !== '') {
        entries[compositeKey(context, msgid)] = msgstr;
      }
    }

    while ((match = commentedRegex.exec(content)) !== null) {
      const context = match[1] ? match[1].replace(/\\"/g, '"') : '';
      const msgid = match[2].replace(/\\"/g, '"');
      const msgstr = match[3].replace(/\\"/g, '"');

      if (msgid !== '') {
        commentedEntries[compositeKey(context, msgid)] = msgstr;
      }
    }

    return { active: entries, commented: commentedEntries };
  } catch (error) {
    console.error(
      `Error reading existing translations from ${filePath}:`,
      error
    );
    return { active: {}, commented: {} };
  }
}

// Recursively find all files in a directory
async function findFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory()
        ? findFiles(res, extensions)
        : extensions.includes(path.extname(res))
          ? res
          : [];
    })
  );
  return files.flat();
}

// Extract string literal value from node if it's a literal
function getStringLiteralValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

// Translation function names we recognize
const TRANSLATION_FUNCTIONS = new Set([
  'useAdminTranslations',
  // useBlankTranslations removed — renamed to useAdminTranslations above
  'useTranslations',
  'getTranslations',
  'getServerTranslations',
  'dataTranslations',
]);

// Extract translations from a file using TypeScript Compiler API
async function extractTranslationsFromFile(filePath) {
  try {
    const content = await readFileAsync(filePath, 'utf8');
    const translations = {};

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Track variables that are assigned the result of a translation function
    const translationFunctions = new Map();

    // Common names for translation functions received as parameters/props
    const TRANSLATION_PARAM_NAMES = new Set(['__', 't', 'translate']);

    function visit(node) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
      );

      // Track function/arrow parameters named __ / t / translate
      // Handles: function Foo({ __ }: Props) and ({ __ }: Props) => ...
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        for (const param of node.parameters) {
          // Destructured: function Foo({ __, ... })
          if (ts.isObjectBindingPattern(param.name)) {
            for (const element of param.name.elements) {
              if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                if (TRANSLATION_PARAM_NAMES.has(element.name.text)) {
                  translationFunctions.set(element.name.text, '');
                }
              }
              // Handle rename: { __: t }
              if (ts.isBindingElement(element) && element.propertyName && ts.isIdentifier(element.propertyName)) {
                if (TRANSLATION_PARAM_NAMES.has(element.propertyName.text) && ts.isIdentifier(element.name)) {
                  translationFunctions.set(element.name.text, '');
                }
              }
            }
          }
          // Direct: function Foo(__, ...)
          if (ts.isIdentifier(param.name) && TRANSLATION_PARAM_NAMES.has(param.name.text)) {
            translationFunctions.set(param.name.text, '');
          }
        }
      }

      // Track variable declarations assigned to translation functions
      if (ts.isVariableDeclaration(node) && node.initializer) {
        let callExpression = node.initializer;

        // Handle await expressions (e.g., await getTranslations('cms'))
        if (ts.isAwaitExpression(node.initializer)) {
          callExpression = node.initializer.expression;
        }

        if (
          ts.isCallExpression(callExpression) &&
          ts.isIdentifier(callExpression.expression) &&
          TRANSLATION_FUNCTIONS.has(callExpression.expression.text)
        ) {
          if (ts.isIdentifier(node.name)) {
            let namespace = '';
            if (callExpression.arguments.length > 0) {
              namespace =
                getStringLiteralValue(callExpression.arguments[0]) || '';
            }
            translationFunctions.set(node.name.text, namespace);
          }
        }
      }

      // Track destructuring assignments from translation functions
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        TRANSLATION_FUNCTIONS.has(node.initializer.expression.text)
      ) {
        let namespace = '';
        if (node.initializer.arguments.length > 0) {
          namespace =
            getStringLiteralValue(node.initializer.arguments[0]) || '';
        }

        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
              translationFunctions.set(element.name.text, namespace);
            }
          }
        }
      }

      // Check for translation function calls via tracked variables
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        translationFunctions.has(node.expression.text) &&
        node.arguments.length
      ) {
        const keyNode = node.arguments[0];
        const key = getStringLiteralValue(keyNode);
        const namespace = translationFunctions.get(node.expression.text);

        if (key) {
          let defaultValue = key;

          if (node.arguments.length > 1) {
            const defaultNode = node.arguments[1];
            const defaultVal = getStringLiteralValue(defaultNode);
            if (defaultVal) {
              defaultValue = defaultVal;
            }
          }

          const fullKey = namespace
            ? `${namespace}${NAMESPACE_DELIMITER}${key}`
            : key;

          if (!translations[fullKey]) {
            translations[fullKey] = { value: defaultValue, references: [] };
          }
          translations[fullKey].references.push(
            `${makeRelativePath(filePath)}:${line + 1}`
          );
        }
      }

      // Check for useTranslations()('key') or similar chained calls
      if (
        ts.isCallExpression(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        TRANSLATION_FUNCTIONS.has(node.expression.expression.text) &&
        node.arguments.length
      ) {
        let namespace = '';
        if (node.expression.arguments.length > 0) {
          namespace = getStringLiteralValue(node.expression.arguments[0]) || '';
        }

        const keyNode = node.arguments[0];
        const key = getStringLiteralValue(keyNode);

        if (key) {
          const fullKey = namespace
            ? `${namespace}${NAMESPACE_DELIMITER}${key}`
            : key;
          if (!translations[fullKey]) {
            translations[fullKey] = { value: key, references: [] };
          }
          translations[fullKey].references.push(
            `${makeRelativePath(filePath)}:${line + 1}`
          );
        }
      }

      // Check for __._n('singular', 'plural', count) calls (plural translations)
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === '_n' &&
        ts.isIdentifier(node.expression.expression) &&
        translationFunctions.has(node.expression.expression.text) &&
        node.arguments.length >= 2
      ) {
        const singularKey = getStringLiteralValue(node.arguments[0]);
        const pluralKey = getStringLiteralValue(node.arguments[1]);
        const namespace = translationFunctions.get(node.expression.expression.text);

        if (singularKey && pluralKey) {
          const fullKey = namespace
            ? `${namespace}${NAMESPACE_DELIMITER}${singularKey}`
            : singularKey;

          if (!translations[fullKey]) {
            translations[fullKey] = { value: singularKey, references: [], plural: pluralKey };
          } else {
            translations[fullKey].plural = pluralKey;
          }
          translations[fullKey].references.push(
            `${makeRelativePath(filePath)}:${line + 1}`
          );
        }
      }

      // Check for __._x('key', 'context') calls (context translations)
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === '_x' &&
        ts.isIdentifier(node.expression.expression) &&
        translationFunctions.has(node.expression.expression.text) &&
        node.arguments.length >= 2
      ) {
        const key = getStringLiteralValue(node.arguments[0]);
        const context = getStringLiteralValue(node.arguments[1]);
        const namespace = translationFunctions.get(node.expression.expression.text);

        if (key && context) {
          // Encode context into namespace: "General::verb"
          const ctxNamespace = `${namespace || 'General'}::${context}`;
          const fullKey = `${ctxNamespace}${NAMESPACE_DELIMITER}${key}`;

          if (!translations[fullKey]) {
            translations[fullKey] = { value: key, references: [], context };
          }
          translations[fullKey].references.push(
            `${makeRelativePath(filePath)}:${line + 1}`
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return translations;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return {};
  }
}

function makeRelativePath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

// Write a .po file for a given locale and set of translations
async function writePoFile(outputPath, locale, allTranslations) {
  const {
    active: existingTranslations = {},
    commented: existingCommentedTranslations = {},
  } = await readExistingTranslations(outputPath);

  console.log(
    `  Found ${Object.keys(existingTranslations).length} existing translations for ${locale}`
  );

  let poContent = '';
  let hasChanges = false;

  const removedKeys = new Set([
    ...Object.keys(existingTranslations),
    ...Object.keys(existingCommentedTranslations),
  ]);

  for (const [key, { value: defaultValue, references, plural }] of Object.entries(
    allTranslations
  )) {
    const [context, actualKey] = key.includes(NAMESPACE_DELIMITER)
      ? key.split(NAMESPACE_DELIMITER, 2)
      : ['', key];

    removedKeys.delete(key);

    const translationValue =
      key in existingTranslations
        ? existingTranslations[key]
        : defaultValue;

    if (
      !(key in existingTranslations) ||
      existingTranslations[key] !== translationValue ||
      (plural && !(key in existingTranslations)) ||  // new plural entry
      (context && !(key in existingTranslations))     // new context entry
    ) {
      hasChanges = true;
    }

    const referenceLines = references
      .map(
        (ref) =>
          `#: ${makeRelativePath(ref.split(':')[0])}:${ref.split(':')[1]}`
      )
      .join('\n');
    const poEntry = `
${referenceLines}
${formatPoEntryWithContext(actualKey, translationValue, context, plural)}`;
    poContent += poEntry;
  }

  // Add commented-out entries for removed keys
  for (const key of removedKeys) {
    const value =
      existingTranslations[key] || existingCommentedTranslations[key] || '';
    const [context, actualKey] = key.includes(NAMESPACE_DELIMITER)
      ? key.split(NAMESPACE_DELIMITER, 2)
      : ['', key];
    const commentedEntry = formatCommentedOutEntryWithContext(
      actualKey,
      value,
      context
    );

    const existingCommentedEntry = formatCommentedOutEntryWithContext(
      actualKey,
      existingCommentedTranslations[key] || '',
      context
    );

    if (commentedEntry.trim() !== existingCommentedEntry.trim()) {
      poContent += commentedEntry;
      hasChanges = true;
    } else {
      poContent += existingCommentedEntry;
    }
  }

  if (removedKeys.size > 0) {
    console.log(
      `  Preserved ${removedKeys.size} commented-out translations for ${locale}`
    );
  }

  if (hasChanges || !fs.existsSync(outputPath)) {
    const timestamp = hasChanges ? null : extractTimestamp(outputPath);
    poContent = createPoHeader(locale, timestamp) + poContent;
    await writeFileAsync(outputPath, poContent, 'utf8');
    console.log(`  Generated ${outputPath}`);
  } else {
    console.log(`  No changes detected for ${locale}, skipping.`);
  }
}

// Main function to generate .po files
async function generatePoFiles() {
  const srcDir = path.resolve('./src');
  const adminDir = path.resolve('./locales/admin');
  const publicDir = path.resolve('./locales/public');

  // Ensure output directories exist
  await mkdirAsync(adminDir, { recursive: true });
  await mkdirAsync(publicDir, { recursive: true });

  // Find all source files
  const files = await findFiles(srcDir);
  console.log(`Found ${files.length} files to scan for translations.`);

  // Collect translations split by admin/public
  const adminTranslations = {};
  const publicTranslations = {};

  for (const file of files) {
    const fileTranslations = await extractTranslationsFromFile(file);
    const target = isAdminFile(file) ? adminTranslations : publicTranslations;

    for (const [key, entry] of Object.entries(fileTranslations)) {
      if (!target[key]) {
        target[key] = { value: entry.value, references: [] };
      }
      if (entry.plural) target[key].plural = entry.plural;
      if (entry.context) target[key].context = entry.context;
      target[key].references.push(...entry.references);
    }
  }

  console.log(
    `Found ${Object.keys(adminTranslations).length} admin keys, ${Object.keys(publicTranslations).length} public keys.`
  );

  // Generate .po files for each locale
  for (const locale of LOCALES) {
    console.log(`\nProcessing locale: ${locale}`);

    const adminPath = path.join(adminDir, `${locale}.po`);
    const publicPath = path.join(publicDir, `${locale}.po`);

    console.log('  Admin:');
    await writePoFile(adminPath, locale, adminTranslations);

    console.log('  Public:');
    await writePoFile(publicPath, locale, publicTranslations);
  }

  console.log('\nPO file generation completed successfully.');
}

// Extract timestamp from existing .po file
function extractTimestamp(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/"POT-Creation-Date: (.*?)\\n"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error(`Error extracting timestamp from ${filePath}:`, error);
    return null;
  }
}

generatePoFiles().catch((error) => {
  console.error('Error generating PO files:', error);
  process.exit(1);
});
