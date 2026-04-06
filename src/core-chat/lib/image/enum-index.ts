import type { EnumEntry, EnumMatch } from './types';
import { MATCH_SCORE, FUZZY_MATCH_CUTOFF, FUZZY_MATCH_MIN_LENGTH } from './types';

// ─── Keyword index for O(1) trait matching ──────────────────────────────────

type KeywordIndex = Map<string, Array<{ entry: EnumEntry; enumType: string }>>;

let _index: KeywordIndex | null = null;

/**
 * Build the keyword index from visual enum entries.
 * Called once at startup.
 */
export function buildEnumIndex(categories: Array<{
  type: string;
  entries: EnumEntry[];
}>): void {
  _index = new Map();

  for (const category of categories) {
    for (const entry of category.entries) {
      for (const tag of entry.tags ?? []) {
        if (tag === 'nsfw' || tag === 'nofill' || tag === 'prefill') continue;
        const key = tag.toLowerCase();
        if (!_index.has(key)) _index.set(key, []);
        _index.get(key)!.push({ entry, enumType: category.type });
      }
    }
  }
}

/**
 * Find all scored matches for keywords.
 * Returns keyword → EnumMatch[].
 */
export function findAllMatches(
  keywords: string[],
  genderId?: number,
): Map<string, EnumMatch[]> {
  if (!_index) throw new Error('Enum index not built. Call buildEnumIndex() at startup.');

  const results = new Map<string, EnumMatch[]>();
  const entryScores = new Map<string, number>();

  for (const keyword of keywords) {
    const matches: EnumMatch[] = [];

    const exact = _index.get(keyword.toLowerCase());
    if (exact) {
      for (const { entry, enumType } of exact) {
        if (genderId && entry.gender && entry.gender !== genderId) continue;
        const key = `${enumType}:${entry.id}`;
        const currentScore = (entryScores.get(key) ?? 0) + MATCH_SCORE;
        entryScores.set(key, currentScore);
        matches.push({ enumType, entryId: entry.id, keyword, score: currentScore });
      }
    }

    if (matches.length === 0 && keyword.length >= FUZZY_MATCH_MIN_LENGTH) {
      for (const [tag, entries] of _index) {
        if (similarity(keyword, tag) >= FUZZY_MATCH_CUTOFF) {
          for (const { entry, enumType } of entries) {
            if (genderId && entry.gender && entry.gender !== genderId) continue;
            matches.push({ enumType, entryId: entry.id, keyword, score: MATCH_SCORE * 0.8 });
          }
        }
      }
    }

    if (matches.length > 0) results.set(keyword, matches);
  }

  return results;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}
