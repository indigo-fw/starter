# Locales — CLAUDE.md

PO files: `locales/admin/*.po` (dashboard) + `locales/public/*.po` (frontend). Compiled JSON in `locales/build/` is gitignored — `bun run init` compiles it on fresh installs.

- **Pipeline:** `bun run i18n` — extract strings from source → compile PO → JSON.
- **Machine translation:** `bun run i18n:translate` — DeepL, only locales enabled in `LOCALES` (`src/lib/constants.ts`); needs a DeepL key in env. Explicit target bypasses the filter: `bun run i18n:translate fr`.
- After changing any `__('…')` source string, re-run the pipeline — untranslated msgids fall back to English at runtime.
- Locale routing/fallback rules live in `src/app/CLAUDE.md`.
