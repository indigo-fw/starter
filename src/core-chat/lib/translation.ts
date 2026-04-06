import { createLogger } from '@/core/lib/logger';

const logger = createLogger('chat-translation');

/**
 * Translate text using DeepL API.
 * Returns original text if DEEPL_API_KEY is not configured or translation fails.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<string> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) return text;

  const isPro = !apiKey.endsWith(':fx');
  const baseUrl = isPro
    ? 'https://api.deepl.com/v2/translate'
    : 'https://api-free.deepl.com/v2/translate';

  try {
    const params = new URLSearchParams({
      text,
      target_lang: mapToDeepLLang(targetLang),
      auth_key: apiKey,
    });
    if (sourceLang) params.set('source_lang', mapToDeepLLang(sourceLang));

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      logger.warn('DeepL translation failed', { status: response.status });
      return text;
    }

    const data = await response.json() as {
      translations?: Array<{ text: string; detected_source_language?: string }>;
    };

    return data.translations?.[0]?.text ?? text;
  } catch (err) {
    logger.error('DeepL error', { error: err instanceof Error ? err.message : String(err) });
    return text;
  }
}

/**
 * Detect language of text using DeepL.
 * Returns ISO 639-1 code or null.
 */
export async function detectLanguage(text: string): Promise<string | null> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) return null;

  const isPro = !apiKey.endsWith(':fx');
  const baseUrl = isPro
    ? 'https://api.deepl.com/v2/translate'
    : 'https://api-free.deepl.com/v2/translate';

  try {
    const params = new URLSearchParams({
      text: text.slice(0, 200),
      target_lang: 'EN',
      auth_key: apiKey,
    });

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      translations?: Array<{ detected_source_language?: string }>;
    };

    const detected = data.translations?.[0]?.detected_source_language?.toLowerCase();
    return detected ?? null;
  } catch {
    return null;
  }
}

/** Map short language codes to DeepL format */
function mapToDeepLLang(code: string): string {
  const map: Record<string, string> = {
    en: 'EN', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT-BR',
    nl: 'NL', pl: 'PL', ru: 'RU', ja: 'JA', zh: 'ZH', ko: 'KO',
    cs: 'CS', sk: 'SK', sv: 'SV', da: 'DA', fi: 'FI', hu: 'HU',
    ro: 'RO', bg: 'BG', el: 'EL', tr: 'TR',
  };
  return map[code.toLowerCase()] ?? code.toUpperCase();
}
