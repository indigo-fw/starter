/**
 * Trait selector and coverage completer for the keyword matching pipeline.
 * Ports Django's TraitSelector + CoverageCompleter, replacing PromptRenderFilter
 * with a data-driven contextTags system.
 *
 * Django sources:
 *   services/trait_selector.py
 *   services/coverage_completer.py
 *   processors/prompt_render_filter.py (REPLACED by contextTags)
 */
import { getContextTags } from './context-tags';
import {
  VISUAL_LIGHTING,
  VISUAL_LOCATION,
  VISUAL_OUTFIT,
  VISUAL_PERSPECTIVE,
} from '@/core-chat/lib/character/visual-enums';
import { Coverage } from './types';
import type { EnumEntry, EnumMatch, SelectedTraits } from './types';

// ---------------------------------------------------------------------------
// Lazy cached Maps (O(1) lookup instead of O(n) linear scan)
// ---------------------------------------------------------------------------
let cachedOutfitCoverage: Map<number, number | undefined> | null = null;

function getOutfitCoverageMap(): Map<number, number | undefined> {
  if (cachedOutfitCoverage) return cachedOutfitCoverage;
  cachedOutfitCoverage = new Map();
  for (const entry of Object.values(VISUAL_OUTFIT)) {
    cachedOutfitCoverage.set(
      entry.id,
      (entry as { coverage?: number }).coverage
    );
  }
  return cachedOutfitCoverage;
}

let cachedLocationPerspectives: Map<number, readonly string[]> | null = null;

function getLocationPerspectives(
  locationId: number
): readonly string[] | undefined {
  if (!cachedLocationPerspectives) {
    cachedLocationPerspectives = new Map();
    for (const entry of Object.values(VISUAL_LOCATION)) {
      const persp = (entry as { perspectives?: readonly string[] })
        .perspectives;
      if (persp) cachedLocationPerspectives.set(entry.id, persp);
    }
  }
  return cachedLocationPerspectives.get(locationId);
}

// ---------------------------------------------------------------------------
// Constants (ported from Django)
// ---------------------------------------------------------------------------

/** Score tolerance for random selection among near-equal candidates */
const SCORE_TOLERANCE = 0.15;

/** Probability of adding optional footwear */
const FOOTWEAR_PROBABILITY = 0.2;

/** Probability of adding optional jacket */
const JACKET_PROBABILITY = 0.1;

// Coverage constants imported from ./types as Coverage.UPPER, .LOWER, .FOOTWEAR, .JACKET

/** Keywords that indicate sexual/nude context (don't auto-add outfits) */
const SEXUAL_CONTEXT_KEYWORDS = new Set([
  'sex',
  'nude',
  'naked',
  'vagina',
  'penis',
  'blowjob',
  'masturbate',
  'footjob',
  'paizuri',
  'asshole',
  'analsex',
  'analplay',
  'missionary',
  'doggystyle',
  'cowgirl',
  'spooning',
  'cumshot',
  'creampie',
  'facial',
  'orgasm',
  'nsfw',
  'deepthroat',
  'squirt',
  'bukkake',
  'peeing',
  'handjob',
  'titjob',
  'anal',
  'penetration',
]);

// ---------------------------------------------------------------------------
// selectBestTraits
// ---------------------------------------------------------------------------

/**
 * Select best traits from scored enum matches.
 *
 * For each keyword's match list:
 * 1. Find top score
 * 2. Apply tolerance (0.15) — randomly pick from candidates within tolerance
 * 3. Sort selections by score (highest first)
 * 4. Process in order:
 *    - Single-value fields: first selection wins
 *    - Multi-value fields (outfits, accessories): allow multiple
 *    - Poses: only ONE allowed
 * 5. Unmatched keywords go to custom field
 */
