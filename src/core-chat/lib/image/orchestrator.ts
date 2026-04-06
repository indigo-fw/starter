/**
 * Keyword matcher orchestrator for prompt-to-visual-trait extraction.
 * Wires the full pipeline: extractKeywords → findAllMatches → selectBestTraits → completeCoverage.
 *
 * This is the main entry point for the keyword matching pipeline.
 * Synonym normalization, fuzzy matching, flat scoring with multi-keyword boost,
 * color+item pairing, and contextTag-based coverage gap-filling.
 */
import { extractKeywords } from './normalizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A scored match from a keyword to an enum entry */
export interface EnumMatch {
  enumType: string; // "outfits", "location", "poses", etc.
  entryId: number; // enum entry .id
  keyword: string; // the keyword that triggered this match
  score: number; // 1.0 per keyword hit, multi-keyword matches accumulate (e.g. 2.0)
  colorId?: number; // color entry .id (for colored items)
}

/** Selected traits from the matching pipeline */
export interface SelectedTraits {
  outfits: number[];
  accessories: number[];
  expression?: number;
  poses: number[];
  location?: number;
  lighting?: number;
  perspective?: number;
  custom?: string;
  keyword_context?: string[];
  /** outfitId → color .id for colored outfits (e.g. "red bikini") */
  outfitColors?: Record<number, number>;
  /** accessoryId → color .id for colored accessories */
  accessoryColors?: Record<number, number>;
}

/** Result returned by orchestratePrompt */
export interface OrchestrateResult {
  outfits?: number[] | string;
  accessories?: number[] | string;
  expression?: number | string;
  poses?: number[] | string;
  location?: number | string;
  lighting?: number | string;
  perspective?: number | string;
  custom?: string;
  keyword_context?: string[];
  /** outfitId → color .id for colored outfits (e.g. "red bikini") */
  outfitColors?: Record<number, number>;
  /** accessoryId → color .id for colored accessories */
  accessoryColors?: Record<number, number>;

  // Bot-level fields (override bot record values when set by form)
  gender?: number | string;
  ethnicity?: number | string;
  hair_color?: number | string;
  hair_texture?: number | string;
  hair_style?: number | string;
  age?: number | string;
  eyes_color?: number | string;
  skin?: number | string;
  body_description?: number | string;
}

// ---------------------------------------------------------------------------
// Pipeline function types — consumers inject their own implementations
// ---------------------------------------------------------------------------

type FindAllMatchesFn = (
  keywords: string[],
  botGenderId?: number
) => Map<string, EnumMatch[]>;

type SelectBestTraitsFn = (
  allMatches: Map<string, EnumMatch[]>
) => SelectedTraits;

type CompleteCoverageFn = (
  selected: SelectedTraits,
  botGenderId?: number,
  keywords?: string[]
) => SelectedTraits;

type ApplyRenderFilterFn = (
  traits: SelectedTraits,
  keywords: string[],
  userSelectedOutfits: number[],
  botGenderId?: number
) => { traits: SelectedTraits; keywords: string[] };

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

let findAllMatchesFn: FindAllMatchesFn | null = null;
let selectBestTraitsFn: SelectBestTraitsFn | null = null;
let completeCoverageFn: CompleteCoverageFn | null = null;
let applyRenderFilterFn: ApplyRenderFilterFn | null = null;

/**
 * Configure the pipeline functions used by orchestratePrompt.
 * Must be called before orchestratePrompt is invoked.
 *
 * In sai_flirtcam these were direct imports from enum-index and trait-selector.
 * Here they are injected to keep the orchestrator decoupled from specific enum definitions.
 */
export function configurePipeline(config: {
  findAllMatches: FindAllMatchesFn;
  selectBestTraits: SelectBestTraitsFn;
  completeCoverage: CompleteCoverageFn;
  applyRenderFilter: ApplyRenderFilterFn;
}): void {
  findAllMatchesFn = config.findAllMatches;
  selectBestTraitsFn = config.selectBestTraits;
  completeCoverageFn = config.completeCoverage;
  applyRenderFilterFn = config.applyRenderFilter;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Extract visual parameters from free-form user prompt text.
 *
 * Pipeline:
 * 1. Extract keywords (synonym rules, stop words, content moderation)
 * 2. Find all scored matches globally (O(1) index + fuzzy + color combos)
 * 3. Select best traits per type (score tolerance, random selection, conflict resolution)
 * 4. Complete coverage gaps using contextTags (data-driven, not hardcoded rules)
 * 5. Apply render filter (context-aware trait modifications)
 * 6. Collect unmatched keywords into custom field
 *
 * @param promptText - User's free-form prompt text
 * @param botGenderId - Bot's gender (1=female, 2=male) for filtering
 * @returns Visual trait selections + custom text + keyword context
 */
export function orchestratePrompt(
  promptText: string,
  botGenderId?: number
): OrchestrateResult {
  if (!findAllMatchesFn || !selectBestTraitsFn || !completeCoverageFn || !applyRenderFilterFn) {
    throw new Error(
      'orchestratePrompt: pipeline not configured. Call configurePipeline() first.'
    );
  }

  // 1. Extract + normalize keywords
  const keywords = extractKeywords(promptText);
  // Note: Do NOT early-return on empty keywords.
  // Coverage completion must still run to add SFW defaults (outfit, location, lighting).

  // 2. Find all scored matches globally
  const allMatches = findAllMatchesFn(keywords, botGenderId);

  // 3. Select best traits per type
  const selected = selectBestTraitsFn(allMatches);

  // 4. Complete coverage gaps using contextTags
  const completed = completeCoverageFn(selected, botGenderId, keywords);

  // 5. Apply render filter (context-aware trait modifications)
  //    User-selected outfits = those from selectBestTraits (not coverage completion)
  const userSelectedOutfits = selected.outfits;
  const filtered = applyRenderFilterFn(
    completed,
    keywords,
    userSelectedOutfits,
    botGenderId
  );
  const finalTraits = filtered.traits;
  const filteredKeywords = filtered.keywords;

  // 6. Build result — collect unmatched keywords into custom field
  const matchedKeywords = new Set<string>();
  for (const [keyword] of allMatches) {
    matchedKeywords.add(keyword);
  }

  const unmatchedKeywords = filteredKeywords.filter(
    (t) => !matchedKeywords.has(t)
  );

  const result: OrchestrateResult = {};

  if (finalTraits.outfits.length > 0) result.outfits = finalTraits.outfits;
  if (finalTraits.accessories.length > 0)
    result.accessories = finalTraits.accessories;
  if (finalTraits.expression !== undefined)
    result.expression = finalTraits.expression;
  if (finalTraits.poses.length > 0) result.poses = finalTraits.poses;
  if (finalTraits.location !== undefined)
    result.location = finalTraits.location;
  if (finalTraits.lighting !== undefined)
    result.lighting = finalTraits.lighting;
  if (finalTraits.perspective !== undefined)
    result.perspective = finalTraits.perspective;
  if (finalTraits.outfitColors) result.outfitColors = finalTraits.outfitColors;
  if (finalTraits.accessoryColors)
    result.accessoryColors = finalTraits.accessoryColors;

  // Unmatched keywords go to custom field
  if (unmatchedKeywords.length > 0) {
    result.custom = unmatchedKeywords.join(' ');
  }

  // Also merge any custom from render filter or trait selector
  if (finalTraits.custom) {
    result.custom = result.custom
      ? `${result.custom} ${finalTraits.custom}`
      : finalTraits.custom;
  }

  result.keyword_context = filteredKeywords;

  return result;
}
