# Translation Module (`src/server/translation/`)

DeepL-powered translation with DB-level caching. Ported from sai_flirtcam.

**Currently disabled** — only EN is enabled in `DEEPL_ENABLED_LANGUAGES`. To enable: uncomment language entries in `deepl-languages.ts`. Everything cascades automatically via `hasTranslationLanguages` and `isValidDeepLLang()`.

## Architecture

- **`deepl-client.ts`** — `translateWithDeepL(text, targetLang, sourceLang)` calls DeepL REST API (free or pro based on `DEEPL_API_FREE` env, 10s timeout). `detectLanguageWithDeepL(text)` auto-detects language (5s timeout, returns null on failure).
- **`translation-service.ts`** — `translate(text, targetLang, sourceLang='en')` is the main entry point. No-op when `DEEPL_API_KEY` unset or same language. DB-cached via `cms_translations` table: SHA-256 hash of `langFrom|langTo|text` as lookup key.
- **`deepl-languages.ts`** — Central kill switch. `DEEPL_ENABLED_LANGUAGES` array, `hasTranslationLanguages` flag, validation helpers.

## Key Exports

| Export | Source | Purpose |
|--------|--------|---------|
| `translate()` | `translation-service.ts` | Main entry — translate text with caching |
| `translateWithDeepL()` | `deepl-client.ts` | Raw DeepL API call (no cache) |
| `detectLanguageWithDeepL()` | `deepl-client.ts` | Auto-detect language |
| `DEEPL_ENABLED_LANGUAGES` | `deepl-languages.ts` | Active language list (kill switch) |
| `hasTranslationLanguages` | `deepl-languages.ts` | `false` when only EN enabled |
| `isValidDeepLLang(code)` | `deepl-languages.ts` | Check enabled languages |
| `isKnownDeepLLang(code)` | `deepl-languages.ts` | Check all 32 codes |
| `getDeepLLanguageName(code)` | `deepl-languages.ts` | English name or null |
| `mapSourceToTargetLang(code)` | `deepl-languages.ts` | Convert detection codes to target codes |

## Env Vars

- `DEEPL_API_KEY` — optional, translation is no-op without it
- `DEEPL_API_FREE` — `true` (default) uses free API endpoint, `false` uses pro

## Gotchas

- DeepL source codes differ from target codes for PT and ZH — use `mapSourceToTargetLang()` after detection
- `translate()` silently returns original text when `DEEPL_API_KEY` is unset
- Detection caps input to 500 chars to minimize API cost
