# Translation Module

DeepL-powered translation with DB-level caching. **Currently disabled** — only EN in `DEEPL_ENABLED_LANGUAGES`. To enable: uncomment languages in `deepl-languages.ts`.

- `translate(text, targetLang, sourceLang)` — main entry, DB-cached (SHA-256 hash key). No-op without `DEEPL_API_KEY`
- `translateWithDeepL()` — raw API call. `detectLanguageWithDeepL()` — auto-detect (caps input to 500 chars)
- `DEEPL_ENABLED_LANGUAGES` / `hasTranslationLanguages` — central kill switch
- Env: `DEEPL_API_KEY` (optional), `DEEPL_API_FREE` (default `true`)

**Gotcha:** DeepL source codes differ from target codes for PT and ZH — use `mapSourceToTargetLang()` after detection.
