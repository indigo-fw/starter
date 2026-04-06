import type { SelectedTraits, ImagePromptData, ModelPreset } from './types';
import {
  VISUAL_OUTFIT,
  VISUAL_ACCESSORIES,
  VISUAL_POSE,
  VISUAL_EXPRESSION,
  VISUAL_LOCATION,
  VISUAL_LIGHTING,
  VISUAL_PERSPECTIVE,
  VISUAL_ETHNICITY,
  VISUAL_HAIRCOLOR,
  VISUAL_HAIRTEXTURE,
  VISUAL_HAIRSTYLE,
  VISUAL_EYESCOLOR,
  VISUAL_SKIN,
  VISUAL_BODYDESCRIPTION,
  VISUAL_COLORS,
  VISUAL_GENDER,
  VISUAL_QUALITY,
  VISUAL_NEGATIVE,
} from '@/core-chat/lib/visual-enums';

// ─── Enum lookup helper ─────────────────────────────────────────────────────

type EnumObj = Record<string, { id: number; prompt?: string; negativePrompt?: string }>;

function resolvePrompt(enumObj: EnumObj, id: number): string | null {
  for (const entry of Object.values(enumObj)) {
    if (entry.id === id) return entry.prompt ?? null;
  }
  return null;
}

function resolveColorName(colorId: number): string | null {
  for (const [, entry] of Object.entries(VISUAL_COLORS)) {
    const e = entry as { id: number; prompt?: string; label?: string };
    if (e.id === colorId) return e.prompt ?? e.label?.toLowerCase() ?? null;
  }
  return null;
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

export function buildImagePrompt(opts: {
  traits: SelectedTraits;
  botGenderId?: number | null;
  botEthnicityId?: number | null;
  botCustom?: string | null;
  botCustomNegative?: string | null;
  lora?: string | null;
  preset: ModelPreset;
  isNsfw: boolean;
  // Bot-level visual defaults
  hairColorId?: number | null;
  hairTextureId?: number | null;
  hairStyleId?: number | null;
  eyesColorId?: number | null;
  skinId?: number | null;
  bodyDescriptionId?: number | null;
}): ImagePromptData {
  const { traits, preset, isNsfw } = opts;
  const parts: string[] = [];

  // 1. Score tags + rating + gender
  const rating = isNsfw ? 'rating_explicit' : 'rating_safe';
  const genderId = opts.botGenderId ?? 1;
  const genderEntry = genderId === 1 ? VISUAL_GENDER.WOMAN : genderId === 2 ? VISUAL_GENDER.MAN : VISUAL_GENDER.WOMAN;
  const genderPrompt = genderEntry.prompt.replace('%%%rating%%%', rating);
  parts.push(genderPrompt);

  // 2. Ethnicity
  const ethId = opts.botEthnicityId;
  if (ethId) {
    const ethPrompt = resolvePrompt(VISUAL_ETHNICITY as unknown as EnumObj, ethId);
    if (ethPrompt) parts.push(ethPrompt);
  }

  // 3. Bot custom prompt
  if (opts.botCustom) parts.push(opts.botCustom);

  // 4. Visual traits (hair, eyes, skin, body)
  if (opts.hairColorId) { const p = resolvePrompt(VISUAL_HAIRCOLOR as unknown as EnumObj, opts.hairColorId); if (p) parts.push(p); }
  if (opts.hairTextureId) { const p = resolvePrompt(VISUAL_HAIRTEXTURE as unknown as EnumObj, opts.hairTextureId); if (p) parts.push(p); }
  if (opts.hairStyleId) { const p = resolvePrompt(VISUAL_HAIRSTYLE as unknown as EnumObj, opts.hairStyleId); if (p) parts.push(p); }
  if (opts.eyesColorId) { const p = resolvePrompt(VISUAL_EYESCOLOR as unknown as EnumObj, opts.eyesColorId); if (p) parts.push(p); }
  if (opts.skinId) { const p = resolvePrompt(VISUAL_SKIN as unknown as EnumObj, opts.skinId); if (p) parts.push(p); }
  if (opts.bodyDescriptionId) { const p = resolvePrompt(VISUAL_BODYDESCRIPTION as unknown as EnumObj, opts.bodyDescriptionId); if (p) parts.push(p); }

  // 5. Scene traits from orchestration
  for (const outfitId of traits.outfits) {
    let prompt = resolvePrompt(VISUAL_OUTFIT as unknown as EnumObj, outfitId) ?? '';
    const colorId = traits.outfitColors?.[outfitId];
    prompt = applyColor(prompt, colorId);
    if (prompt) parts.push(prompt);
  }
  for (const accId of traits.accessories) {
    let prompt = resolvePrompt(VISUAL_ACCESSORIES as unknown as EnumObj, accId) ?? '';
    const colorId = traits.accessoryColors?.[accId];
    prompt = applyColor(prompt, colorId);
    if (prompt) parts.push(prompt);
  }
  for (const poseId of traits.poses) {
    const p = resolvePrompt(VISUAL_POSE as unknown as EnumObj, poseId);
    if (p) parts.push(p);
  }
  if (traits.location) { const p = resolvePrompt(VISUAL_LOCATION as unknown as EnumObj, traits.location); if (p) parts.push(p); }
  if (traits.lighting) { const p = resolvePrompt(VISUAL_LIGHTING as unknown as EnumObj, traits.lighting); if (p) parts.push(p); }
  if (traits.expression) { const p = resolvePrompt(VISUAL_EXPRESSION as unknown as EnumObj, traits.expression); if (p) parts.push(p); }
  if (traits.perspective) { const p = resolvePrompt(VISUAL_PERSPECTIVE as unknown as EnumObj, traits.perspective); if (p) parts.push(p); }

  // 6. Custom unmatched keywords
  if (traits.custom) parts.push(traits.custom);

  // 7. Quality suffix
  const quality = (VISUAL_QUALITY as unknown as EnumObj).DEFAULT?.prompt;
  if (quality) parts.push(quality);

  // Assemble
  let prompt = parts.filter(Boolean).join(', ');

  // LoRA prefix
  if (opts.lora) {
    prompt = `${opts.lora}u_char, ${prompt}`;
  }

  // Negative prompt
  const negParts: string[] = [];
  const baseNeg = (VISUAL_NEGATIVE as unknown as EnumObj).DEFAULT?.prompt ?? 'score_6, score_5, blurry, lowres, bad anatomy';
  negParts.push(baseNeg);
  if (opts.botCustomNegative) negParts.push(opts.botCustomNegative);

  return {
    prompt,
    negativePrompt: negParts.filter(Boolean).join(', '),
    width: preset.generationConfig.width,
    height: preset.generationConfig.height,
    avatarType: preset.category,
    generationConfig: preset.generationConfig,
  };
}

function applyColor(prompt: string, colorId?: number): string {
  if (!colorId) {
    return prompt.replace(/\{color\}_/g, '').replace(/_\{color\}/g, '');
  }
  const colorName = resolveColorName(colorId) ?? '';
  return prompt.replace(/\{color\}/g, colorName);
}
