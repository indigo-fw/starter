
// ─── NSFW keyword set ───────────────────────────────────────────────────────

const NSFW_KEYWORDS = new Set([
  'nsfw', 'explicit', 'adult', 'nude', 'naked', 'sexual', 'vagina', 'penis',
  'porn', 'pussy', 'blowjob', 'sex', 'cumshot', 'creampie', 'bondage', 'bdsm',
  'latex', 'lingerie', 'genital', 'shibari', 'deepthroat', 'footjob', 'paizuri',
  'analsex', 'missionary', 'doggystyle', 'cowgirl', 'spooning', 'facial', 'orgasm',
  'bukkake', 'peeing', 'topless', 'bottomless', 'stripper', 'striptease', 'dildo',
  'vibrator', 'handcuff', 'whip', 'collar', 'leash', 'spanking', 'choking',
  'titjob', 'handjob', 'fingering', 'masturbation', 'erotic', 'seductive',
  'provocative', 'sensual', 'aroused', 'horny', 'moan', 'pleasure', 'climax',
  'orgasmic', 'intimate', 'foreplay', 'undressing', 'thong', 'g-string',
  'nipple', 'breast', 'ass', 'butt', 'boob', 'tit', 'clit', 'dick', 'cock',
]);

/**
 * Detect if image generation should be NSFW based on keywords and custom text.
 * Uses the keyword_context from the orchestration pipeline.
 */
export function detectNsfw(
  keywords: string[],
  customText?: string,
): boolean {
  // Check keywords against NSFW set
  for (const kw of keywords) {
    if (NSFW_KEYWORDS.has(kw.toLowerCase())) return true;
  }

  // Check custom text
  if (customText) {
    for (const word of NSFW_KEYWORDS) {
      const re = new RegExp(`\\b${word}\\b`, 'i');
      if (re.test(customText)) return true;
    }
  }

  return false;
}

// ─── Sexual context keywords (for outfit coverage decisions) ────────────────

const SEXUAL_CONTEXT = new Set([
  'sex', 'nude', 'naked', 'vagina', 'penis', 'pussy', 'cock', 'dick',
  'blowjob', 'deepthroat', 'handjob', 'footjob', 'titjob', 'fingering',
  'masturbation', 'orgasm', 'cumshot', 'creampie', 'anal', 'missionary',
  'doggystyle', 'cowgirl', 'spooning', 'facial', 'bukkake', 'undressing',
  'striptease', 'topless', 'bottomless', 'nsfw',
]);

export function hasSexualContext(keywords: string[]): boolean {
  return keywords.some((kw) => SEXUAL_CONTEXT.has(kw.toLowerCase()));
}
