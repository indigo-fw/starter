import { translateWithDeepL } from './deepl-client';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';

import { env } from '@/lib/env';
import { db } from '@/server/db';
import { cmsTranslations } from '@/server/db/schema';

function computeHash(langFrom: string, langTo: string, text: string): string {
  return createHash('sha256')
    .update(`${langFrom}|${langTo}|${text}`)
    .digest('hex');
}

export async function translate(
  text: string,
  targetLang: string,
  sourceLang = 'en'
): Promise<string> {
  if (!env.DEEPL_API_KEY) {
    return text;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  // No-op: skip translation when source and target are the same language
  const normalFrom = sourceLang.toUpperCase();
  const normalTo = targetLang.toUpperCase();
  if (normalFrom === normalTo) return text;
  if (normalFrom.startsWith('EN') && normalTo.startsWith('EN')) return text;

  const langFrom = sourceLang.toLowerCase();
  const langTo = targetLang.toLowerCase();
  const hash = computeHash(langFrom, langTo, trimmed);

  const cached = await db.query.cmsTranslations.findFirst({
    where: eq(cmsTranslations.hash, hash),
  });

  if (cached) {
    return cached.textTranslated;
  }

  const translated = await translateWithDeepL(trimmed, langTo, langFrom);

  // `hash` is unique and concurrent cache-misses are routine: duplicateAsTranslation
  // translates several fields in one Promise.all, and identical strings (e.g.
  // title === seoTitle) share a hash. Without the conflict clause the loser's
  // insert throws 23505 and createFieldTranslator falls back to the untranslated
  // source. Both callers hold DeepL output for the same input, so we keep ours.
  await db
    .insert(cmsTranslations)
    .values({
      hash,
      langFrom,
      langTo,
      textOriginal: trimmed,
      textTranslated: translated,
    })
    .onConflictDoNothing({ target: cmsTranslations.hash });

  return translated;
}
