// ─── Content moderation ─────────────────────────────────────────────────────
// Keyword-based filter (sync, fast) + optional external hook (async).

export interface ModerationResult {
  passed: boolean;
  action: 'allow' | 'block' | 'flag';
  reason?: string;
  originalContent?: string;
}

/**
 * Synchronous keyword-based moderation. Fast, runs inline.
 * Uses word-boundary regex matching.
 */
export function moderateByKeywords(
  content: string,
  keywords: string[],
  action: 'block' | 'flag',
): ModerationResult {
  if (keywords.length === 0) return { passed: true, action: 'allow' };

  const matched: string[] = [];
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(content)) {
      matched.push(kw);
    }
  }

  if (matched.length === 0) return { passed: true, action: 'allow' };

  return {
    passed: false,
    action,
    reason: `Matched keywords: ${matched.join(', ')}`,
    originalContent: content,
  };
}

/**
 * Full moderation pipeline: keywords first, then optional external.
 */
export async function moderateContent(
  content: string,
  config: { keywords: string[]; action: 'block' | 'flag' },
  externalModerate?: (content: string, userId: string) => Promise<ModerationResult | null>,
  userId?: string,
): Promise<ModerationResult> {
  // Step 1: keyword filter (sync, fast)
  const keywordResult = moderateByKeywords(content, config.keywords, config.action);
  if (!keywordResult.passed) return keywordResult;

  // Step 2: external moderation (async, optional)
  if (externalModerate && userId) {
    try {
      const extResult = await externalModerate(content, userId);
      if (extResult && !extResult.passed) return extResult;
    } catch {
      // External moderation failure should not block the message
    }
  }

  return { passed: true, action: 'allow' };
}
