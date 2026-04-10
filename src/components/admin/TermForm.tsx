'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

import { adminPanel } from '@/config/routes';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';
import { ContentStatus } from '@/core/types/cms';
import { toast } from '@/store/toast-store';
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, IS_MULTILINGUAL } from '@/lib/constants';
import { useCmsFormState, narrowRecoveredData } from '@/core/hooks/useCmsFormState';
import { useSlugAutoGenerate } from '@/core/hooks/useSlugAutoGenerate';
import { useCmsAutosave } from '@/core/hooks/useCmsAutosave';
import { useKeyboardShortcuts } from '@/core/hooks/useKeyboardShortcuts';
import AutosaveIndicator from '@/core/components/cms/AutosaveIndicator';
import AutosaveRecoveryBanner from '@/core/components/cms/AutosaveRecoveryBanner';
import CmsFormShell from '@/core/components/cms/CmsFormShell';

interface TermFormData extends Record<string, unknown> {
  name: string;
  slug: string;
  status: number;
  lang: string;
  order: number;
}

interface Props {
  tagId?: string;
}

export function TermForm({ tagId }: Props) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !tagId;

  const [slugManual, setSlugManual] = useState(false);

  const existingTag = trpc.tags.get.useQuery(
    { id: tagId! },
    { enabled: !!tagId && !!session }
  );

  const tag = existingTag.data;

  const initialFormData: TermFormData = useMemo(() => {
    if (!tag) {
      return {
        name: '',
        slug: '',
        status: ContentStatus.PUBLISHED,
        lang: DEFAULT_LOCALE,
        order: 0,
      };
    }
    return {
      name: tag.name,
      slug: tag.slug,
      status: tag.status,
      lang: tag.lang,
      order: tag.order,
    };
  }, [tag]);

  const {
    formData, setFormData,
    handleChange, handleSaveError,
  } = useCmsFormState<TermFormData>(initialFormData, 'info');

  // Sync form data when tag loads
  useEffect(() => {
    if (tag) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  // Auto-generate slug from name (new tags only)
  useSlugAutoGenerate(formData.name, isNew, slugManual, (s) =>
    setFormData((prev) => ({ ...prev, slug: s }))
  );

  const createTag = trpc.tags.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      toast.success(__('Tag created'));
      utils.tags.list.invalidate();
      utils.tags.counts.invalidate();
      router.push(adminPanel.cmsItem('tags', data.id));
    },
    onError: (err) => handleSaveError(err, 'Failed to create tag'),
  });

  const updateTag = trpc.tags.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      toast.success(__('Tag updated'));
      utils.tags.list.invalidate();
      existingTag.refetch();
    },
    onError: (err) => handleSaveError(err, 'Failed to update tag'),
  });

  const isSaving = createTag.isPending || updateTag.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: 'tag',
    contentId: tagId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingTag.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!tagId && existingTag.isLoading,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('term-form') as HTMLFormElement;
            form?.requestSubmit();
          },
        },
      ],
      []
    )
  );

  const handleRestore = useCallback(() => {
    if (!recoveredData) return;
    setFormData(narrowRecoveredData(recoveredData.formData, initialFormData));
    setSlugManual(true);
    acceptRecovery();
  }, [recoveredData, acceptRecovery, setFormData, initialFormData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createTag.mutate({
        name: formData.name,
        slug: formData.slug,
        lang: formData.lang,
        status: formData.status,
        order: formData.order,
      });
    } else {
      updateTag.mutate({
        id: tagId!,
        name: formData.name,
        slug: formData.slug,
        status: formData.status,
        order: formData.order,
      });
    }
  }

  if (!isNew && existingTag.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  const toolbar = (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(adminPanel.cms('tags'));
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Tag') : __('Edit Tag')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="term-form"
          disabled={isSaving || !formData.name}
          className="btn btn-primary disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {__('Save')}
        </button>
      </div>
    </>
  );

  return (
    <CmsFormShell toolbar={toolbar}>
      {recoveredData && (
        <AutosaveRecoveryBanner
          savedAt={recoveredData.savedAt}
          onRestore={handleRestore}
          onDismiss={dismissRecovery}
        />
      )}

      <form id="term-form" onSubmit={handleSubmit}>
        <div className="term-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="term-form-main space-y-6 lg:col-span-2">
            <div className="card p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Tag name')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Slug')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => {
                      handleChange('slug', e.target.value);
                      setSlugManual(true);
                    }}
                    className="input mt-1 font-mono"
                    placeholder="url-slug"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="term-form-sidebar space-y-6">
            <div className="card p-6">
              <h3 className="h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', Number(e.target.value))}
                    className="select w-full"
                  >
                    <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
                    <option value={ContentStatus.PUBLISHED}>
                      {__('Published')}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Order')}
                  </label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => handleChange('order', Number(e.target.value))}
                    className="input mt-1"
                  />
                </div>
                {IS_MULTILINGUAL && (
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Language')}
                  </label>
                  <select
                    value={formData.lang}
                    disabled={!isNew}
                    onChange={(e) => handleChange('lang', e.target.value)}
                    className="select mt-1 w-full disabled:bg-(--surface-secondary)"
                  >
                    {LOCALES.map((l) => (
                      <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </CmsFormShell>
  );
}
