import { TRPCError } from '@trpc/server';

import { env } from '@/lib/env';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('DeepLClient');

interface DeepLTranslation {
  detected_source_language: string;
  text: string;
}

interface DeepLResponse {
  translations: DeepLTranslation[];
}

const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate';

export async function translateWithDeepL(
  text: string,
  targetLang: string,
  sourceLang: string
): Promise<string> {
  const apiKey = env.DEEPL_API_KEY;
  if (!apiKey) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'DEEPL_API_KEY is not configured',
    });
  }

  const baseUrl = env.DEEPL_API_FREE ? DEEPL_FREE_URL : DEEPL_PRO_URL;

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang.toUpperCase(),
      source_lang: sourceLang.toUpperCase(),
      tag_handling: 'html',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `DeepL API error ${response.status}: ${body}`,
    });
  }

  const data = (await response.json()) as DeepLResponse;
  const translated = data.translations[0]?.text;

  if (!translated) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'DeepL returned empty translation',
    });
  }

  return translated;
}

/**
 * Detect the language of a text using DeepL's auto-detection.
 * Sends a translate request to EN without specifying source_lang;
 * DeepL returns the detected source language code.
 * Returns the detected DeepL source code (e.g. "DE", "FR", "JA") or null on failure.
 */
export async function detectLanguageWithDeepL(
  text: string
): Promise<string | null> {
  const apiKey = env.DEEPL_API_KEY;
  if (!apiKey) return null;

  try {
    const baseUrl = env.DEEPL_API_FREE ? DEEPL_FREE_URL : DEEPL_PRO_URL;

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text.slice(0, 500)], // Cap text length for detection
        target_lang: 'EN',
        // No source_lang — DeepL auto-detects
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as DeepLResponse;
    const detected = data.translations[0]?.detected_source_language;
    return detected ?? null;
  } catch (error) {
    logger.warn('DeepL language detection failed', { error: String(error) });
    return null;
  }
}
