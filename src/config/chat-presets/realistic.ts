/**
 * Project-level realistic preset.
 *
 * Extends the built-in realistic preset from core-chat.
 * Add your model-specific overrides here (LoRA paths, custom prompts, etc.).
 *
 * To customize:
 * 1. Change generationConfig (steps, CFG, sampler, etc.)
 * 2. Add visual overrides (change prompts for specific outfits, poses, etc.)
 * 3. Run `bun run indigo:sync`
 */
import { realisticConfig, realisticVisualOverrides } from '@/core-chat/lib/image/presets/builtin/realistic';
import { mergeVisuals } from '@/core-chat/lib/image/presets/merge-visuals';
import { registerPreset } from '@/core-chat/lib/image/presets/registry';
import type { ModelPreset } from '@/core-chat/lib/image/types';
import * as baseVisuals from '@/core-chat/lib/character/visual-enums';

// ─── Project visual overrides (add your customizations here) ────────────────

const projectVisualOverrides = {
  // Example: override a specific outfit prompt for your model
  // VISUAL_OUTFIT: {
  //   WOMAN_BIKINI: { prompt: 'your_model_specific_bikini_prompt' },
  // },
};

// ─── Merge: base → builtin realistic → project overrides ───────────────────

const mergedVisuals = mergeVisuals(
  baseVisuals as unknown as Record<string, Record<string, unknown>>,
  { ...realisticVisualOverrides, ...projectVisualOverrides },
);

// ─── Register preset ────────────────────────────────────────────────────────

export const realisticPreset: ModelPreset = {
  ...realisticConfig,
  // Override generation config here if needed:
  // generationConfig: { ...realisticConfig.generationConfig, steps: 40 },
};

registerPreset(realisticPreset);