export function selectBestTraits(
  matches: Map<string, EnumMatch[]>
): SelectedTraits {
  const selected: SelectedTraits = {
    outfits: [],
    accessories: [],
    poses: [],
  };

  // Collect all best selections from each keyword
  const selections: EnumMatch[] = [];

  for (const [, matchList] of matches) {
    if (matchList.length === 0) continue;

    // Find top score for this keyword
    const topScore = Math.max(...matchList.map((m) => m.score));
    const threshold = topScore - SCORE_TOLERANCE;

    // Filter candidates within tolerance, excluding colors (color info is
    // carried as colorId on item matches — standalone colors have no handler)
    const candidates = matchList.filter(
      (m) => m.score >= threshold && m.enumType !== 'colors'
    );
    if (candidates.length === 0) continue;

    // Randomly pick one
    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    selections.push(pick);
  }

  // Sort by score descending
  selections.sort((a, b) => b.score - a.score);

  // Track what's been assigned
  const usedEntries = new Set<string>();
  let hasPose = false;
  let coverageTotal = 0; // Track outfit coverage

  for (const sel of selections) {
    const entryKey = `${sel.enumType}:${sel.entryId}`;
    if (usedEntries.has(entryKey)) continue;

    switch (sel.enumType) {
      case 'outfits': {
        // Track coverage to prevent conflicts
        const coverage = getOutfitCoverage(sel.entryId);
        if (coverage === undefined) {
          // Full body outfit — exclusive, skip if any upper/lower already added
          if (coverageTotal > 0) continue;
          selected.outfits.push(sel.entryId);
          coverageTotal = 3;
        } else if (coverageTotal >= 3) {
          // Already have full body — only allow footwear/jacket additions
          if (coverage !== Coverage.FOOTWEAR && coverage !== Coverage.JACKET) {
            continue;
          }
          selected.outfits.push(sel.entryId);
        } else {
          selected.outfits.push(sel.entryId);
          if (coverage !== Coverage.FOOTWEAR && coverage !== Coverage.JACKET) {
            coverageTotal += coverage;
          }
        }
        if (sel.colorId !== undefined) {
          selected.outfitColors ??= {};
          selected.outfitColors[sel.entryId] = sel.colorId;
        }
        usedEntries.add(entryKey);
        break;
      }
      case 'accessories':
        selected.accessories.push(sel.entryId);
        if (sel.colorId !== undefined) {
          selected.accessoryColors ??= {};
          selected.accessoryColors[sel.entryId] = sel.colorId;
        }
        usedEntries.add(entryKey);
        break;
      case 'poses':
        if (!hasPose) {
          selected.poses.push(sel.entryId);
          hasPose = true;
          usedEntries.add(entryKey);
        }
        break;
      case 'expression':
        if (selected.expression === undefined) {
          selected.expression = sel.entryId;
          usedEntries.add(entryKey);
        }
        break;
      case 'location':
        if (selected.location === undefined) {
          selected.location = sel.entryId;
          usedEntries.add(entryKey);
        }
        break;
      case 'lighting':
        if (selected.lighting === undefined) {
          selected.lighting = sel.entryId;
          usedEntries.add(entryKey);
        }
        break;
      case 'perspective':
        if (selected.perspective === undefined) {
          selected.perspective = sel.entryId;
          usedEntries.add(entryKey);
        }
        break;
    }
  }

  return selected;
}

// ---------------------------------------------------------------------------
// completeCoverage — contextTag-aware gap filling
// ---------------------------------------------------------------------------

/**
 * Complete coverage gaps using contextTags for item compatibility.
 * Core principle: user-explicit selections are NEVER overridden.
 * Coverage only ADDS missing pieces using contextTags to pick compatible items.
 *
 * Algorithm:
 * 1. Collect contextTags from all selected traits into a contextBag
 * 2. If no location → pick location matching contextBag (prefill bedrooms as default)
 *    Enrich contextBag with location's tags so outfit scoring benefits
 * 3. If no outfits + sexual context → explicitly set gender-appropriate nude outfit
 *    If no outfits + normal context → pick SFW full-body or upper piece matching contextBag
 * 4. If outfits but incomplete coverage → add compatible upper/lower pieces
 *    Random footwear (20%) and jacket (10%) with contextTag compatibility
 * 5. Lighting — only set when explicitly matched from keywords or form
 */
