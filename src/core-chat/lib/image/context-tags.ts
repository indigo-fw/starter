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
} from '@/core-chat/lib/visual-enums';

type EnumObj = Record<string, { id: number; contextTags?: readonly string[] }>;

const ENUM_TYPE_MAP: Record<string, EnumObj> = {
  outfits: VISUAL_OUTFIT as unknown as EnumObj,
  location: VISUAL_LOCATION as unknown as EnumObj,
  lighting: VISUAL_LIGHTING as unknown as EnumObj,
  poses: VISUAL_POSE as unknown as EnumObj,
  expression: VISUAL_EXPRESSION as unknown as EnumObj,
  accessories: VISUAL_ACCESSORIES as unknown as EnumObj,
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
