'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

import { getContentType } from '@/config/cms';
import { adminPanel } from '@/config/routes';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';
import { ContentStatus } from '@/core/types/cms';
import { toast } from '@/store/toast-store';
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, IS_MULTILINGUAL } from '@/lib/constants';
import { convertUTCToLocal, convertLocalToUTC } from '@/core/lib/datetime';
import { useCmsFormState, narrowRecoveredData } from '@/core/hooks/useCmsFormState';
import { useSlugAutoGenerate } from '@/core/hooks/useSlugAutoGenerate';
import { useLinkPicker } from '@/core/hooks/useLinkPicker';
import { useLinkValidation } from '@/core/hooks/useLinkValidation';
import { useCmsAutosave } from '@/core/hooks/useCmsAutosave';
import { useKeyboardShortcuts } from '@/core/hooks/useKeyboardShortcuts';
import { useAiTransform } from '@/core/hooks/useAiTransform';
import AutosaveIndicator from '@/core/components/AutosaveIndicator';
import AutosaveRecoveryBanner from '@/core/components/AutosaveRecoveryBanner';
import BrokenLinksBanner from '@/core/components/BrokenLinksBanner';
import CmsFormShell from '@/core/components/CmsFormShell';
import { CustomFieldsEditor, type CustomFieldsEditorHandle } from '@/core/components/CustomFieldsEditor';
import { FallbackRadio } from '@/core/components/FallbackRadio';
import InternalLinkDialog from '@/core/components/InternalLinkDialog';
import { INTERNAL_LINK_TYPE_CONFIG } from '@/components/admin/internal-link-config';
import { MediaPickerButton } from '@/core/components/MediaPickerButton';
import { RevisionHistory } from '@/core/components/RevisionHistory';
import { RichTextEditor } from '@/core/components/RichTextEditor';
import { shortcodeConfig } from '@/lib/shortcodes/config';
import { SEOFields } from '@/core/components/SEOFields';
import { SeoPreviewCard } from '@/core/components/SeoPreviewCard';
import { TagInput } from '@/core/components/TagInput';
import { TranslationBar } from '@/core/components/TranslationBar';

interface ShowcaseFormData extends Record<string, unknown> {
  title: string;
  slug: string;
  description: string;
  cardType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  status: number;
  lang: string;
  sortOrder: number;
  metaDescription: string;
  seoTitle: string;
  noindex: boolean;
  publishedAt: string;
  tagIds: string[];
  fallbackToDefault: boolean | null;
}

const showcaseContentType = getContentType('showcase');

const CARD_TYPE_OPTIONS = [
  { value: 'video', label: 'Video Embed' },
  { value: 'image', label: 'Image' },
  { value: 'richtext', label: 'Rich Text' },
];

interface Props {
  showcaseId?: string;
}