export function completeCoverage(
  selected: SelectedTraits,
  genderId?: number,
  keywords?: string[]
): SelectedTraits {
  const result: SelectedTraits = {
    ...selected,
    outfits: [...selected.outfits],
    accessories: [...selected.accessories],
    poses: [...selected.poses],
  };

  // 1. Build context bag from all user-selected traits
  const contextBag = buildContextBag(result);

  // Check for sexual context
  const isSexualContext =
    keywords?.some((t) => SEXUAL_CONTEXT_KEYWORDS.has(t)) ?? false;

  // 2. Fill location FIRST so outfit scoring benefits from location tags
  if (result.location === undefined) {
    const location = pickCompatibleEntry('location', contextBag);
    if (location && contextBag.size > 0) {
      result.location = location.id;
    } else {
      // Prefer prefill-tagged bedrooms (curated safe defaults)
      const prefills = Object.values(VISUAL_LOCATION).filter((v) =>
        (v.tags as readonly string[] | undefined)?.includes('prefill')
      );
      if (prefills.length > 0) {
        result.location =
          prefills[Math.floor(Math.random() * prefills.length)].id;
      } else if (location) {
        result.location = location.id;
      }
    }
  }

  // Enrich contextBag with selected location's tags so outfit scoring benefits
  if (result.location !== undefined) {
    for (const tag of getContextTags('location', result.location)) {
      contextBag.add(tag);
    }
  }

  // Fill perspective from entry declarations (pose > location priority)
  if (result.perspective === undefined && result.location !== undefined) {
    const perspTags = getLocationPerspectives(result.location);
    if (perspTags && perspTags.length > 0) {
      const tagSet = new Set(perspTags);
      const matches = Object.values(VISUAL_PERSPECTIVE).filter((p) =>
        (p.tags as readonly string[]).some((t) => tagSet.has(t))
      );
      if (matches.length > 0) {
        result.perspective =
          matches[Math.floor(Math.random() * matches.length)].id;
      }
    }
  }

  // 3. Handle outfits (now with location context in contextBag)
  if (result.outfits.length === 0) {
    if (isSexualContext) {
      // Explicitly set gender-appropriate nude outfit
      const nude = findEntryByTag(
        VISUAL_OUTFIT as Record<string, EnumEntry>,
        'nude',
        genderId
      );
      if (nude) result.outfits = [nude.id];
    } else {
      // Pick a compatible SFW outfit (full-body or upper piece for variety)
      // Upper pieces get a matching lower added by coverage completion below
      const outfit = pickCompatibleEntry(
        'outfits',
        contextBag,
        genderId,
        (e) =>
          !e.tags?.includes('nsfw') &&
          (!e.coverage || e.coverage === Coverage.UPPER)
      );
      if (outfit) {
        result.outfits = [outfit.id];
      }
    }
  }

  // 4. Coverage completion — fill gaps for non-sexual contexts
  if (!isSexualContext && result.outfits.length > 0) {
    // 4. Check coverage completeness
    const coverageState = analyzeCoverage(result.outfits);

    if (!coverageState.hasUpper && !coverageState.isFullBody) {
      // Add upper body piece
      const upper = pickCompatibleEntry(
        'outfits',
        contextBag,
        genderId,
        (e) => e.coverage === Coverage.UPPER && !e.tags?.includes('nsfw')
      );
      if (upper) result.outfits.push(upper.id);
    }

    if (!coverageState.hasLower && !coverageState.isFullBody) {
      // Add lower body piece
      const lower = pickCompatibleEntry(
        'outfits',
        contextBag,
        genderId,
        (e) => e.coverage === Coverage.LOWER && !e.tags?.includes('nsfw')
      );
      if (lower) result.outfits.push(lower.id);
    }

    // Optional footwear
    if (!coverageState.hasFootwear && Math.random() < FOOTWEAR_PROBABILITY) {
      const footwear = pickCompatibleEntry(
        'outfits',
        contextBag,
        genderId,
        (e) => e.coverage === Coverage.FOOTWEAR
      );
      if (footwear) result.outfits.push(footwear.id);
    }

    // Optional jacket
    if (!coverageState.hasJacket && Math.random() < JACKET_PROBABILITY) {
      const jacket = pickCompatibleEntry(
        'outfits',
        contextBag,
        genderId,
        (e) => e.coverage === Coverage.JACKET && !e.tags?.includes('nsfw')
      );
      if (jacket) result.outfits.push(jacket.id);
    }
  }

  // 5. Lighting — no auto-fill, only set when explicitly matched from keywords or form

  return result;
}

