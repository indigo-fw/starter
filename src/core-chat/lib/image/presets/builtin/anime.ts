/**
 * Built-in anime preset.
 *
 * Overrides source tags from realistic → anime, adjusts quality prompts,
 * and uses different generation config (fewer steps, higher CFG, Euler sampler).
 *
 * Projects extend this in _templates/config/chat-presets/anime.ts
 */
import type { ModelPreset } from '../../types';

/** Anime generation config */
export const animeConfig = {
  id: 'anime',
  name: 'Anime',
  description: 'Anime/2.5D style image generation',
  category: 'anime' as const,
  generationConfig: {
    width: 832,
    height: 1216,
    steps: 28,
    cfgScale: 7.0,
    samplerName: 'Euler a',
    scheduler: 'Normal',
    enableHr: false,
    restoreFaces: false,
    adetailerModels: [] as string[],
    allowedResolutions: [[1024, 1024], [832, 1216], [1216, 832], [896, 1152]],
  },
};

/**
 * Visual overrides for anime.
 * Changes source tags from photorealistic → anime.
 * Inspired by snowpony-sdxl from flirtcam.
 */
export const animeVisualOverrides = {
  VISUAL_GENDER: {
    WOMAN: {
      prompt: 'score_9, score_8_up, score_7_up, %%%rating%%%, source_anime, 1girl',
    },
    MAN: {
      prompt: 'score_9, score_8_up, score_7_up, %%%rating%%%, source_anime, 1boy',
    },
  },
  VISUAL_QUALITY: {
    DEFAULT: {
      prompt: 'masterpiece, best quality, very aesthetic',
    },
  },
  VISUAL_NEGATIVE: {
    DEFAULT: {
      prompt: 'score_6, score_5, score_4, source_pony, source_furry, source_cartoon, 3d, realistic, photo, lowres, bad anatomy, bad hands, text, watermark, signature, blurry, ugly',
    },
  },
};

export function createAnimePreset(overrides?: Partial<typeof animeConfig>): Omit<ModelPreset, 'generationConfig'> & { generationConfig: typeof animeConfig.generationConfig } {
  return { ...animeConfig, ...overrides };
}
