'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, X } from 'lucide-react';

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
import AutosaveIndicator from '@/core/components/cms/AutosaveIndicator';
import AutosaveRecoveryBanner from '@/core/components/cms/AutosaveRecoveryBanner';
import BrokenLinksBanner from '@/core/components/cms/BrokenLinksBanner';
import CmsFormShell from '@/core/components/cms/CmsFormShell';
import { CustomFieldsEditor, type CustomFieldsEditorHandle } from '@/core/components/cms/CustomFieldsEditor';
import { FallbackRadio } from '@/core/components/cms/FallbackRadio';
import InternalLinkDialog from '@/core/components/overlays/InternalLinkDialog';
import { INTERNAL_LINK_TYPE_CONFIG } from '@/components/admin/internal-link-config';
import { MediaPickerButton } from '@/core/components/media/MediaPickerButton';
import { RevisionHistory } from '@/core/components/cms/RevisionHistory';
import { RichTextEditor } from '@/core/components/RichTextEditor';
import { shortcodeConfig } from '@/lib/shortcodes/config';
import { SEOFields } from '@/core/components/seo/SEOFields';
import { SeoPreviewCard } from '@/core/components/seo/SeoPreviewCard';
import { TagInput } from '@/core/components/cms/TagInput';
import { TranslationBar } from '@/core/components/i18n/TranslationBar';

interface PortfolioFormData extends Record<string, unknown> {
  name: string;
  slug: string;
  title: string;
  content: string;
  status: number;
  lang: string;
  metaDescription: string;
  seoTitle: string;
  noindex: boolean;
  publishedAt: string;
  tagIds: string[];
  fallbackToDefault: boolean | null;
  featuredImage: string;
  featuredImageAlt: string;
  clientName: string;
  projectUrl: string;
  techStack: string[];
  completedAt: string;
}

const portfolioContentType = getContentType('portfolio');

interface Props {
  portfolioId?: string;
}