// ---------------------------------------------------------------------------
// Context bag builder
// ---------------------------------------------------------------------------

/**
 * Collect contextTags from all user-selected traits into a Set.
 * e.g. user selected bikini (id:101) → contextBag = {outdoor, beach, hot}
 */
function buildContextBag(selected: SelectedTraits): Set<string> {
  const bag = new Set<string>();

  // Outfits
  for (const id of selected.outfits) {
    for (const tag of getContextTags('outfits', id)) bag.add(tag);
  }

  // Accessories
  for (const id of selected.accessories) {
    for (const tag of getContextTags('accessories', id)) bag.add(tag);
  }

  // Poses
  for (const id of selected.poses) {
    for (const tag of getContextTags('poses', id)) bag.add(tag);
  }

  // Single-value fields
  if (selected.expression !== undefined) {
    for (const tag of getContextTags('expression', selected.expression)) {
      bag.add(tag);
    }
  }
  if (selected.location !== undefined) {
    for (const tag of getContextTags('location', selected.location)) {
      bag.add(tag);
    }
  }
  if (selected.lighting !== undefined) {
    for (const tag of getContextTags('lighting', selected.lighting)) {
      bag.add(tag);
    }
  }

  return bag;
}

// ---------------------------------------------------------------------------
// Context tag overlap scoring
// ---------------------------------------------------------------------------

/**
 * Score how well an entry's contextTags overlap with the contextBag.
 * Uses raw overlap count (not normalized ratio) so entries with more
 * matching tags always beat entries with fewer, regardless of total tag count.
 * e.g. bedroom ['indoor','bedroom'] scores 2 vs cathedral ['indoor'] scores 1.
 * Returns 0 if no tags or empty bag.
 */
function contextScore(
  enumType: string,
  entryId: number,
  contextBag: Set<string>
): number {
  const entryTags = getContextTags(enumType, entryId);
  if (entryTags.length === 0 || contextBag.size === 0) return 0;
  let overlap = 0;
  for (const t of entryTags) {
    if (contextBag.has(t)) overlap++;
  }
  return overlap;
}

// ---------------------------------------------------------------------------
// Compatible entry pickers
// ---------------------------------------------------------------------------

/**
 * Pick an entry from an enum type that best matches the contextBag.
 * Filters by gender and a custom predicate.
 * Among entries with highest overlap, picks randomly.
 */
function pickCompatibleEntry(
  enumType: string,
  contextBag: Set<string>,
  genderId?: number,
  filter?: (entry: EnumEntry) => boolean
): EnumEntry | null {
  const enumObj = getEnumObject(enumType);
  if (!enumObj) return null;

  const candidates: { entry: EnumEntry; score: number }[] = [];

  for (const entry of Object.values(enumObj) as EnumEntry[]) {
    // Gender filter
    if (
      genderId &&
      entry.gender &&
      entry.gender !== 0 &&
      entry.gender !== genderId
    ) {
      continue;
    }

    // Exclude nofill-tagged entries (cosplay, occupational, themed, cultural, weird locations)
    if (entry.tags?.includes('nofill')) continue;

    // Custom filter
    if (filter && !filter(entry)) continue;

    const score = contextScore(enumType, entry.id, contextBag);
    candidates.push({ entry, score });
  }

  if (candidates.length === 0) return null;

  // Pick from highest-scoring candidates (if all score 0, picks randomly from all)
  const maxScore = Math.max(...candidates.map((c) => c.score));
  const best = candidates.filter((c) => c.score === maxScore);

  return best[Math.floor(Math.random() * best.length)].entry;
}

// ---------------------------------------------------------------------------
// Coverage analysis
// ---------------------------------------------------------------------------

interface CoverageState {
  isFullBody: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasFootwear: boolean;
  hasJacket: boolean;
}

/**
 * Analyze what body parts are covered by the selected outfits.
 */
