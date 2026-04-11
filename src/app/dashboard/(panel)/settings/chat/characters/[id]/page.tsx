'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CHARACTER_GENDER, CHARACTER_SEXUALITY, CHARACTER_ETHNICITY,
  CHARACTER_PERSONALITY, CHARACTER_KINK, CHARACTER_JOB,
  CHARACTER_HOBBY, CHARACTER_RELATIONSHIP,
} from '@/core-chat/lib/character/character-enums';
import {
  VISUAL_HAIRCOLOR, VISUAL_HAIRTEXTURE, VISUAL_HAIRSTYLE,
  VISUAL_EYESCOLOR, VISUAL_SKIN, VISUAL_BODYDESCRIPTION,
} from '@/core-chat/lib/character/visual-enums';

type EnumMap = ReadonlyMap<number, { id: number; key: string; title: string }>;

/** Convert a visual enum object (keyed by name) to a flat options array */
function visualEnumOptions(obj: Record<string, { id: number; label: string }>): Array<{ id: number; label: string }> {
  return Object.values(obj).sort((a, b) => a.id - b.id);
}

function VisualEnumSelect({ label, value, onChange, options, nullable = true }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  options: Array<{ id: number; label: string }>; nullable?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-(--text-secondary)">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)} className="select w-full text-sm">
        {nullable && <option value="">—</option>}
        {options.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
    </label>
  );
}

function EnumSelect({ label, value, onChange, enumMap, nullable = true }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  enumMap: EnumMap; nullable?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-(--text-secondary)">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)} className="select w-full text-sm">
        {nullable && <option value="">—</option>}
        {[...enumMap.values()].map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
      </select>
    </label>
  );
}

function MultiEnumSelect({ label, value, onChange, enumMap }: {
  label: string; value: number[]; onChange: (v: number[]) => void; enumMap: EnumMap;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-(--text-secondary)">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {[...enumMap.values()].map((item) => {
          const selected = value.includes(item.id);
          return (
            <button key={item.id} type="button" onClick={() => {
              onChange(selected ? value.filter((id) => id !== item.id) : [...value, item.id]);
            }} className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
              selected ? 'bg-brand-500/10 text-brand-500 border-brand-500/30' : 'bg-(--surface-secondary) text-(--text-tertiary) border-transparent hover:border-(--border-primary)',
            )}>
              {item.title}
            </button>
          );
        })}
      </div>
    </label>
  );
}

interface CharacterData {
  id: string;
  name: string; slug: string; tagline: string | null;
  systemPrompt: string; personality: string | null;
  avatarUrl: string | null; greeting: string | null;
  modelPreset: string | null;
  genderId: number | null; sexualityId: number | null;
  ethnicityId: number | null; personalityId: number | null;
  kinkId: number | null; jobId: number | null;
  hobbies: unknown; relationshipId: number | null;
  hairColorId: number | null; hairTextureId: number | null;
  hairStyleId: number | null; eyesColorId: number | null;
  skinId: number | null; bodyDescriptionId: number | null;
  customNegative: string | null; loraConfig: string | null;
  isActive: boolean; sortOrder: number; tokenCostMultiplier: number;
}

function buildInitialForm(character?: CharacterData) {
  if (!character) {
    return {
      name: '', slug: '', tagline: '', systemPrompt: '', personality: '',
      avatarUrl: '', greeting: '', modelPreset: '',
      genderId: null as number | null, sexualityId: null as number | null,
      ethnicityId: null as number | null, personalityId: null as number | null,
      kinkId: null as number | null, jobId: null as number | null,
      hobbies: [] as number[], relationshipId: null as number | null,
      hairColorId: null as number | null, hairTextureId: null as number | null,
      hairStyleId: null as number | null, eyesColorId: null as number | null,
      skinId: null as number | null, bodyDescriptionId: null as number | null,
      customNegative: '', loraConfig: '',
      isActive: true, sortOrder: 0, tokenCostMultiplier: 1.0,
    };
  }
  return {
    name: character.name, slug: character.slug, tagline: character.tagline ?? '',
    systemPrompt: character.systemPrompt, personality: character.personality ?? '',
    avatarUrl: character.avatarUrl ?? '', greeting: character.greeting ?? '',
    modelPreset: character.modelPreset ?? '',
    genderId: character.genderId, sexualityId: character.sexualityId,
    ethnicityId: character.ethnicityId, personalityId: character.personalityId,
    kinkId: character.kinkId, jobId: character.jobId,
    hobbies: (character.hobbies as number[]) ?? [],
    relationshipId: character.relationshipId,
    hairColorId: character.hairColorId, hairTextureId: character.hairTextureId,
    hairStyleId: character.hairStyleId, eyesColorId: character.eyesColorId,
    skinId: character.skinId, bodyDescriptionId: character.bodyDescriptionId,
    customNegative: character.customNegative ?? '', loraConfig: character.loraConfig ?? '',
    isActive: character.isActive, sortOrder: character.sortOrder,
    tokenCostMultiplier: character.tokenCostMultiplier,
  };
}