export function PortfolioForm({ portfolioId }: Props) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !portfolioId;

  const aiTransform = useAiTransform();
  const [slugManual, setSlugManual] = useState(false);
  const [titleManual, setTitleManual] = useState(false);
  const [techInput, setTechInput] = useState('');


  // Fetch existing portfolio item
  const existingItem = trpc.portfolio.get.useQuery(
    { id: portfolioId! },
    { enabled: !!portfolioId && !!session }
  );

  const translationSiblings = trpc.portfolio.getTranslationSiblings.useQuery(
    { id: portfolioId! },
    { enabled: !!portfolioId && !!session }
  );

  const item = existingItem.data;

  const initialFormData: PortfolioFormData = useMemo(() => {
    if (!item) {
      return {
        name: '', slug: '', title: '', content: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, metaDescription: '', seoTitle: '',
        noindex: false, publishedAt: '', tagIds: [], fallbackToDefault: null,
        featuredImage: '', featuredImageAlt: '',
        clientName: '', projectUrl: '', techStack: [], completedAt: '',
      };
    }
    return {
      name: item.name,
      slug: item.slug,
      title: item.title,
      content: item.content,
      status: item.status,
      lang: item.lang ?? DEFAULT_LOCALE,
      metaDescription: item.metaDescription ?? '',
      seoTitle: item.seoTitle ?? '',
      noindex: item.noindex ?? false,
      publishedAt: item.publishedAt ? convertUTCToLocal(item.publishedAt) : '',
      tagIds: item.tagIds ?? [],
      fallbackToDefault: item.fallbackToDefault ?? null,
      featuredImage: item.featuredImage ?? '',
      featuredImageAlt: item.featuredImageAlt ?? '',
      clientName: item.clientName ?? '',
      projectUrl: item.projectUrl ?? '',
      techStack: item.techStack ?? [],
      completedAt: item.completedAt ? convertUTCToLocal(item.completedAt) : '',
    };
  }, [item]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<PortfolioFormData>(initialFormData, 'info');

  useEffect(() => {
    if (item) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  // Auto-generate slug from name (new portfolio items only)
  useSlugAutoGenerate(formData.name, isNew, slugManual, (s) =>
    setFormData((prev) => ({ ...prev, slug: s }))
  );

  useEffect(() => {
    if (isNew && !titleManual) {
      handleChange('title', formData.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, titleManual, isNew]);

  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.portfolio.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);

  const createItem = trpc.portfolio.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch((err: unknown) => {
        console.error('[PortfolioForm] Failed to save custom fields', err);
      });
      toast.success(__('Portfolio item created'));
      utils.portfolio.list.invalidate();
      utils.portfolio.counts.invalidate();
      router.push(adminPanel.cmsItem('portfolio', data.id));
    },
    onError: (err) => handleSaveError(err, 'Failed to create portfolio item'),
  });

  const updateItem = trpc.portfolio.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (portfolioId) customFieldsRef.current?.save(portfolioId).catch((err: unknown) => {
        console.error('[PortfolioForm] Failed to save custom fields', err);
      });
      toast.success(__('Portfolio item updated'));
      utils.portfolio.list.invalidate();
      existingItem.refetch();
      validateLinks(formData.content);
    },
    onError: (err) => handleSaveError(err, 'Failed to update portfolio item'),
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
    contentTypeId: 'portfolio',
    contentId: portfolioId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingItem.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!portfolioId && existingItem.isLoading,
  });

  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('portfolio-form') as HTMLFormElement;
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

  function addTechItem(value: string) {
    const trimmed = value.trim();
    if (trimmed && !formData.techStack.includes(trimmed)) {
      handleChange('techStack', [...formData.techStack, trimmed]);
    }
    setTechInput('');
  }

  function removeTechItem(index: number) {
    handleChange('techStack', formData.techStack.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createItem.mutate({
        name: formData.name,
        slug: formData.slug,
        lang: formData.lang,
        title: formData.title || formData.name,
        content: formData.content,
        status: formData.status,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
        featuredImage: formData.featuredImage || undefined,
        featuredImageAlt: formData.featuredImageAlt || undefined,
        clientName: formData.clientName || undefined,
        projectUrl: formData.projectUrl || undefined,
        techStack: formData.techStack.length > 0 ? formData.techStack : undefined,
        completedAt: formData.completedAt ? convertLocalToUTC(formData.completedAt) : undefined,
      });
    } else {
      updateItem.mutate({
        id: portfolioId!,
        name: formData.name,
        slug: formData.slug,
        title: formData.title || formData.name,
        content: formData.content,
        status: formData.status,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
        featuredImage: formData.featuredImage || null,
        featuredImageAlt: formData.featuredImageAlt || null,
        clientName: formData.clientName || null,
        projectUrl: formData.projectUrl || null,
        techStack: formData.techStack,
        completedAt: formData.completedAt ? convertLocalToUTC(formData.completedAt) : null,
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
            else router.push(adminPanel.cms('portfolio'));
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Portfolio Item') : __('Edit Portfolio Item')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="portfolio-form"
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

      <form id="portfolio-form" onSubmit={handleSubmit}>
        <div className="portfolio-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="portfolio-form-main space-y-6 lg:col-span-2">
            <div className="card p-6">
              <div className="portfolio-form-fields space-y-4">
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
                    placeholder={__('Project name')}
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
                    placeholder={__('Display title')}
                  />
                </div>
              </div>
            </div>

            {/* Portfolio-specific fields */}
            <div className="card p-6">
              <h3 className="h2">{__('Project Details')}</h3>
              <div className="mt-4 space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Client Name')}
                  </label>
                  <input
                    type="text"
                    value={formData.clientName}
                    onChange={(e) => handleChange('clientName', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Client or company name')}
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Project URL')}
                  </label>
                  <input
                    type="url"
                    value={formData.projectUrl}
                    onChange={(e) => handleChange('projectUrl', e.target.value)}
                    className="input mt-1"
                    placeholder="https://example.com"
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Tech Stack')}
                  </label>
                  <div className="tag-chips mt-1 flex flex-wrap gap-1.5">
                    {formData.techStack.map((tech, i) => (
                      <span
                        key={i}
                        className="tag-chip inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)] px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-400"
                      >
                        {tech}
                        <button
                          type="button"
                          onClick={() => removeTechItem(i)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && techInput.trim()) {
                        e.preventDefault();
                        addTechItem(techInput);
                      }
                    }}
                    onBlur={() => { if (techInput.trim()) addTechItem(techInput); }}
                    className="input mt-2"
                    placeholder={__('Type and press Enter or comma to add')}
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Completion Date')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.completedAt}
                    onChange={(e) => handleChange('completedAt', e.target.value)}
                    className="input mt-1"
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
                placeholder={__('Project description...')}
                storageKey="portfolio"
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
              title={formData.seoTitle || formData.name}
              description={formData.metaDescription}
              slug={formData.slug}
              urlPrefix="/portfolio/"
            />

            <CustomFieldsEditor
              ref={customFieldsRef}
              contentType="portfolio"
              contentId={portfolioId}
              isAuthenticated={!!session}
            />

            {!isNew && portfolioId && (
              <RevisionHistory
                contentType="portfolio"
                contentId={portfolioId}
                currentData={formData}
                onRestored={() => existingItem.refetch()}
              />
            )}
          </div>

          <div className="portfolio-form-sidebar space-y-6">
            {/* Featured Image */}
            <div className="card p-6">
              <h3 className="h2">{__('Featured Image')}</h3>
              <div className="mt-4">
                <MediaPickerButton
                  value={formData.featuredImage || undefined}
                  alt={formData.featuredImageAlt}
                  onChange={(url, alt) => {
                    handleChange('featuredImage', url);
                    if (alt !== undefined) handleChange('featuredImageAlt', alt);
                  }}
                  showAltInput
                  lockFileType
                />
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
                      adminSlug="portfolio"
                      translationAvailable={translationAvailableQuery.data?.available ?? false}
                      locales={LOCALES}
                      localeLabels={LOCALE_LABELS}
                      editUrl={(id, _lang) => adminPanel.cmsItem('portfolio', id)}
                      onDuplicate={async (targetLang, autoTranslate) => {
                        const result = await duplicateAsTranslation.mutateAsync({
                          id: item.id,
                          targetLang,
                          autoTranslate,
                        });
                        router.push(adminPanel.cmsItem('portfolio', result.id));
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
                    ct={portfolioContentType}
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

      <InternalLinkDialog
        isOpen={linkPickerOpen}
        onClose={closeLinkPicker}
        onSelect={handleLinkSelect}
        typeConfig={INTERNAL_LINK_TYPE_CONFIG}
      />

    </CmsFormShell>
  );
}