function analyzeCoverage(outfitIds: number[]): CoverageState {
  const state: CoverageState = {
    isFullBody: false,
    hasUpper: false,
    hasLower: false,
    hasFootwear: false,
    hasJacket: false,
  };

  for (const id of outfitIds) {
    const coverage = getOutfitCoverage(id);
    if (coverage === undefined) {
      state.isFullBody = true;
    } else {
      switch (coverage) {
        case Coverage.UPPER:
          state.hasUpper = true;
          break;
        case Coverage.LOWER:
          state.hasLower = true;
          break;
        case Coverage.FOOTWEAR:
          state.hasFootwear = true;
          break;
        case Coverage.JACKET:
          state.hasJacket = true;
          break;
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get coverage value for an outfit entry by ID (O(1) via cached Map) */
function getOutfitCoverage(outfitId: number): number | undefined {
  const map = getOutfitCoverageMap();
  return map.has(outfitId) ? map.get(outfitId) : undefined;
}

/** Get enum object by type name */
function getEnumObject(enumType: string): Record<string, EnumEntry> | null {
  switch (enumType) {
    case 'outfits':
      return VISUAL_OUTFIT as Record<string, EnumEntry>;
    case 'location':
      return VISUAL_LOCATION as Record<string, EnumEntry>;
    case 'lighting':
      return VISUAL_LIGHTING as Record<string, EnumEntry>;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Render filter — context-aware trait modifications
// ---------------------------------------------------------------------------

/** BDSM-specific keywords that trigger lingerie outfit filler */
const BDSM_KEYWORDS = new Set([
  'bdsm',
  'shibari',
  'kinbaku',
  'rope',
  'bondage',
  'latex',
  'tied',
  'gagged',
  'ballgag',
]);

/** Food/fruit keywords that need safety context rewriting */
const FRUIT_KEYWORDS = new Set([
  'banana',
  'apple',
  'orange',
  'cucumber',
  'fruit',
]);

/** NSFW keywords consumed alongside fruit context (prevent misinterpretation) */
const FRUIT_CONSUMED_NSFW = new Set([
  'mouth',
  'in',
  'oral',
  'blowjob',
  'deepthroat',
]);

/**
 * Apply context-aware trait modifications AFTER coverage completion.
 *
 * 1. TOPLESS → remove upper body + jacket + full-body outfits, add SFW lower piece
 * 2. FRUIT → consume food+NSFW keywords, add "fruit adult" to custom
 * 3. UNDERBOOB → strip upper + full-body, add NSFW bra + lower piece
 * 4. BDSM → add lingerie outfit
 *
 * Only modifies system-generated traits (outfits added by completeCoverage).
 * User-explicitly-selected traits are preserved.
 *
 * Returns modified traits + filtered keywords (consumed keywords removed).
 */
export function applyRenderFilter(
  traits: SelectedTraits,
  keywords: string[],
  userSelectedOutfits: number[],
  genderId?: number
): { traits: SelectedTraits; keywords: string[] } {
  const result: SelectedTraits = {
    ...traits,
    outfits: [...traits.outfits],
    accessories: [...traits.accessories],
    poses: [...traits.poses],
  };
  let filteredKeywords = [...keywords];

  const kwSet = new Set(keywords.map((k) => k.toLowerCase()));

  // 1. TOPLESS → remove upper body + jacket + full-body outfits (system-generated only)
  if (kwSet.has('topless')) {
    const userOutfitSet = new Set(userSelectedOutfits);
    let needsLower = false;
    result.outfits = result.outfits.filter((id) => {
      if (userOutfitSet.has(id)) return true;
      const cov = getOutfitCoverage(id);
      if (cov === Coverage.UPPER || cov === Coverage.JACKET) return false;
      if (cov === undefined) {
        needsLower = true;
        return false;
      } // full-body
      return true;
    });
    if (
      needsLower &&
      !result.outfits.some((id) => getOutfitCoverage(id) === Coverage.LOWER)
    ) {
      const lower = pickRandomEntry(
        'outfits',
        genderId,
        (e) =>
          e.coverage === Coverage.LOWER &&
          !e.tags?.includes('nsfw') &&
          !e.tags?.includes('nofill')
      );
      if (lower) result.outfits.push(lower.id);
    }
  }

  // 2. FRUIT/FOOD → consume food + NSFW keywords, add safety context
  const hasFruit = filteredKeywords.some((k) =>
    FRUIT_KEYWORDS.has(k.toLowerCase())
  );
  if (hasFruit) {
    // Remove fruit keywords and related NSFW keywords
    filteredKeywords = filteredKeywords.filter(
      (k) =>
        !FRUIT_KEYWORDS.has(k.toLowerCase()) &&
        !FRUIT_CONSUMED_NSFW.has(k.toLowerCase())
    );
    // Add safety context
    result.custom = result.custom
      ? `${result.custom} fruit adult`
      : 'fruit adult';
  }

  // 3. UNDERBOOB → strip upper + full-body, add NSFW bra + lower piece
  if (kwSet.has('underboob')) {
    const userOutfitSet = new Set(userSelectedOutfits);
    let needsLower = false;
    // Strip system-generated upper + full-body
    result.outfits = result.outfits.filter((id) => {
      if (userOutfitSet.has(id)) return true;
      const cov = getOutfitCoverage(id);
      if (cov === Coverage.UPPER) return false;
      if (cov === undefined) {
        needsLower = true;
        return false;
      }
      return true;
    });
    // Add NSFW bra as upper replacement
    if (
      !result.outfits.some((id) => getOutfitCoverage(id) === Coverage.UPPER)
    ) {
      const bra = findEntryByTag(
        VISUAL_OUTFIT as Record<string, EnumEntry>,
        'bra',
        genderId,
        (e) => e.tags?.includes('nsfw') ?? false
      );
      if (bra) result.outfits.push(bra.id);
    }
    // Add lower piece if full-body was stripped
    if (
      needsLower &&
      !result.outfits.some((id) => getOutfitCoverage(id) === Coverage.LOWER)
    ) {
      const lower = pickRandomEntry(
        'outfits',
        genderId,
        (e) =>
          e.coverage === Coverage.LOWER &&
          !e.tags?.includes('nsfw') &&
          !e.tags?.includes('nofill')
      );
      if (lower) result.outfits.push(lower.id);
    }
  }

  // 4. BDSM → add lingerie outfit if no outfits selected
  const hasBdsm = filteredKeywords.some((k) =>
    BDSM_KEYWORDS.has(k.toLowerCase())
  );
  if (
    hasBdsm &&
    userSelectedOutfits.length === 0 &&
    result.outfits.length === 0
  ) {
    const lingerie = findEntryByTag(
      VISUAL_OUTFIT as Record<string, EnumEntry>,
      ['lingerie', 'thong', 'panties'],
      genderId
    );
    if (lingerie) result.outfits = [lingerie.id];
  }

  return { traits: result, keywords: filteredKeywords };
}

/**
 * Pick a random entry from an enum type matching gender + filter.
 * Simple helper (no contextBag scoring) for render filter rules.
 */
function pickRandomEntry(
  enumType: string,
  genderId?: number,
  filter?: (entry: EnumEntry) => boolean
): EnumEntry | null {
  const enumObj = getEnumObject(enumType);
  if (!enumObj) return null;
  const candidates = Object.values(enumObj).filter((entry) => {
    const e = entry as EnumEntry;
    if (genderId && e.gender && e.gender !== 0 && e.gender !== genderId)
      return false;
    if (filter && !filter(e)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)] as EnumEntry;
}

/**
 * Find a random entry matching a tag (or any of several tags), optionally
 * filtering by gender and a custom predicate.
 */
function findEntryByTag(
  enumObj: Record<string, EnumEntry>,
  tag: string | string[],
  genderId?: number,
  filter?: (entry: EnumEntry) => boolean
): EnumEntry | null {
  const tags = Array.isArray(tag) ? tag : [tag];
  const candidates = Object.values(enumObj).filter((entry) => {
    if (!tags.some((t) => entry.tags?.includes(t))) return false;
    if (genderId && entry.gender && entry.gender !== genderId) return false;
    if (filter && !filter(entry)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