/** Form body — keyed by character ID so React resets state when data arrives. */
function CharacterForm({ character, isNew }: { character?: CharacterData; isNew: boolean }) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const createMutation = trpc.characters.create.useMutation();
  const updateMutation = trpc.characters.update.useMutation();

  const [form, setForm] = useState(() => buildInitialForm(character));

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const base = {
      name: form.name, slug: form.slug, tagline: form.tagline || undefined,
      systemPrompt: form.systemPrompt, personality: form.personality || undefined,
      avatarUrl: form.avatarUrl || undefined, greeting: form.greeting || undefined,
      modelPreset: form.modelPreset || undefined,
      genderId: form.genderId ?? undefined, sexualityId: form.sexualityId ?? undefined,
      ethnicityId: form.ethnicityId ?? undefined, personalityId: form.personalityId ?? undefined,
      kinkId: form.kinkId ?? undefined, jobId: form.jobId ?? undefined,
      hobbies: form.hobbies.length > 0 ? form.hobbies : undefined,
      relationshipId: form.relationshipId ?? undefined,
      hairColorId: form.hairColorId ?? undefined, hairTextureId: form.hairTextureId ?? undefined,
      hairStyleId: form.hairStyleId ?? undefined, eyesColorId: form.eyesColorId ?? undefined,
      skinId: form.skinId ?? undefined, bodyDescriptionId: form.bodyDescriptionId ?? undefined,
      customNegative: form.customNegative || undefined, loraConfig: form.loraConfig || undefined,
      isActive: form.isActive, sortOrder: form.sortOrder, tokenCostMultiplier: form.tokenCostMultiplier,
    };
    const onSuccess = () => router.push('/dashboard/settings/chat/characters');
    if (isNew) createMutation.mutate(base, { onSuccess });
    else updateMutation.mutate({ id: params.id, ...base }, { onSuccess });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1"><span className="label">{__('Name')}</span>
          <input type="text" value={form.name} onChange={(e) => {
            set('name', e.target.value);
            if (isNew) set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
          }} className="input w-full" /></label>
        <label className="space-y-1"><span className="label">{__('Slug')}</span>
          <input type="text" value={form.slug} onChange={(e) => set('slug', e.target.value)} className="input w-full font-mono" /></label>
      </div>

      <label className="block space-y-1"><span className="label">{__('Tagline')}</span>
        <input type="text" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} className="input w-full" /></label>

      <label className="block space-y-1"><span className="label">{__('System Prompt')}</span>
        <textarea value={form.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} rows={5} className="textarea w-full" /></label>

      <label className="block space-y-1"><span className="label">{__('Personality (visible to users)')}</span>
        <textarea value={form.personality} onChange={(e) => set('personality', e.target.value)} rows={2} className="textarea w-full" /></label>

      <label className="block space-y-1"><span className="label">{__('Greeting Message')}</span>
        <textarea value={form.greeting} onChange={(e) => set('greeting', e.target.value)} rows={2} className="textarea w-full" /></label>

      <label className="block space-y-1"><span className="label">{__('Avatar URL')}</span>
        <input type="text" value={form.avatarUrl} onChange={(e) => set('avatarUrl', e.target.value)} className="input w-full" /></label>

      {/* Character traits */}
      <div className="border-t border-(--border-primary) pt-5">
        <h2 className="text-sm font-semibold text-(--text-primary) mb-3">{__('Character Traits')}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <EnumSelect label={__('Gender')} value={form.genderId} onChange={(v) => set('genderId', v)} enumMap={CHARACTER_GENDER} />
          <EnumSelect label={__('Sexuality')} value={form.sexualityId} onChange={(v) => set('sexualityId', v)} enumMap={CHARACTER_SEXUALITY} />
          <EnumSelect label={__('Ethnicity')} value={form.ethnicityId} onChange={(v) => set('ethnicityId', v)} enumMap={CHARACTER_ETHNICITY} />
          <EnumSelect label={__('Personality')} value={form.personalityId} onChange={(v) => set('personalityId', v)} enumMap={CHARACTER_PERSONALITY} />
          <EnumSelect label={__('Kink')} value={form.kinkId} onChange={(v) => set('kinkId', v)} enumMap={CHARACTER_KINK} />
          <EnumSelect label={__('Job')} value={form.jobId} onChange={(v) => set('jobId', v)} enumMap={CHARACTER_JOB} />
          <EnumSelect label={__('Relationship')} value={form.relationshipId} onChange={(v) => set('relationshipId', v)} enumMap={CHARACTER_RELATIONSHIP} />
        </div>
        <div className="mt-4">
          <MultiEnumSelect label={__('Hobbies')} value={form.hobbies} onChange={(v) => set('hobbies', v)} enumMap={CHARACTER_HOBBY} />
        </div>
      </div>

      {/* Visual appearance (for image generation) */}
      <div className="border-t border-(--border-primary) pt-5">
        <h2 className="text-sm font-semibold text-(--text-primary) mb-3">{__('Visual Appearance')}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <VisualEnumSelect label={__('Hair Color')} value={form.hairColorId} onChange={(v) => set('hairColorId', v)} options={visualEnumOptions(VISUAL_HAIRCOLOR as Record<string, { id: number; label: string }>)} />
          <VisualEnumSelect label={__('Hair Texture')} value={form.hairTextureId} onChange={(v) => set('hairTextureId', v)} options={visualEnumOptions(VISUAL_HAIRTEXTURE as Record<string, { id: number; label: string }>)} />
          <VisualEnumSelect label={__('Hair Style')} value={form.hairStyleId} onChange={(v) => set('hairStyleId', v)} options={visualEnumOptions(VISUAL_HAIRSTYLE as Record<string, { id: number; label: string }>)} />
          <VisualEnumSelect label={__('Eye Color')} value={form.eyesColorId} onChange={(v) => set('eyesColorId', v)} options={visualEnumOptions(VISUAL_EYESCOLOR as Record<string, { id: number; label: string }>)} />
          <VisualEnumSelect label={__('Skin')} value={form.skinId} onChange={(v) => set('skinId', v)} options={visualEnumOptions(VISUAL_SKIN as Record<string, { id: number; label: string }>)} />
          <VisualEnumSelect label={__('Body Type')} value={form.bodyDescriptionId} onChange={(v) => set('bodyDescriptionId', v)} options={visualEnumOptions(VISUAL_BODYDESCRIPTION as Record<string, { id: number; label: string }>)} />
        </div>
      </div>

      {/* Image generation settings */}
      <div className="border-t border-(--border-primary) pt-5">
        <h2 className="text-sm font-semibold text-(--text-primary) mb-3">{__('Image Generation Settings')}</h2>
        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-1"><span className="label">{__('Model Preset')}</span>
            <input type="text" value={form.modelPreset} onChange={(e) => set('modelPreset', e.target.value)} placeholder="default-realistic" className="input w-full" /></label>
          <label className="space-y-1"><span className="label">{__('Sort Order')}</span>
            <input type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', parseInt(e.target.value) || 0)} className="input w-full" /></label>
          <label className="space-y-1"><span className="label">{__('Token Cost Multiplier')}</span>
            <input type="number" step="0.1" value={form.tokenCostMultiplier} onChange={(e) => set('tokenCostMultiplier', parseFloat(e.target.value) || 1.0)} className="input w-full" /></label>
        </div>
        <div className="mt-3"><label className="block space-y-1"><span className="label">{__('Custom Negative Prompt')}</span>
          <input type="text" value={form.customNegative} onChange={(e) => set('customNegative', e.target.value)} className="input w-full" /></label></div>
        <div className="mt-3"><label className="block space-y-1"><span className="label">{__('LoRA Config')}</span>
          <input type="text" value={form.loraConfig} onChange={(e) => set('loraConfig', e.target.value)} placeholder="<lora:model:0.8>" className="input w-full font-mono" /></label></div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="rounded" />
        <span className="text-sm text-(--text-secondary)">{__('Active (visible to users)')}</span>
      </label>

      <div className="flex justify-end pt-4 border-t border-(--border-primary)">
        <button onClick={handleSave} disabled={isSaving || !form.name || !form.slug || !form.systemPrompt}
          className={cn('btn btn-primary flex items-center gap-2 text-sm', 'disabled:opacity-50')}>
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isNew ? __('Create Character') : __('Save Changes')}
        </button>
      </div>
    </div>
  );
}

export default function CharacterEditPage() {
  const __ = useAdminTranslations();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === 'new';

  const { data: character, isLoading } = trpc.characters.get.useQuery(
    { id: params.id }, { enabled: !isNew },
  );

  if (!isNew && isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-(--text-tertiary)" size={24} /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/settings/chat/characters')}
          className="p-1.5 rounded-lg text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary)">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Character') : __('Edit Character')}
        </h1>
      </div>

      <CharacterForm key={character?.id ?? 'new'} character={character} isNew={isNew} />
    </div>
  );
}
