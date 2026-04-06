/**
 * Built-in realistic preset.
 *
 * Uses base visual enums as-is (photorealistic source tags).
 * Only specifies generation config — no visual overrides needed since
 * the base visual-enums.ts already uses realistic prompts.
 *
 * Projects extend this in _templates/config/chat-presets/realistic.ts
 */
import type { ModelPreset } from '../../types';

/** Realistic generation config */
export const realisticConfig = {
  id: 'realistic',
  name: 'Realistic',
  description: 'Photorealistic image generation (Stable Diffusion SDXL)',
  category: 'realistic' as const,
  generationConfig: {
    width: 832,
    height: 1216,
    steps: 32,
    cfgScale: 6.0,
    samplerName: 'DPM++ 2M SDE',
    scheduler: 'Karras',
    enableHr: false,
    restoreFaces: false,
    adetailerModels: ['face_yolov8n.pt', 'hand_yolov8n.pt'],
    allowedResolutions: [[1024, 1024], [832, 1216], [1216, 832], [896, 1152]],
  },
};

/** Visual overrides for realistic (none — base enums are already realistic) */
export const realisticVisualOverrides = {};

/**
 * Create the realistic preset.
 * Call this with merged visuals to get a complete ModelPreset.
 */
export function createRealisticPreset(overrides?: Partial<typeof realisticConfig>): Omit<ModelPreset, 'generationConfig'> & { generationConfig: typeof realisticConfig.generationConfig } {
  return { ...realisticConfig, ...overrides };
}
