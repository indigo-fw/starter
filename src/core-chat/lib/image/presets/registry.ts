import type { ModelPreset } from '../types';

// ─── Preset registry ────────────────────────────────────────────────────────

const presets = new Map<string, ModelPreset>();

export function registerPreset(preset: ModelPreset): void {
  presets.set(preset.id, preset);
}

export function getPreset(id: string): ModelPreset | undefined {
  return presets.get(id);
}

export function getDefaultPreset(): ModelPreset {
  return presets.values().next().value ?? DEFAULT_PRESET;
}

export function listPresets(): ModelPreset[] {
  return [...presets.values()];
}

// ─── Default realistic preset ───────────────────────────────────────────────

const DEFAULT_PRESET: ModelPreset = {
  id: 'default-realistic',
  name: 'Default Realistic',
  description: 'Standard realistic image generation preset',
  category: 'realistic',
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

registerPreset(DEFAULT_PRESET);
