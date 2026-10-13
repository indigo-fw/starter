# Translation Module

DeepL-powered translation with DB-level caching. **Currently disabled** — only EN in `DEEPL_ENABLED_LANGUAGES`. To enable: uncomment languages in `deepl-languages.ts`.

- `translate(text, targetLang, sourceLang)` — main entry, DB-cached (SHA-256 hash key). No-op without `DEEPL_API_KEY`
- `translateWithDeepL()` — raw API call. `detectLanguageWithDeepL()` — auto-detect (caps input to 500 chars)
- `DEEPL_ENABLED_LANGUAGES` / `hasTranslationLanguages` — central kill switch
- Env: `DEEPL_API_KEY` (optional), `DEEPL_API_FREE` (default `true`)

**Gotcha:** DeepL source codes differ from target codes for PT and ZH — use `mapSourceToTargetLang()` after detection.

## Spend rules (DeepL bills per character)

- **Never translate user-generated content speculatively.** Translate on an explicit request (a button, a stored per-user language preference) — never "in case". A feed of UGC translated into every enabled locale is the fastest way to exhaust a quota.
- **Translate templates, not interpolated strings.** `Hello {name}, your order {id} shipped` is one cache hit forever; `Hello Ana, your order 4821 shipped` is a new paid call per user. Keep placeholders out of the translated text (DeepL's `tag_handling: 'xml'` with an ignored `<x>` tag around slots) and interpolate after.
- **Check the cache before spending.** Compute the same hash the cache uses and look it up first, so a retry or a re-render never pays twice; cap input length before every call.
