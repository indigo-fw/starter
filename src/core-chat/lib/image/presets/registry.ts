import type { ModelPreset } from '../types';

// ─── Preset registry ────────────────────────────────────────────────────────
// Module provides registration functions. Project decides which presets to register.
// Registration happens in chat-deps.ts (project-owned).

const presets = new Map<string, ModelPreset>();

/** Register a preset. Called by project code in chat-deps.ts. */
export function registerPreset(preset: ModelPreset): void {
  presets.set(preset.id, preset);
}

/** Get a preset by ID. */
export function getPreset(id: string): ModelPreset | undefined {
  return presets.get(id);
}

/** Get the first registered preset as default. */
export function getDefaultPreset(): ModelPreset {
  const first = presets.values().next();
  if (first.done) return FALLBACK_PRESET;
  return first.value;
}

/** List all registered presets. */
export function listPresets(): ModelPreset[] {
  return [...presets.values()];
}

// ─── Fallback (used only when NO presets registered — shouldn't happen) ─────

const FALLBACK_PRESET: ModelPreset = {
  id: 'fallback',
  name: 'Fallback',
  category: 'realistic',
  generationConfig: {
    width: 1024,
    height: 1024,
    steps: 20,
    cfgScale: 7.0,
    samplerName: 'Euler',
    scheduler: 'Normal',
  },
};
