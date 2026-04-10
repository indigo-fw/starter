/**
 * Initialize the image orchestration pipeline.
 * Must be called once at server startup before any image generation.
 *
 * Wires: visual enums → enum-index, normalizer color sets,
 *        orchestrator pipeline (findAllMatches, selectBestTraits, completeCoverage, applyRenderFilter)
 */
import {
  VISUAL_OUTFIT,
  VISUAL_ACCESSORIES,
  VISUAL_POSE,
  VISUAL_EXPRESSION,
  VISUAL_LOCATION,
  VISUAL_LIGHTING,
  VISUAL_PERSPECTIVE,
  VISUAL_GENDER,
  VISUAL_ETHNICITY,
  VISUAL_HAIRCOLOR,
  VISUAL_HAIRTEXTURE,
  VISUAL_HAIRSTYLE,
  VISUAL_EYESCOLOR,
  VISUAL_SKIN,
  VISUAL_BODYDESCRIPTION,
  VISUAL_AGE,
  VISUAL_COLORS,
} from '@/core-chat/lib/character/visual-enums';
import { buildEnumIndex, findAllMatches } from './enum-index';
import { configureColorSets } from './normalizer';
import { configurePipeline } from './orchestrator';
import { selectBestTraits, completeCoverage, applyRenderFilter } from './trait-selector';
import type { EnumEntry } from './types';

let _initialized = false;

/**
 * Initialize the image pipeline. Safe to call multiple times (idempotent).
 */
export function initImagePipeline(): void {
  if (_initialized) return;

  // 1. Build the enum index from all visual categories
  const enumToEntries = (obj: Record<string, unknown>): EnumEntry[] =>
    Object.values(obj) as EnumEntry[];

  buildEnumIndex([
    { type: 'outfits', entries: enumToEntries(VISUAL_OUTFIT) },
    { type: 'accessories', entries: enumToEntries(VISUAL_ACCESSORIES) },
    { type: 'poses', entries: enumToEntries(VISUAL_POSE) },
    { type: 'expression', entries: enumToEntries(VISUAL_EXPRESSION) },
    { type: 'location', entries: enumToEntries(VISUAL_LOCATION) },
    { type: 'lighting', entries: enumToEntries(VISUAL_LIGHTING) },
    { type: 'perspective', entries: enumToEntries(VISUAL_PERSPECTIVE) },
    { type: 'gender', entries: enumToEntries(VISUAL_GENDER) },
    { type: 'ethnicity', entries: enumToEntries(VISUAL_ETHNICITY) },
    { type: 'hairColor', entries: enumToEntries(VISUAL_HAIRCOLOR) },
    { type: 'hairTexture', entries: enumToEntries(VISUAL_HAIRTEXTURE) },
    { type: 'hairStyle', entries: enumToEntries(VISUAL_HAIRSTYLE) },
    { type: 'eyesColor', entries: enumToEntries(VISUAL_EYESCOLOR) },
    { type: 'skin', entries: enumToEntries(VISUAL_SKIN) },
    { type: 'bodyDescription', entries: enumToEntries(VISUAL_BODYDESCRIPTION) },
    { type: 'age', entries: enumToEntries(VISUAL_AGE) },
  ]);

  // 2. Configure color sets for the normalizer's color+item detection
  const colors = new Set<string>();
  for (const entry of Object.values(VISUAL_COLORS) as EnumEntry[]) {
    if (entry.tags) {
      for (const tag of entry.tags) colors.add(tag.toLowerCase());
    }
  }

  const colorableItems = new Set<string>();
  for (const entry of Object.values(VISUAL_OUTFIT) as EnumEntry[]) {
    if (entry.colorGroup && entry.colorGroup > 0 && entry.tags) {
      for (const tag of entry.tags) colorableItems.add(tag.toLowerCase());
    }
  }
  for (const entry of Object.values(VISUAL_ACCESSORIES) as EnumEntry[]) {
    if (entry.colorGroup && entry.colorGroup > 0 && entry.tags) {
      for (const tag of entry.tags) colorableItems.add(tag.toLowerCase());
    }
  }

  configureColorSets(colors, colorableItems);

  // 3. Wire the orchestrator pipeline
  configurePipeline({
    findAllMatches,
    selectBestTraits,
    completeCoverage,
    applyRenderFilter,
  });

  _initialized = true;
}
