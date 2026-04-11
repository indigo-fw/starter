/**
 * Context tags accessor for visual enum entries.
 * Reads contextTags from entries in visual-enums.ts.
 */
import {
  VISUAL_ACCESSORIES,
  VISUAL_EXPRESSION,
  VISUAL_LIGHTING,
  VISUAL_LOCATION,
  VISUAL_OUTFIT,
  VISUAL_POSE,
} from '@/core-chat/lib/character/visual-enums';
import { getEntryContextTags as _getEntryContextTags } from '@/core-chat/lib/character/visual-enum-utils';

type VisualEnum = Record<string, { id: number; contextTags?: readonly string[] }>;

const ENUM_TYPE_MAP: Record<string, VisualEnum> = {
  outfits: VISUAL_OUTFIT,
  location: VISUAL_LOCATION,
  lighting: VISUAL_LIGHTING,
  poses: VISUAL_POSE,
  expression: VISUAL_EXPRESSION,
  accessories: VISUAL_ACCESSORIES,
};

const idLookupCache = new Map<string, Map<number, readonly string[]>>();

function getIdLookup(enumType: string): Map<number, readonly string[]> {
  let lookup = idLookupCache.get(enumType);
  if (lookup) return lookup;

  lookup = new Map<number, readonly string[]>();
  const enumObj = ENUM_TYPE_MAP[enumType];
  if (enumObj) {
    for (const entry of Object.values(enumObj)) {
      if (entry.contextTags && entry.contextTags.length > 0) {
        lookup.set(entry.id, entry.contextTags);
      }
    }
  }
  idLookupCache.set(enumType, lookup);
  return lookup;
}

export function getContextTags(
  enumType: string,
  entryId: number,
): readonly string[] {
  return getIdLookup(enumType).get(entryId) ?? [];
}
