'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Admin character edit/create form.
 * If id === 'new', creates a new character. Otherwise edits existing.
 */
export default function CharacterEditPage() {
  const __ = useAdminTranslations();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === 'new';

  const { data: character, isLoading } = trpc.characters.get.useQuery(
    { id: params.id },
    { enabled: !isNew },
  );

  const createMutation = trpc.characters.create.useMutation();
  const updateMutation = trpc.characters.update.useMutation();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    tagline: '',
    systemPrompt: '',
    personality: '',
    avatarUrl: '',
    greeting: '',
    model: '',
    isActive: true,
    sortOrder: 0,
    tokenCostMultiplier: 1.0,
  });

  useEffect(() => {
    if (character) {
      setForm({
        name: character.name,
        slug: character.slug,
        tagline: character.tagline ?? '',
        systemPrompt: character.systemPrompt,
        personality: character.personality ?? '',
        avatarUrl: character.avatarUrl ?? '',
        greeting: character.greeting ?? '',
        model: character.model ?? '',
        isActive: character.isActive,
        sortOrder: character.sortOrder,
        tokenCostMultiplier: character.tokenCostMultiplier,
      });
    }
  }, [character]);

  function handleChange(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (isNew) {
      createMutation.mutate(
        {
          name: form.name,
          slug: form.slug,
          tagline: form.tagline || undefined,
          systemPrompt: form.systemPrompt,
          personality: form.personality || undefined,
          avatarUrl: form.avatarUrl || undefined,
          greeting: form.greeting || undefined,
          model: form.model || undefined,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
          tokenCostMultiplier: form.tokenCostMultiplier,
        },
        { onSuccess: () => router.push('/dashboard/settings/chat/characters') },
      );
    } else {
      updateMutation.mutate(
        {
          id: params.id,
          name: form.name,
          slug: form.slug,
          tagline: form.tagline || null,
          systemPrompt: form.systemPrompt,
          personality: form.personality || null,
          avatarUrl: form.avatarUrl || null,
          greeting: form.greeting || null,
          model: form.model || null,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
          tokenCostMultiplier: form.tokenCostMultiplier,
        },
        { onSuccess: () => router.push('/dashboard/settings/chat/characters') },
      );
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-(--text-tertiary)" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/settings/chat/characters')}
          className="p-1.5 rounded-lg text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Character') : __('Edit Character')}
        </h1>
      </div>

      <div className="space-y-4">
        {/* Name + Slug */}
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-(--text-secondary)">{__('Name')}</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                handleChange('name', e.target.value);
                if (isNew) handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
              }}
              className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-(--text-secondary)">{__('Slug')}</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => handleChange('slug', e.target.value)}
              className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>

        {/* Tagline */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-(--text-secondary)">{__('Tagline')}</span>
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => handleChange('tagline', e.target.value)}
            placeholder="A brief description shown to users"
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm"
          />
        </label>

        {/* System Prompt */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-(--text-secondary)">{__('System Prompt')}</span>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => handleChange('systemPrompt', e.target.value)}
            rows={6}
            placeholder="Instructions that define the character's personality, behavior, and knowledge..."
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm resize-y"
          />
        </label>

        {/* Personality (user-visible) */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-(--text-secondary)">{__('Personality (visible to users)')}</span>
          <textarea
            value={form.personality}
            onChange={(e) => handleChange('personality', e.target.value)}
            rows={3}
            placeholder="Public description of personality traits..."
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm resize-y"
          />
        </label>

        {/* Greeting */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-(--text-secondary)">{__('Greeting Message')}</span>
          <textarea
            value={form.greeting}
            onChange={(e) => handleChange('greeting', e.target.value)}
            rows={2}
            placeholder="First message when a user starts a new conversation..."
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm resize-y"
          />
        </label>

        {/* Avatar URL */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-(--text-secondary)">{__('Avatar URL')}</span>
          <input
            type="text"
            value={form.avatarUrl}
            onChange={(e) => handleChange('avatarUrl', e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm"
          />
        </label>

        {/* Model Override + Cost */}
        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-(--text-secondary)">{__('Model Override')}</span>
            <input
              type="text"
              value={form.model}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="e.g. gpt-4o"
              className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-(--text-secondary)">{__('Sort Order')}</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => handleChange('sortOrder', parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-(--text-secondary)">{__('Token Cost Multiplier')}</span>
            <input
              type="number"
              step="0.1"
              value={form.tokenCostMultiplier}
              onChange={(e) => handleChange('tokenCostMultiplier', parseFloat(e.target.value) || 1.0)}
              className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-2 text-sm"
            />
          </label>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => handleChange('isActive', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-(--text-secondary)">{__('Active (visible to users)')}</span>
        </label>
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-4 border-t border-(--border-primary)">
        <button
          onClick={handleSave}
          disabled={isSaving || !form.name || !form.slug || !form.systemPrompt}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
            'bg-brand-500 text-white hover:bg-brand-600',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isNew ? __('Create Character') : __('Save Changes')}
        </button>
      </div>
    </div>
  );
}
