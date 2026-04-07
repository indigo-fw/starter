/**
 * Type-safe utilities for looking up visual enum entries by ID.
 * Eliminates the `as unknown as EnumObj` casts throughout the codebase.
 *
 * Visual enums are `as const` objects keyed by name (e.g., VISUAL_OUTFIT.WOMAN_BIKINI).
 * These helpers provide ID-based lookups without losing type safety.
 */

/** Minimal shape that all visual enum entries share */
interface VisualEntry {
  readonly id: number;
  readonly prompt?: string;
  readonly negativePrompt?: string;
  readonly label?: string;
  readonly contextTags?: readonly string[];
}

/** A visual enum object (keyed by entry name) */
type VisualEnum = Record<string, VisualEntry>;

/**
 * Find an entry's prompt string by ID in a visual enum.
 * Returns null if not found.
 */
export function resolvePromptById(enumObj: VisualEnum, id: number): string | null {
  for (const entry of Object.values(enumObj)) {
    if (entry.id === id) return entry.prompt ?? null;
  }
  return null;
}

/**
 * Find a named entry's prompt (e.g., VISUAL_QUALITY.DEFAULT).
 * Returns null if not found.
 */
export function resolveNamedPrompt(enumObj: VisualEnum, name: string): string | null {
  const entry = enumObj[name];
  return entry?.prompt ?? null;
}

/**
 * Get context tags for an entry by ID.
 */
export function getEntryContextTags(enumObj: VisualEnum, id: number): readonly string[] {
  for (const entry of Object.values(enumObj)) {
    if (entry.id === id) return entry.contextTags ?? [];
  }
  return [];
}

/**
 * Build a Map<id, VisualEntry> for O(1) lookups.
 * Call once at startup for frequently-queried enums.
 */
export function buildIdMap<T extends VisualEntry>(enumObj: Record<string, T>): Map<number, T> {
  const map = new Map<number, T>();
  for (const entry of Object.values(enumObj)) {
    map.set(entry.id, entry);
  }
  return map;
}
