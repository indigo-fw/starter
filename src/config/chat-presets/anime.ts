/**
 * Project-level anime preset.
 *
 * Extends the built-in anime preset from core-chat.
 * Add your model-specific overrides here (LoRA paths, custom prompts, etc.).
 *
 * To customize:
 * 1. Change generationConfig (steps, CFG, sampler, etc.)
 * 2. Add visual overrides (change prompts for specific outfits, poses, etc.)
 * 3. Run `bun run indigo:sync`
 */
import { animeConfig, animeVisualOverrides } from '@/core-chat/lib/image/presets/builtin/anime';
import { mergeVisuals } from '@/core-chat/lib/image/presets/merge-visuals';
import { registerPreset } from '@/core-chat/lib/image/presets/registry';
import type { ModelPreset } from '@/core-chat/lib/image/types';
import * as baseVisuals from '@/core-chat/lib/visual-enums';

// ─── Project visual overrides (add your customizations here) ────────────────

const projectVisualOverrides = {
  // Example: customize anime style further
  // VISUAL_QUALITY: {
  //   DEFAULT: { prompt: 'masterpiece, best quality, anime coloring, cel shading' },
  // },
};

// ─── Merge: base → builtin anime → project overrides ───────────────────────

const mergedVisuals = mergeVisuals(
  baseVisuals as unknown as Record<string, Record<string, unknown>>,
  { ...animeVisualOverrides, ...projectVisualOverrides },
);

// ─── Register preset ────────────────────────────────────────────────────────

export const animePreset: ModelPreset = {
  ...animeConfig,
  // Override generation config here if needed:
  // generationConfig: { ...animeConfig.generationConfig, steps: 35 },
};

registerPreset(animePreset);
