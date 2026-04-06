/**
 * Simple content moderation — blocked-word matching.
 *
 * Checks input text against a list of blocked words/phrases.
 * Case-insensitive, matches whole words only.
 */

export interface ModerationResult {
  /** Whether the content passed moderation */
  ok: boolean;
  /** Whether the content was blocked (inverse of ok) */
  blocked: boolean;
  /** Matched blocked words (if any) */
  matched: string[];
}

/**
 * Check text content against a blocked-word list.
 * Returns `{ ok: true }` if no blocked words found.
 */
export function checkContent(text: string, blockedWords: string[]): ModerationResult {
  if (!text || blockedWords.length === 0) {
    return { ok: true, blocked: false, matched: [] };
  }

  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const word of blockedWords) {
    const lowerWord = word.toLowerCase();
    // Multi-word phrases: simple includes check
    if (lowerWord.includes(' ')) {
      if (lower.includes(lowerWord)) {
        matched.push(word);
      }
    } else {
      // Single word: word-boundary match
      const re = new RegExp(`\\b${escapeRegExp(lowerWord)}\\b`, 'i');
      if (re.test(lower)) {
        matched.push(word);
      }
    }
  }

  return { ok: matched.length === 0, blocked: matched.length > 0, matched };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
