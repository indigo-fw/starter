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
import { convertUTCToLocal, convertLocalToUTC } from '@/core/lib/infra/datetime';
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
import { RevisionHistory } from '@/core/components/RevisionHistory';
import { RichTextEditor } from '@/core/components/RichTextEditor';
import { shortcodeConfig } from '@/lib/shortcodes/config';
import { SEOFields } from '@/core/components/SEOFields';
import { SeoPreviewCard } from '@/core/components/SeoPreviewCard';
import { TagInput } from '@/core/components/TagInput';
import { TranslationBar } from '@/core/components/TranslationBar';

interface CategoryFormData extends Record<string, unknown> {
  name: string;
  slug: string;
  title: string;
  content: string;
  status: number;
  lang: string;
  icon: string;
  order: number;
  metaDescription: string;
  seoTitle: string;
  noindex: boolean;
  publishedAt: string;
  tagIds: string[];
  fallbackToDefault: boolean | null;
}

const categoryContentType = getContentType('category');

interface Props {
  categoryId?: string;
}

export function CategoryForm({ categoryId }: Props) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !categoryId;

  const aiTransform = useAiTransform();

  // UI-only state (not part of form data)
  const [slugManual, setSlugManual] = useState(false);

  // Fetch existing category (wait for session to avoid UNAUTHORIZED on first render)
  const existingCat = trpc.categories.get.useQuery(
    { id: categoryId! },
    { enabled: !!categoryId && !!session }
  );

  // Fetch translation siblings (edit mode only)
  const translationSiblings = trpc.categories.getTranslationSiblings.useQuery(
    { id: categoryId! },
    { enabled: !!categoryId && !!session }
  );

  const cat = existingCat.data;

  // Compute initial form data from category
  const initialFormData: CategoryFormData = useMemo(() => {
    if (!cat) {
      return {
        name: '', slug: '', title: '', content: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, icon: '', order: 0, metaDescription: '', seoTitle: '',
        noindex: false, publishedAt: '', tagIds: [], fallbackToDefault: null,
      };
    }
    return {
      name: cat.name,
      slug: cat.slug,
      title: cat.title,
      content: cat.content,
      status: cat.status,
      lang: cat.lang ?? DEFAULT_LOCALE,
      icon: cat.icon ?? '',
      order: cat.order,
      metaDescription: cat.metaDescription ?? '',
      seoTitle: cat.seoTitle ?? '',
      noindex: cat.noindex ?? false,
      publishedAt: cat.publishedAt ? convertUTCToLocal(cat.publishedAt) : '',
      tagIds: cat.tagIds ?? [],
      fallbackToDefault: cat.fallbackToDefault ?? null,
    };
  }, [cat]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<CategoryFormData>(initialFormData, 'info');

  // Sync form data when category loads
  useEffect(() => {
    if (cat) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  // Auto-generate slug from name (new categories only)
  useSlugAutoGenerate(formData.name, isNew, slugManual, (s) =>
    setFormData((prev) => ({ ...prev, slug: s }))
  );

  // Auto-fill title from name (new categories only, until user edits title)
  const [titleManual, setTitleManual] = useState(false);
  useEffect(() => {
    if (isNew && !titleManual) {
      handleChange('title', formData.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, titleManual, isNew]);

  // New hooks
  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.categories.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);

  const createCat = trpc.categories.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch((err: unknown) => {
        console.error('[CategoryForm] Failed to save custom fields', err);
      });
      toast.success(__('Category created'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
      router.push(adminPanel.cmsItem('categories', data.id));
    },
    onError: (err) => handleSaveError(err, 'Failed to create category'),
  });

  const updateCat = trpc.categories.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (categoryId) customFieldsRef.current?.save(categoryId).catch((err: unknown) => {
        console.error('[CategoryForm] Failed to save custom fields', err);
      });
      toast.success(__('Category updated'));
      utils.categories.list.invalidate();
      existingCat.refetch();
      // Post-save link validation
      validateLinks(formData.content);
    },
    onError: (err) => handleSaveError(err, 'Failed to update category'),
  });

  const isSaving = createCat.isPending || updateCat.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: 'category',
    contentId: categoryId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingCat.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!categoryId && existingCat.isLoading,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('category-form') as HTMLFormElement;
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
      createCat.mutate({
        name: formData.name,
        slug: formData.slug,
        lang: formData.lang,
        title: formData.title || formData.name,
        content: formData.content,
        status: formData.status,
        icon: formData.icon || undefined,
        order: formData.order,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
      });
    } else {
      updateCat.mutate({
        id: categoryId!,
        name: formData.name,
        slug: formData.slug,
        title: formData.title || formData.name,
        content: formData.content,
        status: formData.status,
        icon: formData.icon || null,
        order: formData.order,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
      });
    }
  }

  if (!isNew && existingCat.isLoading) {
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
            else router.push(adminPanel.cms('categories'));
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Category') : __('Edit Category')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="category-form"
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

      <BrokenLinksBanner urls={brokenLinks} onDismiss={dismissBrokenLinks} />

      <form id="category-form" onSubmit={handleSubmit}>
        <div className="category-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="category-form-main space-y-6 lg:col-span-2">
            <div className="card p-6">
              <div className="category-form-fields space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Category name')}
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
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Title')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => {
                      handleChange('title', e.target.value);
                      setTitleManual(true);
                    }}
                    className="input mt-1"
                    placeholder={__('Display title (can differ from name)')}
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Icon')}
                  </label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => handleChange('icon', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Icon name or URL')}
                  />
                </div>
              </div>
            </div>

            <div className="card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Description')}
              </label>
              <RichTextEditor
                content={formData.content}
                onChange={(v) => handleChange('content', v)}
                placeholder={__('Category description...')}
                storageKey="category"
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

            {/* SEO Preview */}
            <SeoPreviewCard
              title={formData.seoTitle || formData.name}
              description={formData.metaDescription}
              slug={formData.slug}
              urlPrefix="/category/"
            />

            {/* Custom Fields */}
            <CustomFieldsEditor
              ref={customFieldsRef}
              contentType="category"
              contentId={categoryId}
              isAuthenticated={!!session}
            />

            {/* Revision History */}
            {!isNew && categoryId && (
              <RevisionHistory
                contentType="category"
                contentId={categoryId}
                currentData={formData}
                onRestored={() => existingCat.refetch()}
              />
            )}
          </div>

          <div className="category-form-sidebar space-y-6">
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
                <div className="field-group">
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
                <div className="field-group">
                  {cat && translationSiblings.data ? (
                    <TranslationBar
                      currentLang={formData.lang}
                      translations={translationSiblings.data}
                      adminSlug="categories"
                      translationAvailable={translationAvailableQuery.data?.available ?? false}
                      locales={LOCALES}
                      localeLabels={LOCALE_LABELS}
                      editUrl={(id, _lang) => adminPanel.cmsItem('categories', id)}
                      onDuplicate={async (targetLang, autoTranslate) => {
                        const result = await duplicateAsTranslation.mutateAsync({
                          id: cat.id,
                          targetLang,
                          autoTranslate,
                        });
                        router.push(adminPanel.cmsItem('categories', result.id));
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

                {cat && (
                  <FallbackRadio
                    value={formData.fallbackToDefault}
                    onChange={(v) => handleChange('fallbackToDefault', v)}
                    ct={categoryContentType}
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
          </div>
        </div>
      </form>

      {/* Internal Link Dialog */}
      <InternalLinkDialog
        isOpen={linkPickerOpen}
        onClose={closeLinkPicker}
        onSelect={handleLinkSelect}
        typeConfig={INTERNAL_LINK_TYPE_CONFIG}
      />
    </CmsFormShell>
  );
}
