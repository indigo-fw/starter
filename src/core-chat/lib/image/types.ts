// ─── Image orchestration types ──────────────────────────────────────────────
// Aligned with sai_flirtcam's prompt/types.ts for trait-selector compatibility.

/** Visual enum entry shape (from visual-enums.ts) */
export interface EnumEntry {
  id: number;
  label: string;
  prompt?: string;
  negativePrompt?: string;
  tags?: readonly string[];
  gender?: number;
  colorGroup?: number;
  coverage?: number;
  contextTags?: readonly string[];
  perspectives?: readonly string[];
}

/** A scored match from a keyword to an enum entry */
export interface EnumMatch {
  enumType: string;
  entryId: number;
  keyword: string;
  score: number;
  colorId?: number;
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
  outfitColors?: Record<number, number>;
  accessoryColors?: Record<number, number>;
}

/** Coverage areas for outfit pieces */
export const Coverage = {
  LOWER: 1,
  UPPER: 2,
  FOOTWEAR: 3,
  JACKET: 4,
} as const;
export type CoverageValue = (typeof Coverage)[keyof typeof Coverage];
export type Coverage = CoverageValue;

/** Full result from orchestratePrompt */
export interface OrchestrateResult {
  traits: SelectedTraits;
  keywords: string[];
  isNsfw: boolean;
}

/** Image prompt data passed to the image adapter */
export interface ImagePromptData {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  avatarType: 'realistic' | 'anime';
  generationConfig: Record<string, unknown>;
}

/** Model preset configuration */
export interface ModelPreset {
  id: string;
  name: string;
  description?: string;
  category: 'realistic' | 'anime';
  generationConfig: {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    samplerName: string;
    scheduler: string;
    [key: string]: unknown;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const MATCH_SCORE = 1.0;
export const FUZZY_MATCH_CUTOFF = 0.8;
export const FUZZY_MATCH_MIN_LENGTH = 4;
export const SCORE_TOLERANCE = 0.15;
export const FOOTWEAR_PROBABILITY = 0.2;
export const JACKET_PROBABILITY = 0.1;
