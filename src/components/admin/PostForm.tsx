'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Eye, Loader2, ImageIcon, History } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import type { ContentTypeDeclaration } from '@/config/cms';
import {
  ALL_PANELS,
  DEFAULT_MAIN_ORDER,
  DEFAULT_SIDEBAR_ORDER,
  DEFAULT_HIDDEN_PANELS,
} from '@/config/post-form-panels';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { ContentStatus, PostType } from '@/core/types/cms';
import { toast } from '@/store/toast-store';
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, IS_MULTILINGUAL } from '@/lib/constants';
import { convertUTCToLocal, convertLocalToUTC } from '@/core/lib/infra/datetime';
import { useCmsFormState, narrowRecoveredData } from '@/core/hooks/useCmsFormState';
import { useSlugAutoGenerate } from '@/core/hooks/useSlugAutoGenerate';
import { useLinkPicker } from '@/core/hooks/useLinkPicker';
import { useLinkValidation } from '@/core/hooks/useLinkValidation';
import { useCmsAutosave } from '@/core/hooks/useCmsAutosave';
import { useKeyboardShortcuts } from '@/core/hooks/useKeyboardShortcuts';
import { usePreferencesStore } from '@/core/store/preferences-store';
import AutosaveIndicator from '@/core/components/cms/AutosaveIndicator';
import AutosaveRecoveryBanner from '@/core/components/cms/AutosaveRecoveryBanner';
import BrokenLinksBanner from '@/core/components/cms/BrokenLinksBanner';
import CmsFormShell from '@/core/components/cms/CmsFormShell';
import { CustomFieldsEditor, type CustomFieldsEditorHandle } from '@/core/components/cms/CustomFieldsEditor';
import { FallbackRadio } from '@/core/components/cms/FallbackRadio';
import InternalLinkDialog from '@/core/components/overlays/InternalLinkDialog';
import { INTERNAL_LINK_TYPE_CONFIG } from '@/components/admin/internal-link-config';
import { MediaPickerButton } from '@/core/components/media/MediaPickerButton';
import { MediaPickerDialog } from '@/core/components/media/MediaPickerDialog';
import { RevisionHistory } from '@/core/components/cms/RevisionHistory';
import { RichTextEditor } from '@/core/components/RichTextEditor';
import { shortcodeConfig } from '@/lib/shortcodes/config';
import { useAiTransform } from '@/core/hooks/useAiTransform';
import { SEOFields } from '@/core/components/seo/SEOFields';
import { SeoPreviewCard } from '@/core/components/seo/SeoPreviewCard';
import { TagInput } from '@/core/components/cms/TagInput';
import { TranslationBar } from '@/core/components/i18n/TranslationBar';
import { SortableFormPanel, SortableFormWrapper, FormPanel } from './SortableFormPanel';
import { PostFormConfig } from './PostFormConfig';

/** Searchable parent page picker */
function ParentPagePicker({
  pages,
  currentPageId,
  value,
  onChange,
  __,
}: {
  pages: { id: string; title: string; depth: number }[];
  currentPageId?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  __: (s: string) => string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = pages
    .filter((p) => p.id !== currentPageId)
    .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()));

  const selectedTitle = pages.find((p) => p.id === value)?.title;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input w-full text-left flex items-center justify-between"
      >
        <span className={value ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
          {selectedTitle ?? __('None (top level)')}
        </span>
        <span className="text-(--text-muted) text-xs">&#9662;</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) shadow-lg">
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={__('Search pages...')}
              className="input w-full text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                !value
                  ? 'bg-(--surface-secondary) text-(--text-primary) font-medium'
                  : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
              )}
            >
              {__('None (top level)')}
            </button>
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false); setSearch(''); }}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                  value === p.id
                    ? 'bg-(--surface-secondary) text-(--text-primary) font-medium'
                    : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
                )}
              >
                {'— '.repeat(p.depth)}{p.title}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-(--text-muted)">{__('No pages found')}</p>
            )}
          </div>
        </div>
      )}

      {/* Close on click outside */}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(''); }} />
      )}
    </div>
  );
}

/** Panels that render their own .card wrapper — use SortableFormWrapper (no double-card) */
const SELF_WRAPPING_PANELS = new Set(['custom-fields']);

/** Droppable container for main column panels */
function MainDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'main-droppable' });
  return (
    <div ref={setNodeRef} className={isOver ? 'min-h-16' : ''}>
      {children}
    </div>
  );
}