export function ShowcaseForm({ showcaseId }: Props) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !showcaseId;

  const aiTransform = useAiTransform();
  const [slugManual, setSlugManual] = useState(false);

  const existingItem = trpc.showcase.get.useQuery(
    { id: showcaseId! },
    { enabled: !!showcaseId && !!session }
  );

  const translationSiblings = trpc.showcase.getTranslationSiblings.useQuery(
    { id: showcaseId! },
    { enabled: !!showcaseId && !!session }
  );

  const item = existingItem.data;

  const initialFormData: ShowcaseFormData = useMemo(() => {
    if (!item) {
      return {
        title: '', slug: '', description: '', cardType: 'richtext',
        mediaUrl: '', thumbnailUrl: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, sortOrder: 0, metaDescription: '', seoTitle: '',
        noindex: false, publishedAt: '', tagIds: [], fallbackToDefault: null,
      };
    }
    return {
      title: item.title,
      slug: item.slug,
      description: item.description,
      cardType: item.cardType,
      mediaUrl: item.mediaUrl ?? '',
      thumbnailUrl: item.thumbnailUrl ?? '',
      status: item.status,
      lang: item.lang ?? DEFAULT_LOCALE,
      sortOrder: item.sortOrder,
      metaDescription: item.metaDescription ?? '',
      seoTitle: item.seoTitle ?? '',
      noindex: item.noindex ?? false,
      publishedAt: item.publishedAt ? convertUTCToLocal(item.publishedAt) : '',
      tagIds: item.tagIds ?? [],
      fallbackToDefault: item.fallbackToDefault ?? null,
    };
  }, [item]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<ShowcaseFormData>(initialFormData, 'info');

  useEffect(() => {
    if (item) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  useSlugAutoGenerate(formData.title, isNew, slugManual, (s) =>
    setFormData((prev) => ({ ...prev, slug: s }))
  );

  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.showcase.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);

  const createItem = trpc.showcase.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch((err: unknown) => {
        console.error('[ShowcaseForm] Failed to save custom fields', err);
      });
      toast.success(__('Showcase item created'));
      utils.showcase.list.invalidate();
      utils.showcase.counts.invalidate();
      router.push(adminPanel.cmsItem('showcase', data.id));
    },
    onError: (err) => handleSaveError(err, 'Failed to create showcase item'),
  });

  const updateItem = trpc.showcase.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (showcaseId) customFieldsRef.current?.save(showcaseId).catch((err: unknown) => {
        console.error('[ShowcaseForm] Failed to save custom fields', err);
      });
      toast.success(__('Showcase item updated'));
      utils.showcase.list.invalidate();
      existingItem.refetch();
      validateLinks(formData.description);
    },
    onError: (err) => handleSaveError(err, 'Failed to update showcase item'),
  });

  const isSaving = createItem.isPending || updateItem.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: 'showcase',
    contentId: showcaseId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingItem.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!showcaseId && existingItem.isLoading,
  });

  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('showcase-form') as HTMLFormElement;
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
      createItem.mutate({
        title: formData.title,
        slug: formData.slug,
        lang: formData.lang,
        description: formData.description,
        cardType: formData.cardType as 'video' | 'image' | 'richtext',
        mediaUrl: formData.mediaUrl || undefined,
        thumbnailUrl: formData.thumbnailUrl || undefined,
        status: formData.status,
        sortOrder: formData.sortOrder,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
      });
    } else {
      updateItem.mutate({
        id: showcaseId!,
        title: formData.title,
        slug: formData.slug,
        description: formData.description,
        cardType: formData.cardType as 'video' | 'image' | 'richtext',
        mediaUrl: formData.mediaUrl || null,
        thumbnailUrl: formData.thumbnailUrl || null,
        status: formData.status,
        sortOrder: formData.sortOrder,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
      });
    }
  }

  if (!isNew && existingItem.isLoading) {
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
            else router.push(adminPanel.cms('showcase'));
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Showcase Item') : __('Edit Showcase Item')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="showcase-form"
          disabled={isSaving || !formData.title}
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

      <BrokenLinksBanner urls={brokenLinks} onDismiss={dismissBrokenLinks} />

      <form id="showcase-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="card p-6">
              <div className="space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Title')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Card title')}
                  />
                </div>
                <div className="field-group">
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
                  />
                </div>
              </div>
            </div>

            {/* Card Configuration */}
            <div className="card p-6">
              <h3 className="h2">{__('Card Configuration')}</h3>
              <div className="mt-4 space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Card Type')}
                  </label>
                  <select
                    value={formData.cardType}
                    onChange={(e) => handleChange('cardType', e.target.value)}
                    className="select mt-1 w-full"
                  >
                    {CARD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {__(opt.label)}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.cardType === 'video' && (
                  <div className="field-group">
                    <label className="block text-sm font-medium text-(--text-secondary)">
                      {__('Video Embed URL')}
                    </label>
                    <input
                      type="url"
                      value={formData.mediaUrl}
                      onChange={(e) => handleChange('mediaUrl', e.target.value)}
                      className="input mt-1"
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>
                )}

                {formData.cardType === 'image' && (
                  <div className="field-group">
                    <label className="block text-sm font-medium text-(--text-secondary)">
                      {__('Image URL')}
                    </label>
                    <div className="mt-1">
                      <MediaPickerButton
                        value={formData.mediaUrl || undefined}
                        onChange={(url) => handleChange('mediaUrl', url)}
                        lockFileType
                      />
                    </div>
                  </div>
                )}

                {formData.cardType === 'video' && (
                  <div className="field-group">
                    <label className="block text-sm font-medium text-(--text-secondary)">
                      {__('Thumbnail URL')}
                    </label>
                    <div className="mt-1">
                      <MediaPickerButton
                        value={formData.thumbnailUrl || undefined}
                        onChange={(url) => handleChange('thumbnailUrl', url)}
                        lockFileType
                      />
                    </div>
                  </div>
                )}

                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Sort Order')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={32767}
                    value={formData.sortOrder}
                    onChange={(e) => handleChange('sortOrder', Number(e.target.value))}
                    className="input mt-1 w-32"
                  />
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {__('Lower numbers appear first in the feed')}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Description')}
              </label>
              <RichTextEditor
                content={formData.description}
                onChange={(v) => handleChange('description', v)}
                placeholder={__('Card description...')}
                storageKey="showcase"
                onRequestLinkPicker={openLinkPicker}
                editorRef={editorRef}
                shortcodes={shortcodeConfig}
                onAiTransform={aiTransform}
              />
            </div>

            {/* SEO */}
            <div className="card p-6">
              <h3 className="h2">{__('SEO')}</h3>
              <div className="mt-4 space-y-4">
                <SEOFields
                  seoTitle={formData.seoTitle}
                  metaDescription={formData.metaDescription}
                  noindex={formData.noindex}
                  onSeoTitleChange={(v) => handleChange('seoTitle', v)}
                  onMetaDescriptionChange={(v) => handleChange('metaDescription', v)}
                  onNoindexChange={(v) => handleChange('noindex', v)}
                  fieldErrors={fieldErrors}
                />
              </div>
            </div>

            <SeoPreviewCard
              title={formData.seoTitle || formData.title}
              description={formData.metaDescription}
              slug={formData.slug}
              urlPrefix="/showcase/"
            />

            <CustomFieldsEditor
              ref={customFieldsRef}
              contentType="showcase"
              contentId={showcaseId}
              isAuthenticated={!!session}
            />

            {!isNew && showcaseId && (
              <RevisionHistory
                contentType="showcase"
                contentId={showcaseId}
                currentData={formData}
                onRestored={() => existingItem.refetch()}
              />
            )}
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div className="field-group">
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
                {IS_MULTILINGUAL && (
                <div className="field-group">
                  {item && translationSiblings.data ? (
                    <TranslationBar
                      currentLang={formData.lang}
                      translations={translationSiblings.data}
                      adminSlug="showcase"
                      translationAvailable={translationAvailableQuery.data?.available ?? false}
                      locales={LOCALES}
                      localeLabels={LOCALE_LABELS}
                      editUrl={(id, _lang) => adminPanel.cmsItem('showcase', id)}
                      onDuplicate={async (targetLang, autoTranslate) => {
                        const result = await duplicateAsTranslation.mutateAsync({
                          id: item.id,
                          targetLang,
                          autoTranslate,
                        });
                        router.push(adminPanel.cmsItem('showcase', result.id));
                      }}
                    />
                  ) : (
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
                )}

                {item && (
                  <FallbackRadio
                    value={formData.fallbackToDefault}
                    onChange={(v) => handleChange('fallbackToDefault', v)}
                    ct={showcaseContentType}
                  />
                )}

                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Publish Date')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => handleChange('publishedAt', e.target.value)}
                    className="input mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="card p-6">
              <h3 className="h2">{__('Tags')}</h3>
              <div className="mt-4">
                <TagInput
                  selectedTagIds={formData.tagIds}
                  onChange={(v) => handleChange('tagIds', v)}
                  lang={formData.lang}
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      <InternalLinkDialog
        isOpen={linkPickerOpen}
        onClose={closeLinkPicker}
        onSelect={handleLinkSelect}
        typeConfig={INTERNAL_LINK_TYPE_CONFIG}
      />

    </CmsFormShell>
  );
}
