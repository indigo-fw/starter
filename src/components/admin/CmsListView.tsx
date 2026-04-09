'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Copy,
  Download,
  Settings2,
} from 'lucide-react';

import type { ContentTypeDeclaration } from '@/config/cms';
import { adminPanel } from '@/config/routes';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations, dataTranslations } from '@/lib/translations';
import { ContentStatus } from '@/core/types/cms';
import { LOCALES, LOCALE_LABELS, IS_MULTILINGUAL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { toast } from '@/store/toast-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SeoOverridesDialog } from '@/core/components/SeoOverridesDialog';
import { TaxonomyOverview } from '@/components/admin/TaxonomyOverview';
import { useListViewState, SortIcon } from '@/core/hooks/useListViewState';
import { useBulkSelection } from '@/core/hooks/useBulkSelection';
import { useBulkActions } from '@/core/hooks/useBulkActions';
import { useColumnVisibility } from '@/core/hooks/useColumnVisibility';
import BulkActionBar from '@/core/components/BulkActionBar';

const _d = dataTranslations('General');
const STATUS_LABELS: Record<number, string> = {
  [ContentStatus.DRAFT]: _d('Draft'),
  [ContentStatus.PUBLISHED]: _d('Published'),
  [ContentStatus.SCHEDULED]: _d('Scheduled'),
};

const STATUS_COLORS: Record<number, string> = {
  [ContentStatus.DRAFT]: 'bg-(--surface-secondary) text-(--text-secondary)',
  [ContentStatus.PUBLISHED]: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  [ContentStatus.SCHEDULED]: 'bg-brand-100 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400',
};

const COLUMNS = [
  { key: 'title', label: 'Title', default: true },
  { key: 'status', label: 'Status', default: true },
  { key: 'lang', label: 'Lang', default: true },
  { key: 'date', label: 'Date', default: true },
  { key: 'author', label: 'Author', default: false },
  { key: 'slug', label: 'Slug', default: false },
  { key: 'publishedAt', label: 'Published', default: false },
  { key: 'createdAt', label: 'Created', default: false },
] as const;

type StatusTab = 'all' | 'draft' | 'published' | 'scheduled' | 'trash';

const TABS = new Set<StatusTab>(['all', 'draft', 'published', 'scheduled', 'trash']);
const SORT_KEYS = new Set(['title', 'updated_at', 'published_at', 'created_at'] as const);
type SortKey = typeof SORT_KEYS extends Set<infer T> ? T : never;

interface Props {
  contentType: ContentTypeDeclaration;
}

export function CmsListView({ contentType }: Props) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { toggle: toggleColumn, isVisible: isColVisible } = useColumnVisibility(contentType.id);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const {
    searchQuery,
    debouncedSearch,
    selectedLang,
    activeTab,
    page,
    sortBy,
    sortDir,
    handleSearchChange,
    handleTabChange,
    handleLangChange,
    handlePageChange,
    toggleSort,
  } = useListViewState<StatusTab, SortKey>({
    tabs: TABS,
    sortKeys: SORT_KEYS,
    defaultTab: 'all',
    defaultSort: 'updated_at',
    locales: LOCALES,
  });

  const tab = activeTab;
  const search = debouncedSearch;
  const langFilter = selectedLang === 'all' ? '' : selectedLang;

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    permanent?: boolean;
  } | null>(null);
  const [seoDialogOpen, setSeoDialogOpen] = useState(false);

  const isPostType = contentType.postType != null;
  const isCategoryType = contentType.id === 'category';
  const isTagType = contentType.id === 'tag';
  const isPortfolioType = contentType.id === 'portfolio';
  const isShowcaseType = contentType.id === 'showcase';

  // Post queries
  const postList = trpc.cms.list.useQuery(
    {
      type: contentType.postType!,
      search: search || undefined,
      trashed: tab === 'trash',
      lang: langFilter || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: 20,
    },
    { enabled: isPostType }
  );

  const postCounts = trpc.cms.counts.useQuery(
    { type: contentType.postType! },
    { enabled: isPostType }
  );

  // Category queries
  const catList = trpc.categories.list.useQuery(
    {
      search: search || undefined,
      trashed: tab === 'trash',
      lang: langFilter || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: 20,
    },
    { enabled: isCategoryType }
  );

  const catCounts = trpc.categories.counts.useQuery(undefined, {
    enabled: isCategoryType,
  });

  // Tag queries
  const tagList = trpc.tags.list.useQuery(
    {
      search: search || undefined,
      trashed: tab === 'trash',
      lang: langFilter || undefined,
      page,
      pageSize: 20,
    },
    { enabled: isTagType }
  );

  const tagCounts = trpc.tags.counts.useQuery(undefined, {
    enabled: isTagType,
  });

  // Showcase queries
  const showcaseList = trpc.showcase.list.useQuery(
    {
      search: search || undefined,
      trashed: tab === 'trash',
      lang: langFilter || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: 20,
    },
    { enabled: isShowcaseType }
  );

  const showcaseCounts = trpc.showcase.counts.useQuery(undefined, {
    enabled: isShowcaseType,
  });

  // Portfolio queries
  const portfolioList = trpc.portfolio.list.useQuery(
    {
      search: search || undefined,
      trashed: tab === 'trash',
      lang: langFilter || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: 20,
    },
    { enabled: isPortfolioType }
  );

  const portfolioCounts = trpc.portfolio.counts.useQuery(undefined, {
    enabled: isPortfolioType,
  });

  // ── Single-item mutations ─────────────────────────────
  const deletePost = trpc.cms.delete.useMutation({
    onSuccess: () => { toast.success(__('Moved to trash')); utils.cms.list.invalidate(); utils.cms.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const restorePost = trpc.cms.restore.useMutation({
    onSuccess: () => { toast.success(__('Restored')); utils.cms.list.invalidate(); utils.cms.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeletePost = trpc.cms.permanentDelete.useMutation({
    onSuccess: () => { toast.success(__('Permanently deleted')); utils.cms.list.invalidate(); utils.cms.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const updatePostStatus = trpc.cms.updateStatus.useMutation();

  const deleteCat = trpc.categories.delete.useMutation({
    onSuccess: () => { toast.success(__('Moved to trash')); utils.categories.list.invalidate(); utils.categories.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const restoreCat = trpc.categories.restore.useMutation({
    onSuccess: () => { toast.success(__('Restored')); utils.categories.list.invalidate(); utils.categories.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeleteCat = trpc.categories.permanentDelete.useMutation({
    onSuccess: () => { toast.success(__('Permanently deleted')); utils.categories.list.invalidate(); utils.categories.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const updateCatStatus = trpc.categories.updateStatus.useMutation();

  const deleteTag = trpc.tags.delete.useMutation({
    onSuccess: () => { toast.success(__('Moved to trash')); utils.tags.list.invalidate(); utils.tags.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const restoreTag = trpc.tags.restore.useMutation({
    onSuccess: () => { toast.success(__('Restored')); utils.tags.list.invalidate(); utils.tags.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeleteTag = trpc.tags.permanentDelete.useMutation({
    onSuccess: () => { toast.success(__('Permanently deleted')); utils.tags.list.invalidate(); utils.tags.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const updateTagStatus = trpc.tags.updateStatus.useMutation();

  const deletePortfolio = trpc.portfolio.delete.useMutation({
    onSuccess: () => { toast.success(__('Moved to trash')); utils.portfolio.list.invalidate(); utils.portfolio.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const restorePortfolio = trpc.portfolio.restore.useMutation({
    onSuccess: () => { toast.success(__('Restored')); utils.portfolio.list.invalidate(); utils.portfolio.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeletePortfolio = trpc.portfolio.permanentDelete.useMutation({
    onSuccess: () => { toast.success(__('Permanently deleted')); utils.portfolio.list.invalidate(); utils.portfolio.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const updatePortfolioStatus = trpc.portfolio.updateStatus.useMutation();

  const deleteShowcase = trpc.showcase.delete.useMutation({
    onSuccess: () => { toast.success(__('Moved to trash')); utils.showcase.list.invalidate(); utils.showcase.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const restoreShowcase = trpc.showcase.restore.useMutation({
    onSuccess: () => { toast.success(__('Restored')); utils.showcase.list.invalidate(); utils.showcase.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeleteShowcase = trpc.showcase.permanentDelete.useMutation({
    onSuccess: () => { toast.success(__('Permanently deleted')); utils.showcase.list.invalidate(); utils.showcase.counts.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const updateShowcaseStatus = trpc.showcase.updateStatus.useMutation();

  // ── Duplicate mutations ─────────────────────────────
  const duplicatePost = trpc.cms.duplicate.useMutation({
    onSuccess: () => {
      toast.success(__('Duplicated'));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const duplicateCat = trpc.categories.duplicate.useMutation({
    onSuccess: () => {
      toast.success(__('Duplicated'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const duplicatePortfolio = trpc.portfolio.duplicate.useMutation({
    onSuccess: () => {
      toast.success(__('Duplicated'));
      utils.portfolio.list.invalidate();
      utils.portfolio.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const duplicateShowcase = trpc.showcase.duplicate.useMutation({
    onSuccess: () => {
      toast.success(__('Duplicated'));
      utils.showcase.list.invalidate();
      utils.showcase.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleDuplicate(id: string) {
    if (isPostType) duplicatePost.mutate({ id });
    else if (isCategoryType) duplicateCat.mutate({ id });
    else if (isPortfolioType) duplicatePortfolio.mutate({ id });
    else if (isShowcaseType) duplicateShowcase.mutate({ id });
  }

  // ── Export ──────────────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  async function handleExport(format: 'json' | 'csv') {
    setExportMenuOpen(false);
    if (!isPostType) return;
    try {
      const result = await utils.cms.exportPosts.fetch({ type: contentType.postType!, format });
      const blob = new Blob([result.data], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contentType.adminSlug}-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(__('Export failed'));
    }
  }

  // ── Bulk export ────────────────────────────────────
  async function handleBulkExport(format: 'json' | 'csv') {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    try {
      let result: { data: string; contentType: string };

      if (isPostType) {
        result = await utils.cms.exportBulk.fetch({ ids, format });
      } else if (isCategoryType) {
        result = await utils.categories.exportBulk.fetch({ ids, format });
      } else if (isPortfolioType) {
        result = await utils.portfolio.exportBulk.fetch({ ids, format });
      } else if (isShowcaseType) {
        result = await utils.showcase.exportBulk.fetch({ ids, format });
      } else {
        return; // Tags don't have export
      }

      const blob = new Blob([result.data], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contentType.adminSlug}-export-${ids.length}items.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(__._n('Exported 1 item', 'Exported {count} items', ids.length));
    } catch {
      toast.error(__('Export failed'));
    }
  }

  // SEO overrides (Pages only)
  const createSeoOverrides = trpc.cms.createMissingSeoOverrides.useMutation();
  const { data: seoStatus } = trpc.cms.getSeoOverrideStatus.useQuery(undefined, {
    enabled: !!contentType.canOverrideCodedRouteSEO,
  });
  const seoOverrideSlugs = useMemo(
    () => new Set(seoStatus?.map((s) => s.slug) ?? []),
    [seoStatus]
  );

  // MDX file overrides — show badge for content managed by .mdx files
  const { data: mdxSlugsData } = trpc.cms.mdxManagedSlugs.useQuery(
    { type: contentType.postType!, lang: langFilter || LOCALES[0] },
    { enabled: isPostType }
  );
  const mdxManagedSlugs = useMemo(
    () => new Set(mdxSlugsData ?? []),
    [mdxSlugsData]
  );

  // ── Unified data ──────────────────────────────────────
  const data = isPostType ? postList.data : isTagType ? tagList.data : isPortfolioType ? portfolioList.data : isShowcaseType ? showcaseList.data : catList.data;
  const counts = isPostType ? postCounts.data : isTagType ? tagCounts.data : isPortfolioType ? portfolioCounts.data : isShowcaseType ? showcaseCounts.data : catCounts.data;
  const isLoading = isPostType ? postList.isLoading : isTagType ? tagList.isLoading : isPortfolioType ? portfolioList.isLoading : isShowcaseType ? showcaseList.isLoading : catList.isLoading;

  const items: Array<{
    id: string;
    title: string;
    slug: string;
    status: number;
    lang: string;
    updatedAt: Date | null;
    publishedAt: Date | null;
    createdAt: Date | null;
    author: string | null;
  }> = (data?.results ?? []).map((item: Record<string, unknown>) => ({
    id: item.id as string,
    title: (item.title ?? item.name ?? '') as string,
    slug: item.slug as string,
    status: item.status as number,
    lang: item.lang as string,
    updatedAt: (item.updatedAt ?? null) as Date | null,
    publishedAt: (item.publishedAt ?? null) as Date | null,
    createdAt: (item.createdAt ?? null) as Date | null,
    author: (item.author ?? null) as string | null,
  }));

  // ── Bulk selection + actions ──────────────────────────
  const resetKey = `${tab}:${page}:${search}:${langFilter}`;
  const {
    selectedIds,
    toggle: toggleSelect,
    selectAll,
    deselectAll,
    selectedCount,
  } = useBulkSelection(resetKey);

  const bulkDeleteAsync = useCallback(
    async (input: { id: string }) => {
      if (isPostType) return deletePost.mutateAsync(input);
      if (isTagType) return deleteTag.mutateAsync(input);
      if (isPortfolioType) return deletePortfolio.mutateAsync(input);
      if (isShowcaseType) return deleteShowcase.mutateAsync(input);
      return deleteCat.mutateAsync(input);
    },
    [isPostType, isTagType, isPortfolioType, isShowcaseType, deletePost, deleteTag, deletePortfolio, deleteShowcase, deleteCat]
  );

  const bulkRestoreAsync = useCallback(
    async (input: { id: string }) => {
      if (isPostType) return restorePost.mutateAsync(input);
      if (isTagType) return restoreTag.mutateAsync(input);
      if (isPortfolioType) return restorePortfolio.mutateAsync(input);
      if (isShowcaseType) return restoreShowcase.mutateAsync(input);
      return restoreCat.mutateAsync(input);
    },
    [isPostType, isTagType, isPortfolioType, isShowcaseType, restorePost, restoreTag, restorePortfolio, restoreShowcase, restoreCat]
  );

  const bulkUpdateStatusAsync = useCallback(
    async (input: { id: string; status: number }) => {
      if (isPostType) return updatePostStatus.mutateAsync(input);
      if (isCategoryType) return updateCatStatus.mutateAsync(input);
      if (isPortfolioType) return updatePortfolioStatus.mutateAsync(input);
      if (isShowcaseType) return updateShowcaseStatus.mutateAsync(input);
      return updateTagStatus.mutateAsync(input);
    },
    [isPostType, isCategoryType, isPortfolioType, isShowcaseType, updatePostStatus, updateCatStatus, updatePortfolioStatus, updateShowcaseStatus, updateTagStatus]
  );

  const refetch = useCallback(() => {
    if (isPostType) postList.refetch();
    else if (isTagType) { tagList.refetch(); utils.tags.stats.invalidate(); }
    else if (isPortfolioType) portfolioList.refetch();
    else if (isShowcaseType) showcaseList.refetch();
    else catList.refetch();
  }, [isPostType, isTagType, isPortfolioType, isShowcaseType, postList, tagList, portfolioList, showcaseList, catList, utils.tags.stats]);

  const invalidateCounts = useCallback(() => {
    if (isPostType) utils.cms.counts.invalidate();
    else if (isTagType) utils.tags.counts.invalidate();
    else if (isPortfolioType) utils.portfolio.counts.invalidate();
    else if (isShowcaseType) utils.showcase.counts.invalidate();
    else utils.categories.counts.invalidate();
  }, [isPostType, isTagType, isPortfolioType, isShowcaseType, utils]);

  const {
    isPending: isBulkPending,
    confirmAction,
    requestBulkTrash,
    executeBulkTrash,
    executeBulkRestore,
    dismissConfirm,
    executeBulkStatusChange,
  } = useBulkActions({
    selectedIds,
    deselectAll,
    mutations: {
      deleteMutateAsync: bulkDeleteAsync,
      restoreMutateAsync: bulkRestoreAsync,
      updateMutateAsync: bulkUpdateStatusAsync,
    },
    refetch,
    invalidateCounts,
  });

  // ── Tab definitions ───────────────────────────────────
  const allTabs: { key: StatusTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: counts?.all },
    { key: 'draft', label: 'Draft', count: counts?.draft },
    { key: 'published', label: 'Published', count: counts?.published },
    { key: 'scheduled', label: 'Scheduled', count: counts?.scheduled },
    { key: 'trash', label: 'Trash', count: counts?.trash },
  ];

  // Tags don't support scheduling
  const tabs = isTagType
    ? allTabs.filter((t) => t.key !== 'scheduled')
    : allTabs;

  function handleDelete(id: string, title: string) {
    if (tab === 'trash') {
      setDeleteTarget({ id, title, permanent: true });
    } else {
      setDeleteTarget({ id, title });
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.permanent) {
      if (isPostType) permanentDeletePost.mutate({ id: deleteTarget.id });
      else if (isTagType) permanentDeleteTag.mutate({ id: deleteTarget.id });
      else if (isPortfolioType) permanentDeletePortfolio.mutate({ id: deleteTarget.id });
      else if (isShowcaseType) permanentDeleteShowcase.mutate({ id: deleteTarget.id });
      else permanentDeleteCat.mutate({ id: deleteTarget.id });
    } else {
      if (isPostType) deletePost.mutate({ id: deleteTarget.id });
      else if (isTagType) deleteTag.mutate({ id: deleteTarget.id });
      else if (isPortfolioType) deletePortfolio.mutate({ id: deleteTarget.id });
      else if (isShowcaseType) deleteShowcase.mutate({ id: deleteTarget.id });
      else deleteCat.mutate({ id: deleteTarget.id });
    }
    setDeleteTarget(null);
  }

  function handleRestore(id: string) {
    if (isPostType) restorePost.mutate({ id });
    else if (isTagType) restoreTag.mutate({ id });
    else if (isPortfolioType) restorePortfolio.mutate({ id });
    else if (isShowcaseType) restoreShowcase.mutate({ id });
    else restoreCat.mutate({ id });
  }

  function formatDate(date: Date | string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <>
      {/* Sticky header */}
      <header className="dash-header">
        <div className="dash-toolbar">
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {__(contentType.labelPlural)}
        </h1>
        <div className="list-view-actions flex flex-wrap items-center gap-2">
          {/* Column visibility dropdown */}
          <div className="relative">
            <button
              onClick={() => setColMenuOpen(!colMenuOpen)}
              className="btn btn-secondary"
              title={__('Toggle columns')}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">{__('Columns')}</span>
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
                {COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                  >
                    <input
                      type="checkbox"
                      checked={isColVisible(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-(--border-primary)"
                    />
                    {__(col.label)}
                  </label>
                ))}
              </div>
            )}
          </div>
          {/* Export dropdown (posts only) */}
          {isPostType && (
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="btn btn-secondary"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{__('Export')}</span>
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
                  <button
                    onClick={() => handleExport('json')}
                    className="block w-full px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="block w-full px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                  >
                    CSV
                  </button>
                </div>
              )}
            </div>
          )}
          {contentType.canOverrideCodedRouteSEO && (
            <button
              onClick={() => setSeoDialogOpen(true)}
              className="btn btn-secondary"
              title={__('SEO Overrides')}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{__('SEO Overrides')}</span>
            </button>
          )}
          <Link
            href={adminPanel.cmsNew(contentType.adminSlug)}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            {__('New {label}', { label: contentType.label })}
          </Link>
        </div>
        </div>
      </header>

      {/* Body */}
      <main className="dash-main">
      <div className="dash-inner">

      {/* Taxonomy overview for tags */}
      {isTagType && <div className="mb-4"><TaxonomyOverview /></div>}

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-(--border-primary)">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)'
            )}
          >
            {__(t.label)}
            {t.count != null && (
              <span className="ml-1.5 text-xs text-(--text-muted)">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search + language filter */}
      <div className="list-view-filters mt-4 flex gap-2">
        <div className="list-view-search relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={__('Search {label}...', { label: contentType.labelPlural.toLowerCase() })}
            className="search-input py-2 pl-9 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-secondary)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {IS_MULTILINGUAL && (
          <select
            value={selectedLang}
            onChange={(e) => handleLangChange(e.target.value)}
            className="filter-select w-auto shrink-0"
          >
            <option value="all">{__('All langs')}</option>
            {LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {loc.toUpperCase()}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Bulk action bar (all content types) */}
      <BulkActionBar
        selectedCount={selectedCount}
        trashed={tab === 'trash'}
        onBulkTrash={requestBulkTrash}
        onBulkRestore={executeBulkRestore}
        onBulkStatusChange={executeBulkStatusChange}
        onDeselectAll={deselectAll}
        isPending={isBulkPending}
        onBulkExport={(isPostType || isCategoryType || isPortfolioType || isShowcaseType) ? handleBulkExport : undefined}
      />

      {/* Table */}
      <div className="card mt-4 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead className="table-thead">
              <tr>
                <th className="table-th w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={() => selectAll(items.map((i) => i.id))}
                    className="rounded border-(--border-primary)"
                  />
                </th>
                {isColVisible('title') && (
                  <th
                    className="table-th cursor-pointer select-none"
                    onClick={() => toggleSort('title')}
                  >
                    <span className="inline-flex items-center gap-1">
                      {__('Title')}
                      <SortIcon col="title" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </th>
                )}
                {isColVisible('status') && (
                  <th className="table-th w-24">{__('Status')}</th>
                )}
                {IS_MULTILINGUAL && isColVisible('lang') && (
                  <th className="table-th w-20">{__('Lang')}</th>
                )}
                {isColVisible('date') && (
                  <th
                    className="table-th w-32 cursor-pointer select-none"
                    onClick={() => toggleSort('updated_at')}
                  >
                    <span className="inline-flex items-center gap-1">
                      {__('Date')}
                      <SortIcon col="updated_at" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </th>
                )}
                {isColVisible('author') && (
                  <th className="table-th w-28">{__('Author')}</th>
                )}
                {isColVisible('slug') && (
                  <th className="table-th w-40">{__('Slug')}</th>
                )}
                {isColVisible('publishedAt') && (
                  <th
                    className="table-th w-32 cursor-pointer select-none"
                    onClick={() => toggleSort('published_at')}
                  >
                    <span className="inline-flex items-center gap-1">
                      {__('Published')}
                      <SortIcon col="published_at" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </th>
                )}
                {isColVisible('createdAt') && (
                  <th
                    className="table-th w-32 cursor-pointer select-none"
                    onClick={() => toggleSort('created_at')}
                  >
                    <span className="inline-flex items-center gap-1">
                      {__('Created')}
                      <SortIcon col="created_at" sortBy={sortBy} sortDir={sortDir} />
                    </span>
                  </th>
                )}
                <th className="table-th-actions w-28" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    className="table-td py-12 text-center text-(--text-muted)"
                    colSpan={COLUMNS.filter((c) => isColVisible(c.key)).length + 2}
                  >
                    {search
                      ? __('No results found.')
                      : __('No items yet. Create your first one.')}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="table-tr cursor-pointer"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('a, button, input')) return;
                      router.push(adminPanel.cmsItem(contentType.adminSlug, item.id));
                    }}
                  >
                    <td className="table-td">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-(--border-primary)"
                      />
                    </td>
                    {isColVisible('title') && (
                      <td className="table-td">
                        <Link
                          href={adminPanel.cmsItem(contentType.adminSlug, item.id)}
                          className="font-medium text-(--text-primary) hover:text-brand-600"
                        >
                          {item.title || __('(untitled)')}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-(--text-muted)">
                          <span>
                            /{contentType.urlPrefix === '/' ? '' : contentType.urlPrefix}
                            {item.slug || __('(homepage)')}
                          </span>
                          {contentType.canOverrideCodedRouteSEO && seoOverrideSlugs.has(item.slug) && (
                            <span className="inline-block rounded bg-brand-100 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700 dark:text-brand-400">
                              {__('SEO')}
                            </span>
                          )}
                          {mdxManagedSlugs.has(item.slug) && (
                            <span className="inline-block rounded bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400" title={__('This content is managed by a .mdx file and cannot be edited from the dashboard')}>
                              {__('.mdx')}
                            </span>
                          )}
                        </p>
                      </td>
                    )}
                    {isColVisible('status') && (
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_COLORS[item.status] ?? 'bg-(--surface-secondary) text-(--text-secondary)'
                          )}
                        >
                          {__(STATUS_LABELS[item.status] ?? 'Unknown')}
                        </span>
                      </td>
                    )}
                    {IS_MULTILINGUAL && isColVisible('lang') && (
                      <td className="table-td text-xs uppercase">{item.lang}</td>
                    )}
                    {isColVisible('date') && (
                      <td className="table-td text-xs text-(--text-muted)">
                        {formatDate(item.publishedAt ?? item.updatedAt)}
                      </td>
                    )}
                    {isColVisible('author') && (
                      <td className="table-td text-xs text-(--text-muted)">
                        {item.author ?? '—'}
                      </td>
                    )}
                    {isColVisible('slug') && (
                      <td className="table-td text-xs text-(--text-muted)">
                        {item.slug || '—'}
                      </td>
                    )}
                    {isColVisible('publishedAt') && (
                      <td className="table-td text-xs text-(--text-muted)">
                        {formatDate(item.publishedAt)}
                      </td>
                    )}
                    {isColVisible('createdAt') && (
                      <td className="table-td text-xs text-(--text-muted)">
                        {formatDate(item.createdAt)}
                      </td>
                    )}
                    <td className="table-td-actions">
                      <div className="list-view-row-actions flex items-center justify-end gap-1">
                        {tab === 'trash' ? (
                          <>
                            <button
                              onClick={() => handleRestore(item.id)}
                              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-green-600"
                              title={__('Restore')}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.title)}
                              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                              title={__('Delete permanently')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            {(isPostType || isCategoryType || isPortfolioType || isShowcaseType) && (
                              <button
                                onClick={() => handleDuplicate(item.id)}
                                className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-green-600"
                                title={__('Duplicate')}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            )}
                            <Link
                              href={adminPanel.cmsItem(contentType.adminSlug, item.id)}
                              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                              title={__('Edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(item.id, item.title)}
                              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                              title={__('Trash')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="list-view-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="list-view-pagination-buttons flex gap-1">
            <button
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => handlePageChange(Math.min(data.totalPages, page + 1))}
              disabled={page >= data.totalPages}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      </div>
      </main>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={
          deleteTarget?.permanent
            ? __('Delete permanently?')
            : __('Move to trash?')
        }
        message={
          deleteTarget?.permanent
            ? __('"{title}" will be permanently deleted. This cannot be undone.', { title: deleteTarget?.title ?? '' })
            : __('"{title}" will be moved to trash.', { title: deleteTarget?.title ?? '' })
        }
        confirmLabel={deleteTarget?.permanent ? __('Delete') : __('Trash')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Bulk trash confirmation */}
      <ConfirmDialog
        open={confirmAction === 'trash'}
        title={__('Move to trash?')}
        message={__._n('1 item will be moved to trash.', '{count} items will be moved to trash.', selectedCount)}
        confirmLabel={__('Trash')}
        variant="danger"
        onConfirm={executeBulkTrash}
        onCancel={dismissConfirm}
      />

      <SeoOverridesDialog
        open={seoDialogOpen}
        onClose={() => setSeoDialogOpen(false)}
        onConfirm={(selected) => {
          createSeoOverrides.mutate(
            { routes: selected },
            {
              onSuccess: (result) => {
                setSeoDialogOpen(false);
                if (result.created > 0) {
                  toast.success(__._n('Created 1 SEO override', 'Created {count} SEO overrides', result.created));
                  utils.cms.list.invalidate();
                  utils.cms.counts.invalidate();
                } else {
                  toast.success(__('All SEO overrides already exist'));
                }
              },
              onError: (err) => toast.error(err.message),
            }
          );
        }}
        isPending={createSeoOverrides.isPending}
        locales={LOCALES}
        localeLabels={LOCALE_LABELS}
      />
    </>
  );
}