/** Droppable container for sidebar panels */
function SidebarDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'sidebar-droppable' });
  return (
    <div ref={setNodeRef} className={isOver ? 'min-h-16' : ''}>
      {children}
    </div>
  );
}

interface PostFormData extends Record<string, unknown> {
  title: string;
  slug: string;
  content: string;
  status: number;
  lang: string;
  metaDescription: string;
  seoTitle: string;
  featuredImage: string;
  featuredImageAlt: string;
  jsonLd: string;
  noindex: boolean;
  publishedAt: string;
  categoryIds: string[];
  tagIds: string[];
  parentId: string | null;
  fallbackToDefault: boolean | null;
}

interface Props {
  contentType: ContentTypeDeclaration;
  postId?: string;
}

export function PostForm({ contentType, postId }: Props) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !postId;

  // UI-only state (not part of form data)
  const [slugManual, setSlugManual] = useState(false);
  const [showContentMediaPicker, setShowContentMediaPicker] = useState(false);
  const [replaceImageCallback, setReplaceImageCallback] = useState<((url: string, alt?: string) => void) | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);

  // Fetch existing post (wait for session to avoid UNAUTHORIZED on first render)
  const existingPost = trpc.cms.get.useQuery(
    { id: postId! },
    { enabled: !!postId && !!session }
  );

  // Fetch translation siblings (edit mode only)
  const translationSiblings = trpc.cms.getTranslationSiblings.useQuery(
    { id: postId! },
    { enabled: !!postId && !!session }
  );

  // Derive lang for related queries (post lang if editing, default locale for new)
  const postLang = existingPost.data?.lang ?? DEFAULT_LOCALE;

  // Fetch published categories for the selector
  const categoriesList = trpc.categories.listPublished.useQuery(
    { lang: postLang, page: 1, pageSize: 100 },
    { enabled: !!session },
  );

  // Page tree for parent page selector (pages only)
  const isPageType = contentType.postType === PostType.PAGE;
  const pageTree = trpc.cms.getPageTree.useQuery(
    { lang: postLang },
    { enabled: isPageType && !!session }
  );

  // Revision count for Status panel link
  const revisionCount = trpc.revisions.count.useQuery(
    { contentType: contentType.id, contentId: postId! },
    { enabled: !!postId && !!session },
  );

  const post = existingPost.data;

  // Compute initial form data from post
  const initialFormData: PostFormData = useMemo(() => {
    if (!post) {
      return {
        title: '', slug: '', content: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, metaDescription: '', seoTitle: '',
        featuredImage: '', featuredImageAlt: '', jsonLd: '', noindex: false,
        publishedAt: '', categoryIds: [], tagIds: [], parentId: null,
        fallbackToDefault: null,
      };
    }
    return {
      title: post.title,
      slug: post.slug,
      content: post.content ?? '',
      status: post.status,
      lang: post.lang ?? DEFAULT_LOCALE,
      metaDescription: post.metaDescription ?? '',
      seoTitle: post.seoTitle ?? '',
      featuredImage: post.featuredImage ?? '',
      featuredImageAlt: post.featuredImageAlt ?? '',
      jsonLd: post.jsonLd ?? '',
      noindex: post.noindex ?? false,
      publishedAt: post.publishedAt ? convertUTCToLocal(post.publishedAt) : '',
      categoryIds: post.categoryIds ?? [],
      tagIds: post.tagIds ?? [],
      parentId: post.parentId ?? null,
      fallbackToDefault: post.fallbackToDefault ?? null,
    };
  }, [post]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<PostFormData>(initialFormData, 'info');

  // Sync form data when post loads
  useEffect(() => {
    if (post) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  // Auto-generate slug from title (new posts only)
  useSlugAutoGenerate(formData.title, isNew, slugManual, (s) =>
    setFormData((prev) => ({ ...prev, slug: s }))
  );

  // New hooks
  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.cms.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);
  const aiTransform = useAiTransform();

  const createPost = trpc.cms.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch((err: unknown) => {
        console.error('[PostForm] Failed to save custom fields', err);
      });
      toast.success(__('{label} created', { label: contentType.label }));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
      router.push(adminPanel.cmsItem(contentType.adminSlug, data.id));
    },
    onError: (err) => handleSaveError(err, `Failed to create ${contentType.label}`),
  });

  const updatePost = trpc.cms.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (postId) customFieldsRef.current?.save(postId).catch((err: unknown) => {
        console.error('[PostForm] Failed to save custom fields', err);
      });
      toast.success(__('{label} updated', { label: contentType.label }));
      utils.cms.list.invalidate();
      utils.revisions.count.invalidate();
      existingPost.refetch();
      // Post-save link validation
      validateLinks(formData.content);
    },
    onError: (err) => handleSaveError(err, `Failed to update ${contentType.label}`),
  });

  const isSaving = createPost.isPending || updatePost.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: contentType.id,
    contentId: postId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingPost.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!postId && existingPost.isLoading,
  });

  // Use ref so keyboard shortcut always calls the latest handlePublish
  const handlePublishRef = useRef(handlePublish);
  useEffect(() => {
    handlePublishRef.current = handlePublish;
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('post-form') as HTMLFormElement;
            form?.requestSubmit();
          },
        },
        {
          key: 'p',
          ctrl: true,
          shift: true,
          handler: () => handlePublishRef.current(),
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
      createPost.mutate({
        type: contentType.postType!,
        title: formData.title,
        slug: formData.slug,
        lang: formData.lang,
        content: formData.content,
        status: formData.status,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        featuredImage: formData.featuredImage || undefined,
        featuredImageAlt: formData.featuredImageAlt || undefined,
        jsonLd: formData.jsonLd || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        parentId: formData.parentId ?? undefined,
        categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
      });
    } else {
      updatePost.mutate({
        id: postId!,
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        status: formData.status,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        featuredImage: formData.featuredImage || null,
        featuredImageAlt: formData.featuredImageAlt || null,
        jsonLd: formData.jsonLd || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        parentId: formData.parentId,
        categoryIds: formData.categoryIds,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
      });
    }
  }

  function handlePublish() {
    handleChange('status', ContentStatus.PUBLISHED);
    if (!formData.publishedAt) {
      handleChange('publishedAt', new Date().toISOString().slice(0, 16));
    }
    setTimeout(() => {
      const form = document.getElementById('post-form') as HTMLFormElement;
      form?.requestSubmit();
    }, 0);
  }

  function toggleCategory(catId: string) {
    handleChange(
      'categoryIds',
      formData.categoryIds.includes(catId)
        ? formData.categoryIds.filter((id) => id !== catId)
        : [...formData.categoryIds, catId]
    );
  }

  // ── Panel preferences ───────────────────────────────────────
  const savedMainOrder = usePreferencesStore((s) =>
    (s.data['postForm.mainPanelOrder'] as string[] | undefined) ?? DEFAULT_MAIN_ORDER,
  );
  const savedSidebarOrder = usePreferencesStore((s) =>
    (s.data['postForm.sidebarPanelOrder'] as string[] | undefined) ?? DEFAULT_SIDEBAR_ORDER,
  );
  const hiddenPanels = usePreferencesStore((s) =>
    (s.data['postForm.hiddenPanels'] as string[] | undefined) ?? DEFAULT_HIDDEN_PANELS,
  );
  const setPreference = usePreferencesStore((s) => s.set);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // All panel IDs
  const allPanelIds = useMemo(() => ALL_PANELS.map((p) => p.id), []);

  // Build both columns together — each panel appears in exactly one column
  function buildColumns(savedMain: string[], savedSidebar: string[]): { main: string[]; sidebar: string[] } {
    const assigned = new Set<string>();
    const main: string[] = [];
    const sidebar: string[] = [];

    // First pass: add items from saved orders (main wins if in both)
    for (const id of savedMain) {
      if (allPanelIds.includes(id) && !assigned.has(id)) {
        main.push(id);
        assigned.add(id);
      }
    }
    for (const id of savedSidebar) {
      if (allPanelIds.includes(id) && !assigned.has(id)) {
        sidebar.push(id);
        assigned.add(id);
      }
    }

    // Second pass: add any new panels not in either saved order, using their default column
    for (const id of DEFAULT_MAIN_ORDER) {
      if (!assigned.has(id)) { main.push(id); assigned.add(id); }
    }
    for (const id of DEFAULT_SIDEBAR_ORDER) {
      if (!assigned.has(id)) { sidebar.push(id); assigned.add(id); }
    }

    return { main, sidebar };
  }

  // Single state object for both columns — atomic updates prevent race conditions during drag
  type Columns = { main: string[]; sidebar: string[] };
  const [columns, setColumns] = useState<Columns>(() =>
    buildColumns(savedMainOrder, savedSidebarOrder),
  );

  // Sync from preferences when changed externally (e.g. config panel)
  useEffect(() => {
    setColumns(buildColumns(savedMainOrder, savedSidebarOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMainOrder, savedSidebarOrder]);

  // Visible panels (filter hidden)
  const visibleMainIds = columns.main.filter((id) => {
    if (id === 'language' && !IS_MULTILINGUAL) return false;
    return !hiddenPanels.includes(id);
  });
  const visibleSidebarIds = columns.sidebar.filter((id) => {
    if (id === 'language' && !IS_MULTILINGUAL) return false;
    return !hiddenPanels.includes(id);
  });

  // Find which container an item is in (reads from latest state via setter)
  function findContainerIn(cols: Columns, id: string): 'main' | 'sidebar' | null {
    if (cols.main.includes(id)) return 'main';
    if (cols.sidebar.includes(id)) return 'sidebar';
    return null;
  }

  function resolveOverContainer(cols: Columns, overId: string): 'main' | 'sidebar' | null {
    if (overId === 'main-droppable') return 'main';
    if (overId === 'sidebar-droppable') return 'sidebar';
    return findContainerIn(cols, overId);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    setColumns((prev) => {
      const activeContainer = findContainerIn(prev, activeId);
      const overContainer = resolveOverContainer(prev, overId);
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

      const sourceList = prev[activeContainer].filter((id) => id !== activeId);
      const targetList = [...prev[overContainer]];

      // Insert at the position of the hovered item, or at the end
      const overIdx = targetList.indexOf(overId);
      if (overIdx >= 0) {
        targetList.splice(overIdx, 0, activeId);
      } else {
        targetList.push(activeId);
      }

      return {
        ...prev,
        [activeContainer]: sourceList,
        [overContainer]: targetList,
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    setColumns((prev) => {
      const activeContainer = findContainerIn(prev, activeId);
      if (!activeContainer) return prev;

      // Same-container reorder
      if (overId !== 'main-droppable' && overId !== 'sidebar-droppable') {
        const overContainer = findContainerIn(prev, overId);
        if (overContainer === activeContainer) {
          const list = [...prev[activeContainer]];
          const oldIdx = list.indexOf(activeId);
          const newIdx = list.indexOf(overId);
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            list.splice(oldIdx, 1);
            list.splice(newIdx, 0, activeId);
            return { ...prev, [activeContainer]: list };
          }
        }
      }
      return prev;
    });

    // Persist — read latest via setter to avoid stale closure
    setColumns((final) => {
      setPreference('postForm.mainPanelOrder', final.main);
      setPreference('postForm.sidebarPanelOrder', final.sidebar);
      return final;
    });
  }

  // Custom collision detection: try pointer-within first (for droppable containers),
  // then closest-center (for sortable items within)
  const collisionDetection = useCallback((args: Parameters<typeof closestCenter>[0]) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  }, []);

  // ── Panel renderers (all panels — any can be in either column) ──
  const panelRenderers: Record<string, () => React.ReactNode> = {
    seo: () => (
      <SEOFields
        seoTitle={formData.seoTitle}
        metaDescription={formData.metaDescription}
        noindex={formData.noindex}
        onSeoTitleChange={(v) => handleChange('seoTitle', v)}
        onMetaDescriptionChange={(v) => handleChange('metaDescription', v)}
        onNoindexChange={(v) => handleChange('noindex', v)}
        fieldErrors={fieldErrors}
      />
    ),
    'seo-preview': () => (
      <SeoPreviewCard
        title={formData.seoTitle || formData.title}
        description={formData.metaDescription}
        slug={formData.slug}
        urlPrefix={contentType.urlPrefix}
        featuredImage={formData.featuredImage || undefined}
      />
    ),
    'custom-fields': () => (
      <CustomFieldsEditor
        ref={customFieldsRef}
        contentType={contentType.id}
        contentId={postId}
        isAuthenticated={!!session}
      />
    ),
    'json-ld': () =>
      contentType.postFormFields?.jsonLd ? (
        <textarea
          value={formData.jsonLd}
          onChange={(e) => handleChange('jsonLd', e.target.value)}
          rows={6}
          className="textarea font-mono"
          placeholder='{"@context": "https://schema.org", ...}'
        />
      ) : null,
    // ── Sidebar panels ──
    language: () => (
      <div className="space-y-4">
        {post && translationSiblings.data ? (
          <TranslationBar
            currentLang={formData.lang}
            translations={translationSiblings.data}
            adminSlug={contentType.adminSlug}
            translationAvailable={translationAvailableQuery.data?.available ?? false}
            locales={LOCALES}
            localeLabels={LOCALE_LABELS}
            editUrl={(id, _lang) => adminPanel.cmsItem(contentType.adminSlug, id)}
            onDuplicate={async (targetLang, autoTranslate) => {
              const result = await duplicateAsTranslation.mutateAsync({
                id: post.id,
                targetLang,
                autoTranslate,
              });
              router.push(adminPanel.cmsItem(contentType.adminSlug, result.id));
            }}
          />
        ) : (
          <div>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Language')}
            </label>
            <select
              value={formData.lang}
              onChange={(e) => handleChange('lang', e.target.value)}
              disabled={!isNew}
              className="select mt-1 w-full disabled:bg-(--surface-secondary)"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
              ))}
            </select>
          </div>
        )}
        {post && (
          <FallbackRadio
            value={formData.fallbackToDefault}
            onChange={(v) => handleChange('fallbackToDefault', v)}
            ct={contentType}
          />
        )}
      </div>
    ),
    'parent-page': () =>
      isPageType ? (
        <ParentPagePicker
          pages={pageTree.data ?? []}
          currentPageId={postId}
          value={formData.parentId}
          onChange={(id) => handleChange('parentId', id)}
          __={__}
        />
      ) : null,
    categories: () => (
      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {categoriesList.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-(--text-muted)" />
        ) : (categoriesList.data?.results ?? []).length === 0 ? (
          <p className="text-xs text-(--text-muted)">{__('No categories yet.')}</p>
        ) : (
          (categoriesList.data?.results ?? []).map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.categoryIds.includes(cat.id)}
                onChange={() => toggleCategory(cat.id)}
                className="rounded border-(--border-primary)"
              />
              {cat.name}
            </label>
          ))
        )}
      </div>
    ),
    tags: () => (
      <TagInput
        selectedTagIds={formData.tagIds}
        onChange={(v) => handleChange('tagIds', v)}
        lang={formData.lang}
      />
    ),
    'featured-image': () =>
      contentType.postFormFields?.featuredImage ? (
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
      ) : null,
  };

  // Panel label lookup
  const panelLabels: Record<string, string> = Object.fromEntries(
    ALL_PANELS.map((p) => [p.id, __(p.label)]),
  );

  // Panels that render their own .card wrapper — use SortableFormWrapper (no double-card)

  // ── Render a sortable panel by ID ──────────────────────────
  function renderSortablePanel(id: string) {
    const render = panelRenderers[id];
    if (!render) return null;
    const content = render();
    if (content === null) return null;

    if (SELF_WRAPPING_PANELS.has(id)) {
      return (
        <SortableFormWrapper key={id} id={id}>
          {content}
        </SortableFormWrapper>
      );
    }
    return (
      <SortableFormPanel key={id} id={id} title={panelLabels[id] ?? id}>
        {content}
      </SortableFormPanel>
    );
  }

  if (!isNew && existingPost.isLoading) {
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
            else router.push(adminPanel.cms(contentType.adminSlug));
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew
            ? __('New {label}', { label: contentType.label })
            : __('Edit {label}', { label: contentType.label })}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <PostFormConfig />
        {existingPost.data?.previewToken && (
          <a
            href={`${contentType.urlPrefix}${formData.slug}?preview=${existingPost.data.previewToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            <Eye className="h-4 w-4" />
            {__('Preview')}
          </a>
        )}
        {formData.status !== ContentStatus.PUBLISHED && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSaving || !formData.title}
            className="btn btn-primary disabled:opacity-50"
          >
            {__('Publish')}
          </button>
        )}
        <button
          type="submit"
          form="post-form"
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

      <form id="post-form" onSubmit={handleSubmit}>
       <DndContext
         sensors={dndSensors}
         collisionDetection={collisionDetection}
         onDragOver={handleDragOver}
         onDragEnd={handleDragEnd}
       >
        <div className="post-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main content — 2/3 */}
          <div className="post-form-main space-y-6 lg:col-span-2">
            {/* Title + Slug */}
            <div>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="input w-full rounded-b-none text-xl font-bold"
                style={{ backgroundColor: 'var(--surface-secondary)' }}
                placeholder={__('{label} title', { label: contentType.label })}
              />
              <div
                className="flex items-center gap-1 rounded-b-[var(--radius-md)] border border-t-0 border-(--border-primary) bg-(--surface-inset) px-3 py-1.5 text-sm text-(--text-muted) focus-within:border-accent-500"
              >
                <span className="shrink-0 text-xs">/</span>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => {
                    handleChange('slug', e.target.value);
                    setSlugManual(true);
                  }}
                  className="w-full border-none bg-transparent font-mono text-sm text-(--text-muted) placeholder:text-(--text-muted) outline-none focus:text-(--text-secondary)"
                  placeholder="url-slug"
                />
              </div>
            </div>

            {/* Add Media */}
            <button
              type="button"
              onClick={() => setShowContentMediaPicker(true)}
              className="flex items-center gap-1.5 text-sm text-(--text-muted) hover:text-(--text-secondary) transition-colors"
            >
              <ImageIcon className="h-4 w-4" />
              {__('Add Media')}
            </button>

            {/* Content editor */}
            <RichTextEditor
              content={formData.content}
              onChange={(v) => handleChange('content', v)}
              placeholder={__('Start writing your content...')}
              postId={post?.id}
              storageKey={contentType.id}
              onRequestLinkPicker={openLinkPicker}
              editorRef={editorRef}
              shortcodes={shortcodeConfig}
              onAiTransform={aiTransform}
              onRequestMediaPicker={(onSelect) => {
                setReplaceImageCallback(() => onSelect);
              }}
            />

            {/* Sortable main panels (droppable target for cross-column) */}
            <MainDroppable>
              <SortableContext items={visibleMainIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-6">
                  {visibleMainIds.map((id) => renderSortablePanel(id))}
                </div>
              </SortableContext>
            </MainDroppable>
          </div>

          {/* Sidebar — 1/3 */}
          <div className="post-form-sidebar space-y-6">
            {/* Fixed: Status */}
            <FormPanel title={__('Status')}>
              <div className="space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Status')}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', Number(e.target.value))}
                    className="select mt-1 w-full"
                  >
                    <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
                    <option value={ContentStatus.PUBLISHED}>{__('Published')}</option>
                    <option value={ContentStatus.SCHEDULED}>{__('Scheduled')}</option>
                  </select>
                </div>

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

                {/* Revisions link */}
                {!isNew && postId && (
                  <button
                    type="button"
                    onClick={() => setShowRevisions(true)}
                    className="flex items-center gap-2 text-sm text-(--text-muted) hover:text-(--text-secondary) transition-colors"
                  >
                    <History className="h-4 w-4" />
                    {__('Revisions')}
                    {(revisionCount.data ?? 0) > 0 && (
                      <span className="rounded-full bg-(--surface-inset) px-2 py-0.5 text-xs">
                        {revisionCount.data}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </FormPanel>

            {/* Sortable sidebar panels (droppable target for cross-column) */}
            <SidebarDroppable>
              <SortableContext items={visibleSidebarIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-6">
                  {visibleSidebarIds.map((id) => renderSortablePanel(id))}
                </div>
              </SortableContext>
            </SidebarDroppable>
          </div>
        </div>
       </DndContext>
      </form>

      {/* Revisions Dialog */}
      {!isNew && postId && (
        <RevisionHistory
          contentType={contentType.id}
          contentId={postId}
          currentData={formData}
          onRestored={() => existingPost.refetch()}
          open={showRevisions}
          onClose={() => setShowRevisions(false)}
        />
      )}

      {/* Media Picker — Insert into Content */}
      <MediaPickerDialog
        open={showContentMediaPicker}
        onClose={() => setShowContentMediaPicker(false)}
        onSelect={(url) => {
          editorRef.current?.insertImage?.(url);
        }}
      />

      {/* Media Picker — Replace Image in Editor */}
      <MediaPickerDialog
        open={!!replaceImageCallback}
        onClose={() => setReplaceImageCallback(null)}
        onSelect={(url, alt) => {
          replaceImageCallback?.(url, alt);
          setReplaceImageCallback(null);
        }}
      />

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
